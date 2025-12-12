## Linting and Formatting

- **Lint PR:** `./bin/mage kondo-updated master` (or whatever target branch)
  - Call the command one time at the beginning, record the results, then work through the problems one at a time.
  - If the solution is obvious, then please apply the fix. Otherwise skip it.
  - If you fix all the issues (and verify by rerunning the kondo-updated command):
    - commit the change with a succinct and descriptive commit message
- **Lint File:** `./bin/mage kondo <file or files>`
  - Use the linter as a way to know that you are adhering to conventions in place in the codebase
- **Lint Changes:** `./bin/mage kondo-updated HEAD`
- **Format:** `./bin/mage cljfmt-files [path]`

## Testing

- **Run a test:** `./bin/mage run-tests namespace/test-name`
- **Run all tests in a namespace:** `./bin/mage run-tests namespace`
- **Run all tests for a module:** `./bin/mage run-tests test/metabase/notification` Because the module lives in that directory.

Note: the `./bin/mage run-tests` command accepts multiple args, so you can pass
`./bin/mage run-tests namespace/test-name namespace/other-test namespace/third-test`
to run 3 tests, or
`./bin/mage run-tests test/metabase/module1 test/metabase/module2` to run 2 modules.

## Code Readability

- **Check Code Readability:** `./bin/mage -check-readable <file> [line-number]`
  - Run after every change to Clojure code
  - Check specific line first, then entire file if readable

## REPL Usage

> **Note:** If you have `clojure-mcp` tools available (check for tools like `clojure_eval`),
> **always prefer those over `./bin/mage -repl`**. The MCP tools provide better integration,
> richer feedback, and avoid shell escaping issues. Only use `./bin/mage -repl` as a fallback
> when clojure-mcp is not available.

- **Evaluating Clojure Code:** `./bin/mage -repl '<code>'`
  - See "Sending Code to the REPL" section for more details

### Sending Code to the REPL

- Send code to the metabase process REPL using: `./bin/mage -repl '(+ 1 1)'` where `(+ 1 1)` is your Clojure code.
  - See `./bin/mage -repl -h` for more details.
  - If the Metabase backend is not running, you'll see an error message with instructions on how to start it.

#### Working with Files and Namespaces

1. **Load a file and call functions with fully qualified names**:

To call `your.namespace/your-function` on `arg1` and `arg2`:

```
./bin/mage -repl --namespace your.namespace '(your-function arg1 arg2)'
```

DO NOT use "require", "load-file" etc in the code string argument.

#### Understanding the Response

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
