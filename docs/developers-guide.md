
> **This guide will teach you:**  
> How to compile your own copy of Metabase  
> How to set up a development environment  
> How to run the Metabase Server  
> How to contribute back to the Metabase project  


[![Circle CI](https://circleci.com/gh/metabase/metabase-init.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase-init)

# Install Prerequisites

These are the set of tools which are required in order to complete any build of the Metabase code.  Follow the links to download and install them on your own before continuing.

1. Oracle JDK 8 (http://www.oracle.com/technetwork/java/javase/downloads/index.html)
2. Node.js for npm (http://nodejs.org/)
3. Leiningen (http://leiningen.org/)


# Build Metabase

The entire Metabase application is compiled and assembled into a single .jar file which can run on any modern JVM.  There is a script which will execute all steps in the process and output the final artifact for you.

    ./build-uberjar

After running the build script simply look in `target/uberjar` for the output .jar file and you are ready to go.


# Development Environment

If you plan to work on the Metabase code and make changes then you'll need to understand a few more things.

### Overview

The Metabase application has two basic compnents:

1. a backend written in Clojure which contains a REST API as well as all the relevant code for talking to databases and processing queries.
2. a frontend written as a Javascript single-page application which provides the web UI.

Both components are built and assembled together into a single jar file which runs the entire application.

### 3rd party dependencies

Metabase depends on lots of other 3rd party libraries to run, so as you are developing you'll need to keep those up to date.  These don't run automatically during development, so kick them off manually when needed.

```sh
# clojure dependencies
$ lein deps
# javascript dependencies
$ npm install
```

### Development server (quick start)

Run your backend development server with

    lein ring server

Start the frontend build process with

    npm run build-hot

This will get you a full development server running on port :3000 by default.


## Frontend development
We use these technologies for our FE build process to allow us to use modules, es6 syntax, and css variables.

- webpack
- babel
- cssnext

Frontend tasks are managed by `npm`. All available tasks can be found in `package.json` under *scripts*.

To build the frontend client without watching for changes, you can use:

```sh
$ npm run build
```

If you're working on the frontend directly, you'll most likely want to reload changes on save, and in the case of React components, do so while maintaining state. To start a build with hot reloading, use:

```sh
$ npm run build-hot
```

Note that at this time if you change CSS variables, those changes will only be picked up when a build is restarted.

There is also an option to reload changes on save without hot reloading if you prefer that.

```sh
$ npm run build-watch
```

#### Unit Tests / Linting

Run unit tests with

    npm run test             # Karma
    npm run test-e2e         # Protractor

Run the linters with

    npm run lint


## Backend development
Leiningen and your REPL are the main development tools for the backend.  There are some directions below on how to setup your REPL for easier development.

And of course your Jetty development server is available via

    lein ring server


#### Unit Tests / Linting

Run unit tests with

    lein test

or a specific test with

    lein test metabase.api.session-test  

By default, the tests only run against the `h2` dataset (built-in test database). You can specify which datasets/drivers to run tests against with the env var `MB_TEST_DATASETS`:

    MB_TEST_DATASETS=h2,postgres,mysql,mongo lein test

At the time of this writing, the valid datasets are `h2`, `postgres`, `mysql`, and `mongo`.

Run the linters with

    lein eastwood                        # Clojure linters
    lein bikeshed --max-line-length 240


#### Bootstrapping (for REPL)

To quickly get your dev environment set up, use the `bootstrap` function to create a new User and Organization.
Open a REPL in Emacs or with `lein repl` and enter the following:

```clojure
(use 'metabase.db)
(setup-db)
(use 'metabase.bootstrap)
(bootstrap)
```

You'll be walked through the steps to get started.

#### API Client (for REPL)

You can make API calls from the REPL using `metabase.http-client`:

```clojure
(use 'metabase.http-client)
(defn cl [& args]
  (-> (apply client {:email "crowberto@metabase.com", :password "squawk"} args)
      clojure.pprint/pprint))
(cl :get "user/current")
;; -> {:email "crowbetro@metabase.com",
;;     :first_name "Crowbero",
;;     :last_login #inst "2015-03-13T22:55:05.390000000-00:00",
;;     ...}
```

#### Developing with Emacs

`.dir-locals.el` contains some Emacs Lisp that tells `clojure-mode` how to indent Metabase macros and which arguments are docstrings. Whenever this file is updated,
Emacs will ask you if the code is safe to load. You can answer `!` to save it as safe.

By default, Emacs will insert this code as a customization at the bottom of your `init.el`.
You'll probably want to tell Emacs to store customizations in a different file. Add the following to your `init.el`:

```emacs-lisp
(setq custom-file (concat user-emacs-directory ".custom.el")) ; tell Customize to save customizations to ~/.emacs.d/.custom.el
(ignore-errors                                                ; load customizations from ~/.emacs.d/.custom.el
  (load-file custom-file))
```

#### Checking for Out-of-Date Dependencies

    lein ancient                   # list all out-of-date dependencies
    lein ancient latest lein-ring  # list latest version of artifact lein-ring

Will give you a list of out-of-date dependencies.

Once's this repo is made public, this Clojars badge will work and show the status as well:

[![Dependencies Status](http://jarkeeper.com/metabase/metabase-init/status.png)](http://jarkeeper.com/metabase/metabase-init)


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




# Contributing

In general, we like to have an open issue for every pull request as a place to discuss the nature of any bug or proposed improvement. Each pull request should address a single issue, and contain both the fix as well as a description of how the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, it is expected that discussion will have taken place in the attached issue. Any feature that requires a major decision to be reached will need to have an explicit design document written. The goals of this document are to make explicit the assumptions, constraints and tradeoffs any given feature implementation will contain. The point is not to generate documentation but to allow discussion to reference a specific proposed design and to allow others to consider the implications of a given design.

We don't like getting sued, so for every commit we require a Linux Kernel style developer certificate. If you agree to the below terms (from http://developercertificate.org/)

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
660 York Street, Suite 102,
San Francisco, CA 94110 USA

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

Then you just add a line to every git commit message:

    Signed-off-by: Helpful Contributor <helpful.contributor@email.com>

All contributions need to be signed with your real name.

## License

Copyright © 2015 Metabase, Inc

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted.  See individual files for details.
