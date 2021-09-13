# Development Environment

If you plan to work on the Metabase code and make changes then you'll need to understand a few more things.

## Overview

The Metabase application has two basic components:

1. a backend written in Clojure which contains a REST API as well as all the relevant code for talking to databases and processing queries.
2. a frontend written as a Javascript single-page application which provides the web UI.

Both components are built and assembled together into a single jar file which runs the entire application.

## 3rd party dependencies

Metabase depends on lots of other 3rd party libraries to run, so as you are developing you'll need to keep those up to date. Leiningen will automatically fetch Clojure dependencies when needed, but for JavaScript dependencies you'll need to kick off the installation process manually when needed.

```sh
# javascript dependencies
$ yarn
```

## Development server (quick start)

Run your backend development server with

    clojure -M:run

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

## Frontend testing

All frontend tests are located in `frontend/test` directory. Run all frontend tests with

```
yarn test
```

which will run unit and Cypress end-to-end tests in sequence.

## Frontend debugging

By default, we use a simple source mapping option that is optimized for speed.

If you run into issues with breakpoints, especially inside jsx, please set env variable `BETTER_SOURCE_MAPS` to true before you run the server.

Example:

```
BETTER_SOURCE_MAPS=true yarn dev
```

### Cypress end-to-end tests

End-to-end tests simulate realistic sequences of user interactions. Read more about how we approach [end-to-end testing with Cypress](./e2e-tests.md).

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

    clojure -M:run

### Building drivers

Most of the drivers Metabase uses to connect to external data warehouse databases are separate projects under the
`modules/` subdirectory. When running Metabase via `clojure`, you'll need to build these drivers in order to have access
to them. You can build drivers as follows:

```
# Build the 'mongo' driver
./bin/build-driver.sh mongo
```

(or)

```
# Build all drivers
./bin/build-drivers.sh
```

### Including driver source paths for development or other tasks

For development when running various Leiningen tasks you can add the `drivers` and `drivers-dev` aliases to merge the
drivers' dependencies and source paths into the Metabase project:

```
# Install dependencies, including for drivers
clojure -P -X:dev:ci:drivers:drivers-dev
```

#### Unit Tests / Linting

Run unit tests with

    # OSS tests only
    clojure -X:dev:test

    # OSS + EE tests
    clojure -X:dev:ee:ee-dev:test

or a specific test (or test namespace) with

    # run tests in only one namespace (pass in a symbol)
    clojure -X:dev:test :only metabase.api.session-test

    # run one specific test (pass in a qualified symbol)
    clojure -X:dev:test :only metabase.api.session-test/my-test

    # run tests in one specific folder (test/metabase/util in this example)
    # pass arg in double-quotes so Clojure CLI interprets it as a string;
    # our test runner treats strings as directories
    clojure -X:dev:test :only '"test/metabase/util"'

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `DRIVERS`:

    DRIVERS=h2,postgres,mysql,mongo clojure -X:dev:drivers:drivers-dev:test

Some drivers require additional environment variables when testing since they are impossible to run locally (such as Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

##### Run the linters:

`clj-kondo` must be installed separately; see https://github.com/clj-kondo/clj-kondo/blob/master/doc/install.md for
instructions.

    # Run Eastwood
    clojure -X:dev:ee:ee-dev:drivers:drivers-dev:eastwood

    # Run the namespace checker
    clojure -X:dev:ee:ee-dev:drivers:drivers-dev:namespace-checker

    # Run clj-kondo
    clj-kondo --parallel --lint src shared/src enterprise/backend/src --config lint-config.edn

### Developing with Emacs

`.dir-locals.el` contains some Emacs Lisp that tells `clojure-mode` how to indent Metabase macros and which arguments are docstrings. Whenever this file is updated,
Emacs will ask you if the code is safe to load. You can answer `!` to save it as safe.

By default, Emacs will insert this code as a customization at the bottom of your `init.el`.
You'll probably want to tell Emacs to store customizations in a different file. Add the following to your `init.el`:

```emacs-lisp
(setq custom-file (concat user-emacs-directory ".custom.el")) ; tell Customize to save customizations to ~/.emacs.d/.custom.el
(ignore-errors                                                ; load customizations from ~/.emacs.d/.custom.el
  (load-file custom-file))
```

## Developing with Visual Studio Code

### Debugging

First, install the following extension:
* [Debugger for Firefox](https://marketplace.visualstudio.com/items?itemName=firefox-devtools.vscode-firefox-debug)

_Note_: Debugger for Chrome has been deprecated. You can safely delete it as Visual Studio Code now has [a bundled JavaScript Debugger](https://github.com/microsoft/vscode-js-debug) that covers the same functionality.

Before starting the debugging session, make sure that Metabase is built and running. Choose menu _View_, _Command Palette_, search for and choose _Tasks: Run Build Task_. Alternatively, use the corresponding shortcut `Ctrl+Shift+B`. The built-in terminal will appear to show the progress, wait a few moment until webpack indicates a complete (100%) bundling.

To begin debugging Metabase, switch to the Debug view (shortcut: `Ctrl+Shift+D`) and then select one of the two launch configurations from the drop-down at the top:

* Debug with Firefox, or
* Debug with Chrome

After that, begin the debugging session by choosing menu _Run_, _Start Debugging_ (shortcut: `F5`).

For more details, please refer to the complete VS Code documentation on [Debugging](https://code.visualstudio.com/docs/editor/debugging).

### Docker-based Workflow

These instructions allow you to work on Metabase codebase on Windows, Linux, or macOS using [Visual Studio Code](https://code.visualstudio.com/), **without** manually installing the necessary dependencies. This is possible by leveraging Docker container and the Remote Containers extension from VS Code.

For more details, please follow the complete VS Code guide on [Developing inside a Container](https://code.visualstudio.com/docs/remote/containers). The summary is as follows.

Requirements:

* [Visual Studio Code](https://code.visualstudio.com/) (obviously)
* [Docker](https://www.docker.com/)
* [Remote - Containers extension](vscode:extension/ms-vscode-remote.remote-containers) for VS Code

_Important_: Ensure that Docker is running properly and it can be used to download an image and launch a container, e.g. by running:

```
$ docker run hello-world
```
If everything goes well, you should see the following message:

```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

Steps:

1. Clone Metabase repository

2. Launch VS Code and open your cloned Metabase repository

3. From the _View_ menu, choose _Command Palette..._ and then find _Remote-Container: Reopen in Container_. (VS Code may also prompt you to do this with an "Open in container" popup).
**Note**: VS Code will create the container for the first time and it may take some time. Subsequent loads should be much faster. 

4. Use the menu _View_, _Command Palette_, search for and choose _Tasks: Run Build Task_ (alternatively, use the shortcut `Ctrl+Shift+B`).

5. After a while (after all JavaScript and Clojure dependencies are completely downloaded), open localhost:3000 with your web browser.
