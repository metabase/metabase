[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

## Install Prerequisites

1. Oracle JDK 8 (http://www.oracle.com/technetwork/java/javase/downloads/index.html)
2. Node.js for npm (http://nodejs.org/)
3. Leiningen (http://leiningen.org/)


## Build

Install clojure + npm/bower requirements with

    lein deps
    npm install

Compile application css file with

    ./node_modules/gulp/bin/gulp.js build


## Usage

Then run the HTTP server with

    lein ring server


## Unit Tests / Linting

Check that the project can compile successfully with

    lein check

Run the linter with

    lein eastwood

Run unit tests with

    lein expectations


## Documentation

Available at http://metabase.github.io/metabase-init/.

You can generate and view documentation with

    lein marg
	open ./docs/uberdoc.html

You can update the GitHub pages documentation using

	make dox

You should be on the `master` branch without any uncommited local changes before doing so. Also, make sure you've fetched the branch `gh-pages` and can push it back to `origin`.


## Bootstrapping (for Development)

To quickly get your dev environment set up, use the `bootstrap` function to create a new User and Organization.
Open a REPL in Emacs or with `lein repl` and enter the following:

    (use 'metabase.bootstrap)
	(bootstrap)

You'll be walked through the steps to get started.


## Checking for Out-of-Date Dependencies

    lein ancient                   # list all out-of-date dependencies
    lein ancient latest lein-ring  # list latest version of artifact lein-ring

Will give you a list of out-of-date dependencies. This requires leiningen version 2.4.0 or higher so run `lein upgrade` first if needed.
This doesn't seem to check plugins, so you'll have to do that manually using `lein ancient latest`.

Once's this repo is made public, this Clojars badge will work and show the status as well:

[![Dependencies Status](http://jarkeeper.com/metabase/metabase-init/status.png)](http://jarkeeper.com/metabase/metabase-init)


## License

Copyright © 2015 FIXME

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted.  See individual files for details.
