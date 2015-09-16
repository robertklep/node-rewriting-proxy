## Rewriting HTTP proxy

This Node.js based HTTP proxy allows you to rewrite HTTP requests and responses based on rules (*if request matches this hostname, block the request*, etc). You can also add/remove/modify content on specific pages.

### Installation

First, make sure Node and NPM [are installed](http://nodejs.org/).

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
   -t URL, --test URL                   Test an url to against the ruleset(s)
   -l LEVEL, --log-level LEVEL          Log level ("trace", "debug", "info", "warn", "error", "fatal")  [warn]
```

The proxy server doesn't daemonize (for now).

### Rule format

TBD.

For now, take a look at [this file](http://glimmerblocker.org/site/filters/default/ad-networks.xml), which is one of the default lists used by GlimmerBlocker. Most rules in there should work.
