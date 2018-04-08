import { isAbsolute, join } from 'path';
import { render } from 'less';

function loadDiagnostic(context, lessError, filePath) {
    if (!lessError || !context) {
        return;
    }
    const diagnostic = {
        level: 'error',
        type: 'less',
        language: 'less',
        header: 'less error',
        code: lessError.status && lessError.status.toString(),
        relFilePath: null,
        absFilePath: null,
        messageText: lessError.message,
        lines: []
    };
    if (filePath) {
        diagnostic.absFilePath = filePath;
        diagnostic.relFilePath = formatFileName(context.config.rootDir, diagnostic.absFilePath);
        diagnostic.header = formatHeader('less', diagnostic.absFilePath, context.config.rootDir, lessError.line);
        if (lessError.line > -1) {
            try {
                const sourceText = context.fs.readFileSync(diagnostic.absFilePath);
                const srcLines = sourceText.split(/(\r?\n)/);
                const errorLine = {
                    lineIndex: lessError.line - 1,
                    lineNumber: lessError.line,
                    text: srcLines[lessError.line - 1],
                    errorCharStart: lessError.column,
                    errorLength: 0
                };
                for (let i = errorLine.errorCharStart; i >= 0; i--) {
                    if (STOP_CHARS.indexOf(errorLine.text.charAt(i)) > -1) {
                        break;
                    }
                    errorLine.errorCharStart = i;
                }
                for (let j = errorLine.errorCharStart; j <= errorLine.text.length; j++) {
                    if (STOP_CHARS.indexOf(errorLine.text.charAt(j)) > -1) {
                        break;
                    }
                    errorLine.errorLength++;
                }
                if (errorLine.errorLength === 0 && errorLine.errorCharStart > 0) {
                    errorLine.errorLength = 1;
                    errorLine.errorCharStart--;
                }
                diagnostic.lines.push(errorLine);
                if (errorLine.lineIndex > 0) {
                    const previousLine = {
                        lineIndex: errorLine.lineIndex - 1,
                        lineNumber: errorLine.lineNumber - 1,
                        text: srcLines[errorLine.lineIndex - 1],
                        errorCharStart: -1,
                        errorLength: -1
                    };
                    diagnostic.lines.unshift(previousLine);
                }
                if (errorLine.lineIndex + 1 < srcLines.length) {
                    const nextLine = {
                        lineIndex: errorLine.lineIndex + 1,
                        lineNumber: errorLine.lineNumber + 1,
                        text: srcLines[errorLine.lineIndex + 1],
                        errorCharStart: -1,
                        errorLength: -1
                    };
                    diagnostic.lines.push(nextLine);
                }
            }
            catch (e) {
                console.error(`StyleLessPlugin loadDiagnostic, ${e}`);
            }
        }
    }
    context.diagnostics.push(diagnostic);
}
function formatFileName(rootDir, fileName) {
    if (!rootDir || !fileName)
        return '';
    fileName = fileName.replace(rootDir, '');
    if (/\/|\\/.test(fileName.charAt(0))) {
        fileName = fileName.substr(1);
    }
    if (fileName.length > 80) {
        fileName = '...' + fileName.substr(fileName.length - 80);
    }
    return fileName;
}
function formatHeader(type, fileName, rootDir, startLineNumber = null, endLineNumber = null) {
    let header = `${type}: ${formatFileName(rootDir, fileName)}`;
    if (startLineNumber !== null && startLineNumber > 0) {
        if (endLineNumber !== null && endLineNumber > startLineNumber) {
            header += `, lines: ${startLineNumber} - ${endLineNumber}`;
        }
        else {
            header += `, line: ${startLineNumber}`;
        }
    }
    return header;
}
const STOP_CHARS = ['', '\n', '\r', '\t', ' ', ':', ';', ',', '{', '}', '.', '#', '@', '!', '[', ']', '(', ')', '&', '+', '~', '^', '*', '$'];

function usePlugin(fileName) {
    return /\.less$/i.test(fileName);
}
function getRenderOptions(opts, sourceText, context) {
    const injectGlobalPaths = Array.isArray(opts.injectGlobalPaths) ? opts.injectGlobalPaths.slice() : [];
    let injectText = '';
    if (injectGlobalPaths.length > 0) {
        // automatically inject each of these paths into the source text
        injectText = injectGlobalPaths.map(injectGlobalPath => {
            if (!isAbsolute(injectGlobalPath)) {
                // convert any relative paths to absolute paths relative to the project root
                injectGlobalPath = join(context.config.rootDir, injectGlobalPath);
            }
            return `@import "${injectGlobalPath}";`;
        }).join('');
    }
    return {
        data: `${injectText}${sourceText}`,
        plugins: opts.plugins || []
    };
}
function createResultsId(fileName) {
    // create what the new path is post transform (.css)
    const pathParts = fileName.split('.');
    pathParts[pathParts.length - 1] = 'css';
    return pathParts.join('.');
}

module.exports = function less(opts = {}) {
    return {
        transform: function (sourceText, fileName, context) {
            if (!context || !usePlugin(fileName)) {
                return null;
            }
            const renderOpts = getRenderOptions(opts, sourceText, context);
            const results = {
                id: createResultsId(fileName)
            };
            if (sourceText.trim() === '') {
                results.code = '';
                return Promise.resolve(results);
            }
            return new Promise(resolve => {
                render(renderOpts.data, {
                    plugins: renderOpts.plugins,
                    filename: fileName
                }, (err, lessResult) => {
                    if (err) {
                        loadDiagnostic(context, err, fileName);
                        results.code = `/**  less error${err && err.message ? ': ' + err.message : ''}  **/`;
                        resolve(results);
                    }
                    else {
                        results.code = lessResult.css.toString();
                        // write this css content to memory only so it can be referenced
                        // later by other plugins (autoprefixer)
                        // but no need to actually write to disk
                        context.fs.writeFile(results.id, results.code, { inMemoryOnly: true }).then(() => {
                            resolve(results);
                        });
                    }
                });
            });
        },
        name: 'less',
    };
};
