# Metabase Development Guide

## Autonomous Development Workflow

- Do not attempt to read or edit files outside the project folder
- Add failing tests first, then fix them
- Work autonomously in small, testable increments
- Run targeted tests, and lint continuously during development
- Prioritize understanding existing patterns before implementing
- Don't commit changes, leave it for the user to review and make commits

## Quick Commands

### JavaScript/TypeScript
- **Lint:** `yarn lint-eslint`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`

### Clojure
- **Lint:** `./bin/mage kondo [path]`
  - Always use the linter as a way to know that you are adhering to conventions in place in the codebase
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript
- **Test:** `yarn test-cljs`

## Clojure REPL-driven development

- Start with small, fundamental functions:
- Identify the core features or functionalities required for your task.
- Break each feature down into the smallest, most basic functions that can be developed and tested independently.
- Write and test in the REPL:
  - Write the code for each small function directly in the REPL (Read-Eval-Print Loop).
  - Test it thoroughly with a variety of inputs, including typical use cases and relevant edge cases, to ensure it behaves as expected.
- Integrate into source code:
  - Once a function works correctly in the REPL, move it from the REPL environment into your source code files (e.g., within appropriate namespaces).
- Gradually increase complexity:
  - Build upon tested, basic functions to create more complex functions or components.
  - Compose smaller functions together, testing each new composition in the REPL to verify correctness step by step.
- Ensure dependency testing:
  - Make sure every function is fully tested in the REPL before it is depended upon by other functions.
  - This ensures that each layer of your application is reliable before you build on it.
- Leverage the REPL fully:
  - Use the REPL as your primary tool to experiment with different approaches, iterate quickly, and get immediate feedback on your code.
- Follow functional programming principles:
  - Keep functions small, focused, and composable.
  - Leverage Clojure’s functional programming features—like immutability, higher-order functions, and the standard library—to write concise, effective code.

### How to evaluate code

#### The bottom-up dev loop looks something like this:
1. Write code into a file
2. Evaluate the file's namespace and make sure it loads correctly
3. Call functions in the namespace with test inputs, and observe that the outputs are correct
   3.1 Feel free to copy these repl session trials into actual test cases using `deftest` and `is`.
4. Once you know these functions are good, return to 1, and compose them into the task that you need to build.

#### Sending code to the repl:
- Send code to the metabase process repl using: `./bin/mage -eval '(+ 1 1)'` where `(+ 1 1)` is your Clojure code.
  - This will evaluate it in the user namespace.
  - If that fails, tell the user to start a metabase clojure repl.
- To evaluate code in a namespace (here `metabase.api.table/fix-schema`):
  - `./bin/mage -eval '(require (quote [metabase.api.table])) (in-ns (quote metabase.api.table)) (fix-schema {:schema 123})'`
  - note: `./bin/mage -eval` wraps your code in a `do`, so you can write multiple expressions and they'll "just work".
