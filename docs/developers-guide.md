**This guide will teach you:**

*  [How to compile your own copy of Metabase](#build-metabase)
*  [How to set up a development environment](#development-environment)
*  [How to run the Metabase Server](#development-server-quick-start)
*  [How to contribute back to the Metabase project](#contributing)
*  [How to add support in Metabase for other languages](#internationalization)


# Contributing

In general, we like to have an open issue for every pull request as a place to discuss the nature of any bug or proposed improvement. Each pull request should address a single issue, and contain both the fix as well as a description of how the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, it is expected that discussion will have taken place in the attached issue. Any feature that requires a major decision to be reached will need to have an explicit design document written. The goals of this document are to make explicit the assumptions, constraints and tradeoffs any given feature implementation will contain. The point is not to generate documentation but to allow discussion to reference a specific proposed design and to allow others to consider the implications of a given design.

We don't like getting sued, so before merging any pull request, we'll need each person contributing code to sign a Contributor License Agreement [here](https://docs.google.com/a/metabase.com/forms/d/1oV38o7b9ONFSwuzwmERRMi9SYrhYeOrkbmNaq9pOJ_E/viewform)

# Development on Windows

The development scripts are designed for Linux/Mac environment, so we recommend using the latest Windows 10 version with [WSL (Windows Subsystem for Linux)](https://msdn.microsoft.com/en-us/commandline/wsl/about) and [Ubuntu on Windows](https://www.microsoft.com/store/p/ubuntu/9nblggh4msv6). The Ubuntu Bash shell works well for both backend and frontend development.

If you have problems with your development environment, make sure that you are not using any development commands outside the Bash shell. As an example, Node dependencies installed in normal Windows environment will not work inside Ubuntu Bash environment.

# Install Prerequisites

These are the set of tools which are required in order to complete any build of the Metabase code.  Follow the links to download and install them on your own before continuing.

1. [Oracle JDK 8 (http://www.oracle.com/technetwork/java/javase/downloads/index.html)](http://www.oracle.com/technetwork/java/javase/downloads/index.html)
2. [Node.js (http://nodejs.org/)](http://nodejs.org/)
3. [Yarn package manager for Node.js](https://yarnpkg.com/)
3. [Leiningen (http://leiningen.org/)](http://leiningen.org/)

If you are developing on Windows, make sure to use Ubuntu on Windows and follow instructions for Ubuntu/Linux instead of installing ordinary Windows versions.

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

### Frontend testing

All frontend tests are located in `frontend/test` directory. Run all frontend tests with

```
yarn run test
```

which will first build the backend JAR and then run integration, unit and Karma browser tests in sequence.

### Jest integration tests
Integration tests simulate realistic sequences of user interactions. They render a complete DOM tree using [Enzyme](http://airbnb.io/enzyme/docs/api/index.html) and use temporary backend instances for executing API calls.

Integration tests use an enforced file naming convention `<test-suite-name>.integ.js` to separate them from unit tests.

Useful commands:
```bash
lein run refresh-integration-test-db-metadata # Scan the sample dataset and re-run sync/classification/field values caching
yarn run test-integrated-watch # Watches for file changes and runs the tests that have changed
yarn run test-integrated-watch TestFileName # Watches the files in paths that match the given (regex) string
```

The way integration tests are written is a little unconventional so here is an example that hopefully helps in getting up to speed:

```
import {
    useSharedAdminLogin,
    createTestStore,
} from "__support__/integrated_tests";
import {
    click
} from "__support__/enzyme_utils"

import { mount } from "enzyme"

import { FETCH_DATABASES } from "metabase/redux/metadata";
import { INITIALIZE_QB } from "metabase/query_builder/actions";
import RunButton from "metabase/query_builder/components/RunButton";

describe("Query builder", () => {
    beforeAll(async () => {
        // Usually you want to test stuff where user is already logged in
        // so it is convenient to login before any test case.
        useSharedAdminLogin()
    })

    it("should let you run a new query", async () => {
        // Create a superpowered Redux store.
        // Remember `await` here!
        const store = await createTestStore()

        // Go to a desired path in the app. This is safest to do before mounting the app.
        store.pushPath('/question')

        // Get React container for the whole app and mount it using Enzyme
        const app = mount(store.getAppContainer())

        // Usually you want to wait until the page has completely loaded, and our way to do that is to
        // wait until the completion of specified Redux actions. `waitForActions` is also useful for verifying that
        // specific operations are properly executed after user interactions.
        // Remember `await` here!
        await store.waitForActions([FETCH_DATABASES, INITIALIZE_QB])

        // You can use `enzymeWrapper.debug()` to see what is the state of DOM tree at the moment
        console.log(app.debug())

        // You can use `testStore.debug()` method to see which Redux actions have been dispatched so far.
        // Note that as opposed to Enzyme's debugging method, you don't need to wrap the call to `console.log()`.
        store.debug();

        // For simulating user interactions like clicks and input events you should use methods defined
        // in `enzyme_utils.js` as they abstract away some React/Redux complexities.
        click(app.find(RunButton))

        // Note: In pretty rare cases where rendering the whole app is problematic or slow, you can just render a single
        // React container instead with `testStore.connectContainer(container)`. In that case you are not able
        // to click links that lead to other router paths.
    });
})

```

You can also skim through [`__support__/integrated_tests.js`](https://github.com/metabase/metabase/blob/master/frontend/test/__support__/integrated_tests.js) and [`__support__/enzyme_utils.js`](https://github.com/metabase/metabase/blob/master/frontend/test/__support__/enzyme_utils.js) to see all available methods.


### Jest unit tests

Unit tests are focused around isolated parts of business logic.

Unit tests use an enforced file naming convention `<test-suite-name>.unit.js` to separate them from integration tests.

```
yarn run test-unit # Run all tests at once
yarn run test-unit-watch # Watch for file changes
```

### Karma browser tests
If you need to test code which uses browser APIs that are only available in real browsers, you can add a Karma test to `frontend/test/legacy-karma` directory.

```
yarn run test-karma # Run all tests once
yarn run test-karma-watch # Watch for file changes
```

## Backend development
Leiningen and your REPL are the main development tools for the backend. There are some directions below on how to setup your REPL for easier development.

And of course your Jetty development server is available via

    lein run

To automatically load backend namespaces when files are changed, you can instead run with

    lein ring server

`lein ring server` takes significantly longer to launch than `lein run`, so if you aren't working on backend code we'd recommend sticking to launching with `lein run`.

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
do this instead if you already have a Metabase uberjar (just make sure `plugins` is in the root directory of the Metabase source, i.e. the same directory as  `project.clj`).

### Including driver source paths for development or other Leiningen tasks

For REPL-based development or when running other Leiningen tasks you can add the `include-all-drivers` profile to merge the drivers' dependencies and source paths into the Metabase
project:

```
# Find out-of-date dependencies for the core Metabase project and all drivers
# (Assuming you have the lein-ancient plugin in your ~/.lein/profiles.clj)
lein with-profiles +include-all-drivers ancient
```

When developing with Emacs and CIDER sending the universal prefix argument to `cider-jack-in` (i.e. running it with `C-u M-x cider-jack-in`) will prompt you for the command it should use
to start the NREPL process; you can add `with-profiles +include-all-drivers` to that command to include driver source paths, which will let you work on the core Metabase project and all of
the subprojects from a single REPL. :sunglasses:


#### Unit Tests / Linting

Run unit tests with

    lein test

or a specific test with

    lein test metabase.api.session-test

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `DRIVERS`:

    DRIVERS=h2,postgres,mysql,mongo lein test

Some drivers require additional environment variables when testing since they are impossible to run locally (such as Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

##### Run the linters:

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

## Internationalization
We are an application with lots of users all over the world. To help them use Metabase in their own language, we mark all of our strings as i18n.
### The general workflow for developers is:

1. Tag strings in the frontend using `t` and `jt` ES6 template literals (see more details in https://c-3po.js.org/):

```javascript
const someString = t`Hello ${name}!`;
const someJSX = <div>{ jt`Hello ${name}` }</div>
```

and in the backend using `trs` and related macros (see more details in https://github.com/puppetlabs/clj-i18n):

```clojure
(trs "Hello {0}!" name)
```

2. When you have added/edited tagged strings in the code, run `./bin/i18n/update-translations` to update the base `locales/metabase.pot` template and each existing `locales/LOCALE.po`

### The workflow for translators in starting a new translation, or editing an existing one:

1. You should run `./bin/i18n/update-translations` first to ensure the latest strings have been extracted.
2. If you're starting a new translation or didn't run update-translations then run `./bin/i18n/update-translation LOCALE`
3. Edit ./locales/LOCALE.po
4. `Run ./bin/i18n/build-translation-resources`
5. Restart or rebuild Metabase, Test, repeat 2 and 3
6. Commit changes to ./locales/LOCALE.po and ./resources/frontend_client/app/locales/LOCALE.json


To try it out, change your browser's language (e.x. chrome://settings/?search=language) to one of the locales to see it working. Run metabase with the `JAVA_TOOL_OPTIONS=-Duser.language=LOCALE` environment variable set to set the locale on the backend, e.x. for pulses and emails (eventually we'll also add a setting in the app)


## License

Copyright © 2017 Metabase, Inc

Distributed under the terms of the GNU Affero General Public License (AGPL) except as otherwise noted.  See individual files for details.
