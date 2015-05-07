[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

## Install Prerequisites

1. Oracle JDK 8 (http://www.oracle.com/technetwork/java/javase/downloads/index.html)
2. Node.js for npm (http://nodejs.org/)
3. Leiningen (http://leiningen.org/)


## Build

Install clojure + npm/bower requirements with

    lein deps
    lein npm

Build the application JS and CSS with

    lein gulp

When developing the frontend client, you'll want to watch for changes,
so run the default gulp task.

    ./node_modules/gulp/bin/gulp.js


## Usage

Then run the HTTP server with

    lein ring server


## Unit Tests / Linting

Check that the project can compile successfully with

    lein uberjar

Run the linters with

    lein eastwood                        # Clojure linters
    lein bikeshed --max-line-length 240
    ./lint_js.sh                         # JavaScript linter

Run unit tests with

    lein test

By default, the tests only run against the `generic-sql` dataset (an H2 test database).
You can run specify which datasets/drivers to run tests against with the env var `MB_TEST_DATASETS`:

    MB_TEST_DATASETS=generic-sql,mongo lein test

At the time of this writing, the valid datasets are `generic-sql` and `mongo`.


## Documentation

#### Instant Cheatsheet

Start up an instant cheatsheet for the project + dependencies by running

    lein instant-cheatsheet

#### Marginalia

Available at http://metabase.github.io/metabase-init/.

You can generate and view documentation with

    lein marg
    open ./docs/uberdoc.html

You can update the GitHub pages documentation using

    make dox

You should be on the `master` branch without any uncommited local changes before doing so. Also, make sure you've fetched the branch `gh-pages` and can push it back to `origin`.

## Migration Summary

    lein migration-summary

Will give you a list of all tables + fields in the Metabase DB.

## Bootstrapping (for Development)

To quickly get your dev environment set up, use the `bootstrap` function to create a new User and Organization.
Open a REPL in Emacs or with `lein repl` and enter the following:

```clojure
(use 'metabase.db)
(setup-db)
(use 'metabase.bootstrap)
(bootstrap)
```

You'll be walked through the steps to get started.

## API Client (for Development)

You can make API calls from the REPL using `metabase.http-client`:

```clojure
(use 'metabase.http-client)
(defn cl [& args]
  (-> (apply client {:email "crowberto@metabase.com", :password "blackjet"} args)
      clojure.pprint/pprint))
(cl :get "user/current")
;; -> {:email "crowbetro@metabase.com",
;;     :first_name "Crowbero",
;;     :last_login #inst "2015-03-13T22:55:05.390000000-00:00",
;;     ...}
```

## Developing with Emacs

`.dir-locals.el` contains some Emacs Lisp that tells `clojure-mode` how to indent Metabase macros and which arguments are docstrings. Whenever this file is updated,
Emacs will ask you if the code is safe to load. You can answer `!` to save it as safe.

By default, Emacs will insert this code as a customization at the bottom of your `init.el`.
You'll probably want to tell Emacs to store customizations in a different file. Add the following to your `init.el`:

```emacs-lisp
(setq custom-file (concat user-emacs-directory ".custom.el")) ; tell Customize to save customizations to ~/.emacs.d/.custom.el
(ignore-errors                                                ; load customizations from ~/.emacs.d/.custom.el
  (load-file custom-file))
```

## Checking for Out-of-Date Dependencies

    lein ancient                   # list all out-of-date dependencies
    lein ancient latest lein-ring  # list latest version of artifact lein-ring

Will give you a list of out-of-date dependencies.

Once's this repo is made public, this Clojars badge will work and show the status as well:

[![Dependencies Status](http://jarkeeper.com/metabase/metabase-init/status.png)](http://jarkeeper.com/metabase/metabase-init)


## License

Copyright © 2015 FIXME

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted.  See individual files for details.
