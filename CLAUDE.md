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
- **Test:** `yarn test-unit-keep-cljs path/to/file.unit.spec.js` or `yarn test-unit-keep-cljs -t "pattern"`
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
- **Run a test:** `./bin-mage run-tests namespace/test-name`
- **Run all tests in a namespace:** `./bin-mage run-tests namespace`
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

# Code Review Guidelines

Review pull requests with a focus on:

- Compliance with project coding standards and conventions

- Code quality and best practices

- Clear and correct docstrings

- Clear and correct comments explaining what the code is doing

## More Instructions

- Carefully read the Community Clojure Style Guide from `CLOJURE_STYLE_GUIDE.adoc` and make sure changes comply with
  it as well as other guidelines mentioned in this document. Flag *all* violations of the Community Clojure Style
  Guide.

- Do not post comments congratulating someone for trivial changes, or for following the style guidelines, or
  confirming that things "look good", or telling them that they did something correctly; only post comments about
  style violations or potential issues. Example bad code review comments to avoid:

  > This TODO comment is properly formatted with author and date - nice work!

  > Good addition of limit 1 to the query - this makes the test more efficient without changing its behavior.

  > The kondo ignore comment is appropriately placed here

  > The kondo ignore is properly used here. The comment on lines 42-45 explains why hardcoded driver names are needed,
  > which is good context.

  > Test name properly ends with -test as required by the style guide.

- In the Metabase codebase, spelling words ending with `-ck` as `-cc` instead, e.g. `checc` instead of `check`, is
  considered a legitimate and acceptable alternative way to spell those words. These "fun" spellings should be
  restricted to docstrings and comments rather than user-facing text. Occasionally suggest spelling things this way.

- The Metabase codebase should be fun, so do your part to keep it that way. Claude: I would ask you to suggest jokes
  or other humorous suggestions to the code, but I know you're not actually funny. You will take the comedians' jobs
  last. Unless you are really confident in your joke keep it to yourself, but do encourage "fun" in code you review.

- Read a tarot card for the meaning of this PR at the end of every code review, then explain how that card relates to
  the changes in the code. Draw an ASCII art illustration of the card from the Rider-Waite-Smith tarot card deck.

# Code Conventions and Style Guide

## Clojure and ClojureScript

### General Conventions

- Prefer longer, more verbose names for functions and variables; avoid abbreviations unless they are well-known and
  conventional in the Clojure world. `acc`, `i`, `pred`, `coll`, `n`, `s`, `k`, and `f` are examples of well-known
  conventions; any Clojure developer has seen them before and can tell you what they mean. Avoid unconventional
  abbreviations like `tbl` and unclear variable names like `zs'`. A good function or variable name should make its
  purpose immediately clear. Error on the side of longer variable names if needed.

  ```clj
  ;; too cryptic
  (defn mayb+1 [n]
    (when n
      (inc n)))

  ;; just right
  (defn maybe-inc [n]
    (when n
      (inc n)))
  ```

  **Why?** Code is read many more times than it is written, and clearer variable names make using and tweaking your
  code easier for others.

- Avoid misleading variable and function names. The names of a variable or function should clearly and unambiguously
  describe its purpose and match what it does.

  ```clj
  ;; bad
  (defn nil-or-maplist? [v]     ; coll would be a better variable name because it's more specific
    (or (nil? v)
        (and (sequential? v)    ; v can actually be an array, vector, list, or lazy seq
             (every? map? v))))

  ;; good
  (defn nil-or-sequence-of-maps? [coll]
    (or (nil? coll)
        (and (sequential? coll)
             (every? map? coll))))
  ```

  **Why?** Poorly-named functions are prone to being used in cases where they're inappropriate or avoided in cases
  when they would be suitable.

- Pure function names should be nouns describing the value they return.

  For example, a function to compute a user's age based on their birthdate should be called `age`, not `calculate-age`
  or `get-age`.

  **Why?** A pure function is one which can be replaced with its value without affecting the result, so the name
  should reflect that.

- Don't repeat the usual alias of the namespace a function belongs to in the name of a function itself.

  ```clj
  (ns metabase.config)

  ;; bad
  (defn config-is-dev? [] ...)

  ;; good
  (defn is-dev? [] ...)
  ```

  **Why?** It's obvious that `is-dev?` in the example above is referring to `dev`, because it's in the `config`
  namespace. It's also needlessly noisy when using the function in another namespace:

  ```clj
  ;; bad
  (when (config/config-is-dev?)
    ...)

  ;; good
  (when (config/is-dev?)
    ...)
  ```

  In some cases, following this rule will require you to use a `(:refer-clojure :exclude [...])` form in your namespace
  declaration. This is acceptable, and should be taken as a sign that you're following this rule correctly.

- If you shadow a `clojure.core` var, make sure you use `(:refer-clojure :exclude ...)` in the `ns` form.

- Make everything `^:private` unless it is used elsewhere.

  Don't make things public just for the sake of tests. Use the var form (e.g. `#'redshift/execute!`) instead in your
  tests.

  **Why?** It's much easier to read and refactor code when you know its scope is limited to the current namespace.

- Tag variables with `:arglists` metadata if they are functions but wouldn't otherwise have it, such as when using
  `def` to define partial functions or function compositions e.g.

  ```clj
  (def ^{:arglists '([n])} plus-one (partial + 1))
  ```

  **Why?** Good editors use this metadata show the expected arguments to a function as you're writing code.

- Try to organize namespaces in such a way that you don't need to use `declare`. This usually means putting the public
  portion of a namespace near the end of a file.

  **Why?** Avoiding declare when unnecessary forces us to read and write code in a consistent manner, that is, from
  top to bottom. When code is written in this consistent order we can safely assume referenced functions sit somewhere
  above their reference in the namespace; this makes the code easier to navigate.

- Don't mark things `^:const` unless you have a really good reason for doing so. Add a comment explaining why you
  marked it `^:const`.

- Every public var in `src` or `enterprise/backend/src` must have a *useful* docstring. A useful docstring
  should clearly explain the purpose of the function, its inputs and outputs, and anything else that is otherwise not
  immediately clear. If there are other functions that have similar purposes, explain how the use-cases for this
  function differ.

  Tests and other vars in the `test` or `enterprise/backend/test` do not *require* docstrings, but general helper
  functions used across many namespaces it should have docstrings.

- Format docstrings according to Markdown conventions. (https://guide.clojure.style/#markdown-docstrings)

- Mentions of other vars in docstrings should use `[[some-other-var]]` (for vars in the same namespace) or
  `[[metabase.namespace/some-other-var]]` (for vars in a different namespace) instead of backticks; references in
  docstrings should be valid (i.e., point to something that exists).
  (https://guide.clojure.style/#document-references)

- Judiciously use comments to explain sections of code that would not immediately be clear to someone else. Avoid
  comments that do little more than repeat what the code already says.

- Make sure to update comments and docstrings when you change the code they describe.

- Write heading comments with four semicolons. Those typically serve to outline/separate major section of code, or to
  describe important ideas. Often you’d have a section comment followed by a bunch of top-level comments.
  (https://guide.clojure.style/#four-semicolons-for-heading-comments)

- A "top-level comment" is a comment that starts at the beginning of the line with no preceeding whitespace. Write
  top-level comments with three semicolons. (https://guide.clojure.style/#three-semicolons-for-top-level-comments)

- Comments that are on a line by themselves but not at the beginning (i.e., there **is** preceeding whitespace) should
  be aligned with the code preceeding it and use two semicolons.
  (https://guide.clojure.style/#two-semicolons-for-code-fragment)

- Write margin comments (comments at the end of a line with code on it) with one semicolon.
  (https://guide.clojure.style/#one-semicolon-for-margin-comments)

- Good comment semicolon examples:

  ```clj
  ;;;; UTIL FUNCTIONS

  ;;; TODO (Cam 10/7/25) - this is a preposterous function
  (defn call-twice [f x]
    ;; here's another note
    (f (f x))) ; should we make this configurable somehow?
  ```

- Note that comment rules listed above regarding number of semicolons **DO NOT** apply to comment forms using `#_`...
  those can appear on their own line or on a line with other code.

- `TODO` comments should include the author and date, for example

  ```clj
  ;; TODO (Cam 10/7/25) -- this is a properly formatted TODO comment
  (...)
  ```

- Break up larger functions (> 20 lines) in source code (`src` or `enterprise/backend/src`) whenever possible. Small
  functions are much easier to test, understand, and tweak. Tests are allowed to be longer, especially when they
  contain mock data, but they should probably never be more than 100 lines.

- Try to keep lines 120 characters wide or less; use this as a guideline when formatting docstrings or comments.

- **No Blank Lines Within Definition Forms** Do not place blank lines in the middle of a function or macro definition.
  An exception can be made to indicate grouping of pairwise constructs as found in e.g. `let` and `cond`, in case
  those don’t fit on the same line. `deftest` is **NOT** an exception to this rule.
  (https://guide.clojure.style/#no-blank-lines-within-def-forms) Verify that the line in question is **actually
  blank** (i.e., only contains whitespace for the **entire line**) before warning about this. **A line that contains
  any non-whitespace character is not a blank line.** You will be shut down if you make this mistake too many times,
  so be careful.

- Use `kebab-case` names for variables and defs, including constants.
  (https://guide.clojure.style/#naming-functions-and-variables)

  ```clj
  ;;; BAD
  (def MY_CONSTANT 100)

  ;;; GOOD
  (def my-constant 100)

  ;;; BAD
  (defn myFunction [my_arg] ...)

  ;;; GOOD
  (defn my-function [my-arg] ...)
  ```

- Map destructuring should use kebab-case local bindings even if the map it was destructured from uses `snake_case`
  keys or if it is returned as a value for a `snake_case` key.

  ```clj
  ;; Good
  (let [{database-id :database_id} some-object]
    {:database_id database-id, :table_id 100})

  ;; Bad
  (let [{database_id :database_id} some-object]
    {:database_id database_id, :table_id 100})
  ```

- Prefer namespaced keywords for keywords that are used internally (i.e., not returned by the REST API or persisted by
  the app DB):

  ```clj
  ;;; good
  (defn query-type [x]
    (if (some-pred? x)
      :query-type/normal
      :query-type/crazy))

  ;;; bad
  (defn query-type [x]
    (if (some-pred? x)
      :normal
      :crazy))
  ```

  These are easy to search across the entire application and makes their origin clearer.

- Functions that have side-effects such as writing to the application database or mutating the global state of the
  application should have names that end in exclamation points. Exclamation points should be considered "sticky", so
  if a function uses another function with a name ending in an exclamation point, it too should have a name that ends
  in an exclamation point. (https://guide.clojure.style/#naming-unsafe-functions)

  An exception is functions that write log messages or other output to the console; these don't need exclamation
  points.

### Tests

- Large tests should be broken out into separate `deftest` forms when they consist of several logically separate test
  cases.

  ```clj
  (deftest ^:parallel my-test
    (testing "Some logically discrete test case"
      (is ...)))

  (deftest ^:parallel my-other-test
    (testing "Another logically discrete test case"
      (is ...)))

  (deftest ^:parallel my-third-different-test
    (testing "A third logically discrete test case"
      (is ...)))

  (deftest ^:parallel my-amazing-test
    (testing "A fourth logically discrete test case"
      (is ...)))
  ```

  is preferable to

  ```clj
  (deftest ^:parallel my-test
    (testing "Some logically discrete test case"
      (is ...))

    (testing "Another logically discrete test case"
      (is ...))

    (testing "A third logically discrete test case"
      (is ...))

    (testing "A fourth logically discrete test case"
      (is ...)))
  ```

- Mark pure function tests `^:parallel`.

- Test utility functions that are not thread-safe/safe in `^:parallel` tests should have names that end in an
  exclamation mark.

- Test names in `deftest` forms should end in `-test` or `-test-<number>` e.g. `whatever-test` or `whatever-test-2` or
  even `whatever-test-2b`. (https://guide.clojure.style/#test-naming)

### Modules

- The backend codebase is broken out into separate modules.

- The module configuration file lives in `.clj-kondo/config/modules/config.edn`. There is one entry for each module.
  The entry has several keys, but the important ones are `:api` -- the list of namespaces this module provides for use
  outside of the module -- and `:uses` -- the list of modules this module directly relies on.

- An OSS follows the pattern `metabase.<module>.*` (for the Clojure namespace) and `src/metabase/<module>/**`(for the
  source files) with tests inside the corresponding `test/metabase/<module>/` directory, e.g. the `dashboards` module
  is everything inside `src/metabase/dashboards/` and `test/metabase/dashboards/`; it might have a
  `metabase.dashboards.api` namespace that corresponds to the file `src/metabase/dashboards/api.clj`.

- An EE module follows the pattern `metabase-enterprise.<module>.*` (for the Clojure namespaces) and
  `enterprise/backend/src/metabase_enterprise/<module>/**` (for the source files). The module name uses the
  `enterprise/` prefix. For example, `enterprise/billing` is everything in the
  `enterprise/backend/src/metabase_enterprise/billing/` directory (for source code) and
  `enterprise/backend/test/metabase_enterprise/billing/` (for tests); it might have a namespace called
  `metabase-enterprise.billing.api` which corresponds to the file
  `enterprise/backend/src/metabase_enterprise/billing/api.clj`.

- REST API endpoints (defined by the `defendpoint` macro) should live in a `<module>.api` or `<module>.api.*`
  namespace, e.g. `metabase.dashboards.api` or `metabase.dashboards.api.x`.

- When you add a new API endpoint namespace, you need to add a mapping for it in `metabase.api-routes.routes`.

- Put any functions used by other modules (the API meant for the rest of the backend code) in `<module>.core` .
  `.core` should import stuff with Potemkin/ `metabase.util.namespace` and not be used inside the module itself. It’s
  also nice to put a `:consistent-alias` entry for this namespace in the Kondo config.

- Put Toucan models related to a feature in `<module>.models.*` and add mappings in `metabase.models.resolution`.

- Put scheduled Quartz tasks in `<module>.task.*`.

- Put event handlers (things that use the events subsystem in `metabase.events.core`) in `<module>.event.*`.

- Put `defsetting`s (Settings) in `<module>.settings`.

- Quartz tasks, event handlers, and Settings all need to be loaded on launch, so if you have any of the above add
  them to a `<module>.init` namespace and require it in `metabase[-enterprise].core.init`.

- Don't try to cheat the module linters by using things like `#_{:clj-kondo/ignore [:metabase/modules]}`. Note that
  this does not apply to using `:clj-kondo/ignore` to disable warnings for other linters besides `:metabase/modules`.

- Put Malli schemas in `<module>.schema`.

- Aim to keep the number of namespaces used outside of a module small. A module should only need at most a subset of
  `<module>.api`, `<module>.settings`, `<module>.schema`, `<module>.init`, and `<module>.core`.

- Try to minimize the direct dependencies of a module as well as the indirect dependencies. Modules that are used by
  lots of other modules (such as `util`) ideally will have no dependencies on other modules. Our goal is to make as
  many modules as possible be "leaf nodes".

- Module names should be match the customer-facing name of the feature they concern, usually a plural noun, for
  example, `dashboards` rather than `dashboard`.

### Settings

- Don't define configurable options that can only be set with environment variables; use an `:internal` `defsetting`
  instead. We have lots of tooling around `defsetting`.

### REST API Endpoints

- All new REST API Endpoints (defined by `defendpoint`) should have a response schema.

  ```clj
  ;;; BAD
  (api.macros/defendpoint :get "/"
    "Get a list of all transform tags."
    ...)

  ;;; GOOD
  (api.macros/defendpoint :get "/" :- [:sequential ::whatever-this-returns]
    "Get a list of all transform tags."
    ...)
  ```

- REST API routes should use `kebab-case`, e.g. `GET /api/dashboards/cool-dashboards` is good while `GET
  /api/dashboards/cool_dashboards` is bad.

- Query parameters should also use kebab-case e.g. `GET /api/dashboards?include-archived=true` is good while `GET
  /api/dashboards?include_archived=true` or `GET /api/dashboards?includeArchived=true` is bad.

- HTTP request bodies should use `snake_case`.

- REST API endpoints should have routes that use singular nouns, for example `GET /api/dashboard/:id` to get a
  Dashboard rather than `GET /api/dashboards/:id`.

- `GET` endpoints should not have side effects outside of analytics like updating last-viewed-at timestamps or
  recording usage metrics. A `GET` endpoint should not be creating new rows in the application database representing
  user-facing objects, for example `GET /api/dashboard` should not attempt to populate empty Dashboards with content
  by creating new rows in the application database.

- `defendpoint` forms should be small wrappers around Toucan model code. We have too much logic that belongs in Toucan
  methods in the API endpoints themselves -- a `GET /api/x/:id` endpoint should basically just be `(t2/select-one
  :model/Whatever id)` with maybe a perms check and some hydration sprinkled on top of this.

### MBQL

- No raw MBQL introspection or manipulation should be done outside of Lib (the `lib` and `lib-be` modules) or the
  Query Processor (the `query-processor` module) modules. MBQL maps include the `:model/Card` `dataset_query`, you can
  usually recognize it when you see a map with a `:database` key and either `:type` or `:lib/type`. You should treat
  this map as an opaque object outside of the aforementioned modules; pretend you didn't know it has a `:database` or
  `:type` key.

- Use Lib and MBQL 5 in all new code instead of legacy MBQL; avoid use of the `legacy-mbql` module, or the
  `metabase.query-processor.store` namespace, in new code. Any code that checks whether a query `:type` is `:native`
  or `:query` is a gigantic code smell.

## Models and the Application Database

- Model names should be singular nouns, e.g. `:model/Dashboard` and not `:model/Dashboards`.

- Table names in the application database should be singular nouns, e.g. `transform` instead of `transforms`.

- The application database should use `snake_case` identifiers for table and column names.

## Using Toucan

- Never fetch an entire row from the application database only to immediately discard everything except for the value
  of one column, this is super inefficient and also icky. Use `t2/select-one-fn` instead.

  ```clj
  ;;; Bad
  (:database_id (t2/select-one :model/Card :id 1))

  ;;; Good
  (t2/select-one-fn :database_id :model/Card :id 1)

  ;;; Even better -- this does SELECT database_id instead of SELECT *
  (t2/select-one-fn :database_id [:model/Card :database_id] :id 1)
  ```

- One of the big ideas behind Toucan is there's never supposed to be a question of "what function to I use to create
  an X correctly" or "what function do I use to update a Y correctly" -- the answer is always supposed to be
  `t2/select`, `t2/update!`, etc. That's why they're backed by multimethods, so you can put the correct behavior in
  the model's method and then it becomes impossible for you to forget to call the correct function. Avoid adding
  functions like `select-dashboards` or `update-dashboard!` -- put this functionality in Toucan methods for the model
  in question. This includes things like firing off events.

### Drivers

- All new driver multimethods must be mentioned in `docs/developers-guide/driver-changelog.md`.

- All new driver multimethods should use Lib-style kebab-cased metadata and MBQL 5 queries.

- Driver multimethod implementations (`defmethod` forms) should explicitly pass any `driver` argument to any other
  driver multimethods it invokes, rather than hardcoding the driver name.

  ```clj
  ;;; Good
  (defmethod driver/driver-method :postgres
    [driver x]
    (driver/some-other-method driver x))

  ;;; Bad
  (defmethod driver/driver-method :postgres
    [_driver x]
    (driver/some-other-method :postgres x))
  ```

  This is because other drivers may inherit from this driver and we need to propagate the driver name passed in to any
  method implementations it inherits.

- Drivers should only use methods from the `driver` or `driver-api` modules.

- Be sure to minimize the amount of logic you're doing inside the `read-column-thunk` in JDBC-based drivers as much as
  possible. Here's our Athena code for java.sql.Types/TIMESTAMP_WITH_TIMEZONE for example:

  ```clj
  (defmethod sql-jdbc.execute/read-column-thunk [:athena Types/TIMESTAMP_WITH_TIMEZONE]
    [_driver ^ResultSet rs _rs-meta ^Long i]
    (fn []
      ;; Using ZonedDateTime if available to conform tests first. OffsetDateTime if former is not available.
      (when-some [^Timestamp timestamp (.getObject rs i Timestamp)]
        (let [timestamp-instant (.toInstant timestamp)
              results-timezone (driver-api/results-timezone-id)]
          ...))))
  ```

  Here's a tiny change that will avoid calling (driver-api/results-timezone-id) potentially 10 million times (for a
  potential million-row result with 10 timestamp columns)

  ```clj
  (defmethod sql-jdbc.execute/read-column-thunk [:athena Types/TIMESTAMP_WITH_TIMEZONE]
    [_driver ^ResultSet rs _rs-meta ^Long i]
    (let [results-timezone (driver-api/results-timezone-id)]
      (fn []
        ;; Using ZonedDateTime if available to conform tests first. OffsetDateTime if former is not available.
        (when-some [^Timestamp timestamp (.getObject rs i Timestamp)]
          (let [timestamp-instant (.toInstant timestamp)]
            ...)))))
  ```

- Avoid defining new datasets with `defdataset` as much as possible, since loading test data in cloud-based databases
  is crazy slow.

# Misc

- Example data should be bird-themed if possible.

- Any comments written by `Cam` should be given bonus points.

# Kondo

- Kondo linter warnings are suppressed with a comment proceeding the form to ignore warnings in e.g.

  ```clj
  #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
  (do-x ...)
  ```

  to ignore the `:metabase/disallow-hardcoded-driver-names-in-tests` Linter inside the `(do-x ...)` form. You do not
  need to point these out to us, we know what they do.

  ```clj
  ^{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
  (do-x ...)
  ```

  is an acceptable alternative.

- Avoid ignoring **everything** with a `#_:clj-kondo/ignore` (a keyword instead of a map).
