## Rewriting HTTP proxy

This Node.js based HTTP proxy allows

### Installation

First, make sure Node and NPM [are installed](http://nodejs.org/). Tested with Node 0.10.29.

Next, install directly from the GitHub repository:

```
[sudo] npm install robertklep/node-rewriting-proxy -g
```

`sudo` may or may not be necessary. Try without first, you may already have the right permissions to write to the global installation path.

### Configuration

The proxy can be configured using XML-based rules files. I know XML is a bother, but there's two reasons for using it:

1. Rules contain properties that aren't (easily) serializable to something like JSON (regular expressions, JS functions);
2. I initially created this proxy as a replacement for [GlimmerBlocker](http://glimmerblocker.org/), and it should be compatible with the GlimmerBlocker filter format;

Because of GlimmerBlocker compatibility, most [GB filters](http://glimmerblocker.org/wiki/Filters) will work, although the modifying filters may require some rewriting.

By default, the proxy looks for rules files in `$HOME/.node-rewriting-proxy/` (all `*.xml` files will be processed).

### Running

```
$ node-rewriting-proxy -h

Usage: node-rewriting-proxy [options]

Options:
   -p PORT, --port PORT                 Port to listen on  [8228]
   -H HOST, --host HOST                 Host to listen on  [0.0.0.0]
   -d DIRECTORY, --rule-dir DIRECTORY   Directory where rules files reside  [$HOME/.node-rewriting-proxy]
   -l LEVEL, --log-level LEVEL          Log level ("trace", "debug", "info", "warn", "error", "fatal")  [warn]
```

The proxy server doesn't daemonize (for now).
