**This guide will teach you:**

*  [How to compile your own copy of Metabase](#build-metabase)
*  [How to set up a development environment](#development-environment)
*  [How to run the Metabase Server](#development-server-quick-start)
*  [How to contribute back to the Metabase project](#contributing)


# Contributing

In general, we like to have an open issue for every pull request as a place to discuss the nature of any bug or proposed improvement. Each pull request should address a single issue, and contain both the fix as well as a description of how the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, it is expected that discussion will have taken place in the attached issue. Any feature that requires a major decision to be reached will need to have an explicit design document written. The goals of this document are to make explicit the assumptions, constraints and tradeoffs any given feature implementation will contain. The point is not to generate documentation but to allow discussion to reference a specific proposed design and to allow others to consider the implications of a given design.

We don't like getting sued, so before merging any pull request, we'll need each person contributing code to sign a Contributor License Agreement [here](https://docs.google.com/a/metabase.com/forms/d/1oV38o7b9ONFSwuzwmERRMi9SYrhYeOrkbmNaq9pOJ_E/viewform)


# Install Prerequisites

These are the set of tools which are required in order to complete any build of the Metabase code.  Follow the links to download and install them on your own before continuing.

1. [Oracle JDK 8 (http://www.oracle.com/technetwork/java/javase/downloads/index.html)](http://www.oracle.com/technetwork/java/javase/downloads/index.html)
2. [Node.js (http://nodejs.org/)](http://nodejs.org/)
3. [Yarn package manager for Node.js](https://yarnpkg.com/)
3. [Leiningen (http://leiningen.org/)](http://leiningen.org/)


# Build Metabase

The entire Metabase application is compiled and assembled into a single .jar file which can run on any modern JVM.  There is a script which will execute all steps in the process and output the final artifact for you.

    ./bin/build

After running the build script simply look in `target/uberjar` for the output .jar file and you are ready to go.

## Building `Metabase.app`

See [this guide](developers-guide-osx.md).


# Development Environment

If you plan to work on the Metabase code and make changes then you'll need to understand a few more things.

### Overview

The Metabase application has two basic compnents:

1. a backend written in Clojure which contains a REST API as well as all the relevant code for talking to databases and processing queries.
2. a frontend written as a Javascript single-page application which provides the web UI.

Both components are built and assembled together into a single jar file which runs the entire application.

### 3rd party dependencies

Metabase depends on lots of other 3rd party libraries to run, so as you are developing you'll need to keep those up to date. Leiningen will automatically fetch Clojure dependencies when needed, but for JavaScript dependencies you'll need to kick off the installation process manually when needed.

```sh
# javascript dependencies
$ yarn
```

### Development server (quick start)

Run your backend development server with

    lein ring server

Start the frontend build process with

    yarn run build-hot

This will get you a full development server running on port :3000 by default.


## Frontend development
We use these technologies for our FE build process to allow us to use modules, es6 syntax, and css variables.

- webpack
- babel
- cssnext

Frontend tasks are executed using `yarn run`. All available tasks can be found in `package.json` under *scripts*.

To build the frontend client without watching for changes, you can use:

```sh
$ yarn run build
```

If you're working on the frontend directly, you'll most likely want to reload changes on save, and in the case of React components, do so while maintaining state. To start a build with hot reloading, use:

```sh
$ yarn run build-hot
```

Note that at this time if you change CSS variables, those changes will only be picked up when a build is restarted.

There is also an option to reload changes on save without hot reloading if you prefer that.

```sh
$ yarn run build-watch
```

#### Unit Tests / Linting

Run unit tests with

    yarn run jest             # Jest
    yarn run test             # Karma

Run the linters and type checker with

    yarn run lint
    yarn run flow

#### End-to-end tests

End-to-end tests are written with [webschauffeur](https://github.com/metabase/webchauffeur) which is a wrapper around [`selenium-webdriver`](https://www.npmjs.com/package/selenium-webdriver). 

Generate the Metabase jar file which is used in E2E tests:

    ./bin/build

Run E2E tests once with

    yarn run test-e2e

or use a persistent browser session with

    yarn run test-e2e-dev

## Backend development
Leiningen and your REPL are the main development tools for the backend.  There are some directions below on how to setup your REPL for easier development.

And of course your Jetty development server is available via

    lein ring server


#### Unit Tests / Linting

Run unit tests with

    lein test

or a specific test with

    lein test metabase.api.session-test

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `ENGINES`:

    ENGINES=h2,postgres,mysql,mongo lein test

At the time of this writing, the valid engines are `h2`, `postgres`, `mysql`, `mongo`, `sqlserver`, `sqlite`, `druid`, `bigquery`, and `redshift`. Some of these engines require additional parameters
when testing since they are impossible to run locally (such as Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

Run the linters:

    lein eastwood && lein bikeshed && lein docstring-checker && ./bin/reflection-linter


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

## Documentation

#### Instant Cheatsheet

Start up an instant cheatsheet for the project + dependencies by running

    lein instant-cheatsheet

## License

Copyright © 2016 Metabase, Inc

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted.  See individual files for details.
