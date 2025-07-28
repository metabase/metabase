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

- **Lint:** `yarn lint-eslint-pure`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check-pure`

### Clojure

- **Lint PR:** `./bin/mage kondo-updated master` (or whatever target branch)
  - Call the command one time at the beginning, record the results, then work through the problems one at a time.
  - If the solution is obvious, then please apply the fix. Otherwise skip it.
  - If you fix all the issues (and verify by rerunning the kondo-updated command):
    - commit the change with a succinct and descriptive commit message
- **Lint File:** `./bin/mage kondo <file or files>` (or whatever target branch)
  - Use the linter as a way to know that you are adhering to conventions in place in the codebase
- **Lint Changes:** `./bin/mage kondo-updated HEAD`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`
- **Check Code Readability** `./bin/mage -check-readable` with optional line-number
  - Run this after every change to Clojure code, only accept readable code
- **Evaluating Clojure Code** `./bin/mage -repl '<code>'`
  - See `Sending code to the REPL` for more details

### ClojureScript

- **Test:** `yarn test-cljs`

## Clojure REPL-driven development

- Start with small, fundamental functions:
- Identify the core features or functionalities required for your task.
- Break each feature down into the smallest, most basic functions that can be developed and tested independently.
- Write and test in the REPL:
  - Write the code for each small function directly in the REPL (Read-Eval-Print Loop).
  - Test it thoroughly with a variety of inputs, including typical use cases and relevant edge cases, to ensure it
    behaves as expected.
- Integrate into source code:
  - Once a function works correctly in the REPL, move it from the REPL environment into your source code files (e.g.,
    within appropriate namespaces).
- Gradually increase complexity:
  - Build upon tested, basic functions to create more complex functions or components.
  - Compose smaller functions together, testing each new composition in the REPL to verify correctness step by step.
- Ensure dependency testing:
  - Make sure every function is fully tested in the REPL before it is depended upon by other functions.
  - This ensures that each layer of your application is reliable before you build on it.
- Leverage the REPL fully:
  - Use the REPL as your primary tool to experiment with different approaches, iterate quickly, and get immediate
    feedback on your code.
- Follow functional programming principles:
  - Keep functions small, focused, and composable.
  - Leverage Clojure's functional programming features—like immutability, higher-order functions, and the standard
    library—to write concise, effective code.

### How to evaluate code

#### Keeping Code Readable

The `./bin/mage -check-readable <file> <optional: line-number>` command checks if your Clojure code can be properly parsed.
This ensures your changes maintain valid syntax and structure.

- Edit Clojure files one step at a time.
- After EVERY change to a Clojure form, call `mage -check-readable src/metabase/thefile.clj <line-number>` with the line number.
- If it's readable then call `mage -check-readable dev/src/dev.clj` without the line number to check the entire file.
- If the change results in unreadable code, try again until it is readable.
- To overcome errors about parens, pay close attention to them. Count opening/closing parens you add/remove.

#### Bottom-up dev loop

1. Write code into a file.
2. Evaluate the file's namespace and make sure it loads correctly with:

```
mage -repl --namespace metabase.app-db.connection
```

3. Call functions in the namespace with test inputs, and observe that the outputs are correct 3.1
   Feel free to copy these REPL session trials into actual test cases using `deftest` and `is`.
4. Once you know these functions are good, return to 1, and compose them into the task that you need to build.

#### Sending code to the REPL

- Send code to the metabase process REPL using: `./bin/mage -repl '(+ 1 1)'` where `(+ 1 1)` is your Clojure code.
  - See `./bin/mage -repl -h` for more details.
  - If the Metabase backend is not running, you'll see an error message with instructions on how to start it.

##### Working with files and namespaces

1. **Load a file and call functions with fully qualified names**:

To call `your.namespace/your-function` on `arg1` and `arg2`:

```
./bin/mage -repl --namespace your.namespace '(your-function arg1 arg2)'
```

DO NOT use "require", "load-file" etc in the code string argument.

##### Understanding the response

The `./bin/mage -repl` command returns three separate, independent outputs:

- `value`: The return value of the last expression (best for data structures)
- `stdout`: Any printed output from `println` etc. (best for messages)
- `stderr`: Any error messages (best for warnings and errors)

Example call:

```bash
./bin/mage -repl '(println "Hello, world!") '\''({0 1, 1 3, 2 0, 3 2} {0 2, 1 0, 2 3, 3 1})'
```

Example response:

```
ns: user
session: 32a35206-871c-4553-9bc9-f49491173d1c
value:  ({0 1, 1 3, 2 0, 3 2} {0 2, 1 0, 2 3, 3 1})
stdout:  Hello, world!
stderr:
```

For effective REPL usage:

- Return data structures as function return values
- Use `println` for human-readable messages
- Print errors to stderr

## Tips

- End all files with a newline.
- When editing tabular code, where the columns line up, try to keep them aligned.
- Spaces on a line with nothing after it is not allowed

## Critical REPL Usage Rules

- Be careful with parentheses counts when editing Clojure code
- After EVERY change to Clojure code, verify readability with `-check-readable`
