**This guide will teach you:**

- [How to compile your own copy of Metabase](#build-metabase)
- [How to set up a development environment](#development-environment)
- [How to run the Metabase Server](#development-server-quick-start)
- [How to contribute back to the Metabase project](#contributing)
- [How to add support in Metabase for other languages](#internationalization)

# Contributing

In general, we like to have an open issue for every pull request as a place to discuss the nature of any bug or proposed improvement. Each pull request should address a single issue, and contain both the fix as well as a description of the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, it is expected that discussion will have taken place in the attached issue. Any feature that requires a major decision to be reached will need to have an explicit design document written. The goals of this document are to make explicit the assumptions, constraints and tradeoffs any given feature implementation will contain. The point is not to generate documentation but to allow discussion to reference a specific proposed design and to allow others to consider the implications of a given design.

We don't like getting sued, so before merging any pull request, we'll need each person contributing code to sign a Contributor License Agreement [here](https://docs.google.com/a/metabase.com/forms/d/1oV38o7b9ONFSwuzwmERRMi9SYrhYeOrkbmNaq9pOJ_E/viewform).

# Development on Windows

The development scripts are designed for Linux/Mac environment, so we recommend using the latest Windows 10 version with [WSL (Windows Subsystem for Linux)](https://msdn.microsoft.com/en-us/commandline/wsl/about) and [Ubuntu on Windows](https://www.microsoft.com/store/p/ubuntu/9nblggh4msv6). The Ubuntu Bash shell works well for both backend and frontend development.

If you have problems with your development environment, make sure that you are not using any development commands outside the Bash shell. As an example, Node dependencies installed in normal Windows environment will not work inside Ubuntu Bash environment.

# Install Prerequisites

These are the tools which are required in order to complete any build of the Metabase code. Follow the links to download and install them on your own before continuing.

1. [Clojure (https://clojure.org)](https://clojure.org/guides/getting_started) - install the latest release by following the guide depending on your OS
2. [Java Development Kit JDK (https://adoptopenjdk.net/releases.html)](https://adoptopenjdk.net/releases.html) - you need to install JDK 11 ([more info on Java versions](./operations-guide/java-versions.md))
3. [Node.js (http://nodejs.org/)](http://nodejs.org/) - latest LTS release
4. [Yarn package manager for Node.js](https://yarnpkg.com/) - latest release of version 1.x - you can install it in any OS by doing `npm install --global yarn`
5. [Leiningen (http://leiningen.org/)](http://leiningen.org/) - latest release

On a most recent stable Ubuntu/Debian, all the tools above, with the exception of Clojure, can be installed by using:

```
sudo apt install openjdk-11-jdk nodejs leiningen && sudo npm install --global yarn
```
If you have multiple JDK versions installed in your machine, be sure to switch your JDK before building by doing `sudo update-alternatives --config java` and selecting Java 11 in the menu

If you are developing on Windows, make sure to use Ubuntu on Windows and follow instructions for Ubuntu/Linux instead of installing ordinary Windows versions.

Alternatively, without the need to explicitly install the above dependencies, follow the guide [on using Visual Studio Code](developers-guide-vscode.md) and its remote container support.

# Build Metabase

The entire Metabase application is compiled and assembled into a single .jar file which can run on any modern JVM. There is a script which will execute all steps in the process and output the final artifact for you. You can pass the environment variable MB_EDITION before running the build script to choose the version that you want to build. If you don't provide a value, the default is `oss` which will build the Community Edition.

    ./bin/build

After running the build script simply look in `target/uberjar` for the output .jar file and you are ready to go.

## Building `Metabase.app`

See [this guide](developers-guide-osx.md).

# Development Environment

If you plan to work on the Metabase code and make changes then you'll need to understand a few more things.

### Overview

The Metabase application has two basic components:

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

    lein run

Start the frontend build process with

    yarn build-hot

## Frontend development

We use these technologies for our FE build process to allow us to use modules, es6 syntax, and css variables.

- webpack
- babel
- cssnext

Frontend tasks are executed using `yarn`. All available tasks can be found in `package.json` under _scripts_.

To build the frontend client without watching for changes, you can use:

```sh
$ yarn build
```

If you're working on the frontend directly, you'll most likely want to reload changes on save, and in the case of React components, do so while maintaining state. To start a build with hot reloading, use:

```sh
$ yarn build-hot
```

Note that at this time if you change CSS variables, those changes will only be picked up when a build is restarted.

There is also an option to reload changes on save without hot reloading if you prefer that.

```sh
$ yarn build-watch
```

Some systems may have trouble detecting changes to frontend files. You can enable filesystem polling by uncommenting the `watchOptions` clause in `webpack.config.js`. If you do this it may be worth making git ignore changes to webpack config, using `git update-index --assume-unchanged webpack.config.js`

### Frontend testing

All frontend tests are located in `frontend/test` directory. Run all frontend tests with

```
yarn test
```

which will run unit and Cypress end-to-end tests in sequence.

### Cypress end-to-end tests

End-to-end tests simulate realistic sequences of user interactions. Read more about how we approach end-to-end testing with Cypress in our [wiki page](https://github.com/metabase/metabase/wiki/E2E-Tests-with-Cypress).

Cypress end-to-end tests use an enforced file naming convention `<test-suite-name>.cy.spec.js` to separate them from unit tests.

### Jest unit tests

Unit tests are focused around isolated parts of business logic.

Unit tests use an enforced file naming convention `<test-suite-name>.unit.spec.js` to separate them from end-to-end tests.

```
yarn test-unit # Run all tests at once
yarn test-unit-watch # Watch for file changes
```

## Backend development

Leiningen and your REPL are the main development tools for the backend. There are some directions below on how to setup your REPL for easier development.

And of course your Jetty development server is available via

    lein run

### Building drivers

Most of the drivers Metabase uses to connect to external data warehouse databases are separate Leiningen projects under the `modules/` subdirectory. When running Metabase via `lein`, you'll
need to build these drivers in order to have access to them. You can build drivers as follows:

```
# Build the 'mongo' driver
./bin/build-driver.sh mongo
```

(or)

```
# Build all drivers
./bin/build-drivers.sh
```

The first time you build a driver, it will be a bit slow, because Metabase needs to build the core project a couple of times so the driver can use it as a dependency; you can take comfort in the
fact that you won't need to build the driver again after that. Alternatively, running Metabase 1.0+ from the uberjar will unpack all of the pre-built drivers into your plugins directory; you can
do this instead if you already have a Metabase uberjar (just make sure `plugins` is in the root directory of the Metabase source, i.e. the same directory as `project.clj`).

### Including driver source paths for development or other Leiningen tasks

For development when running various Leiningen tasks you can add the `include-all-drivers` profile to merge the drivers' dependencies and source paths into the Metabase
project:

```
# Install dependencies
lein with-profiles +include-all-drivers deps
```

This profile is added by default when running `lein repl`, tests, and linters.

#### Unit Tests / Linting

Run unit tests with

    lein test

or a specific test with

    lein test metabase.api.session-test

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `DRIVERS`:

    DRIVERS=h2,postgres,mysql,mongo lein test

Some drivers require additional environment variables when testing since they are impossible to run locally (such as Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

##### Run the linters:

    lein eastwood && lein bikeshed && lein docstring-checker && lein check-namespace-decls && ./bin/reflection-linter

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

## Internationalization

We are an application with lots of users all over the world. To help them use Metabase in their own language, we mark all of our strings as i18n.

### Adding new strings:

If you need to add new strings (try to be judicious about adding copy) do the following:

1. Tag strings in the frontend using `t` and `jt` ES6 template literals (see more details in https://ttag.js.org/):

```javascript
const someString = t`Hello ${name}!`;
const someJSX = <div>{jt`Hello ${name}`}</div>;
```

and in the backend using `trs` (to use the site language) or `tru` (to use the current User's language):

```clojure
(trs "Hello {0}!" name)
```

### Translation errors or missing strings

If you see incorrect or missing strings for your language, please visit our [POEditor project](https://poeditor.com/join/project/ynjQmwSsGh) and submit your fixes there.

## License

Copyright © 2021 Metabase, Inc.

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted. See individual files for details.
