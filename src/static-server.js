var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs")
    port = process.argv[2] || 8888,
    mimeTypes = {
        "html": "text/html",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "svg": "image/svg+xml",
        "json": "application/json",
        "js": "text/javascript",
        "mjs": "text/javascript",
        "css": "text/css"
    };
 
http.createServer(function(request, response) {
    if (path.normalize(decodeURI(request.url)) !== decodeURI(request.url)) {
        response.statusCode = 403;
        response.end();
        return;
    }
    let uri = "";
    if (request.url.startsWith('/'))
        uri = request.url
    else uri = new URL(request.url).pathname
    let filename = path.join(process.cwd(), uri);
    console.log('fetching', uri)

    if (!fs.existsSync(filename)) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.write("404 Not Found\n");
        response.end();
        return;
    }

    if (fs.statSync(filename).isDirectory()) 
        filename += '/index.html';

    fs.readFile(filename, "binary", function(err, file) {
        if(err) {        
            response.writeHead(500, {"Content-Type": "text/plain"});
            response.write(err + "\n");
            response.end();
            return;
        }

        var mimeType = "";
        if (filename.endsWith('-js'))
            mimeType = mimeTypes['js']
        else mimeType = mimeTypes[filename.split('.').pop()];
        if (!mimeType)
            mimeType = 'text/plain';
    
        response.writeHead(200, { "Content-Type": mimeType });
        response.write(file, "binary");
        response.end();
    });
}).listen(parseInt(port, 10));

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");
