[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

## Updating this Fork

1. Checkout this repo locally `git clone ...`
2. Make sure you are on local master branch `git checkout master`
3. (one time only) Add the parent repo as a remote `git remote add upstream https://github.com/metabase/metabase-init.git`
4. (one time only) Double check your new remote is there `git remote -v` and you should see upstream in the list
5. Fetch all the changes on the upstream repo `git fetch upstream`
6. Merge the upstream master branch into your local master branch.  `git merge upstream/master` (remember, you should be in local master branch)
7. Always a good time to pause and doublecheck that the merge was sane and everything is as you expect.  Run tests, etc.
8. Push your local master back to its origin.  `git push origin master`
9. Deployment will then kick off automatically.


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

    (use 'metabase.bootstrap)
    (bootstrap)

You'll be walked through the steps to get started.

## API Client (for Development)

You can make API calls from the REPL using `metabase.http-client`:

    (use 'metabase.http-client)
    (defn cl [& args]
      (-> (apply client {:email "crowberto@metabase.com", :password "blackjet"} args)
          clojure.pprint/pprint))
    (cl :get "user/current")
    ;; -> {:email "crowbetro@metabase.com",
    ;;     :first_name "Crowbero",
    ;;     :last_login #inst "2015-03-13T22:55:05.390000000-00:00",
    ;;     ...}

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
