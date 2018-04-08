import * as path from 'path';
export function usePlugin(fileName) {
    return /\.less$/i.test(fileName);
}
export function getRenderOptions(opts, sourceText, context) {
    const injectGlobalPaths = Array.isArray(opts.injectGlobalPaths) ? opts.injectGlobalPaths.slice() : [];
    let injectText = '';
    if (injectGlobalPaths.length > 0) {
        // automatically inject each of these paths into the source text
        injectText = injectGlobalPaths.map(injectGlobalPath => {
            if (!path.isAbsolute(injectGlobalPath)) {
                // convert any relative paths to absolute paths relative to the project root
                injectGlobalPath = path.join(context.config.rootDir, injectGlobalPath);
            }
            return `@import "${injectGlobalPath}";`;
        }).join('');
    }
    return {
        data: `${injectText}${sourceText}`,
        plugins: opts.plugins || []
    };
}
export function createResultsId(fileName) {
    // create what the new path is post transform (.css)
    const pathParts = fileName.split('.');
    pathParts[pathParts.length - 1] = 'css';
    return pathParts.join('.');
}
