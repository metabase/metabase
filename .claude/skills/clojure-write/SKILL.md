---
name: clojure-write
description: Guide Clojure and ClojureScript development using REPL-driven workflow, coding conventions, and best practices. Use when writing, developing, or refactoring Clojure/ClojureScript code.
---

# Clojure Development Skill

@./../_shared/development-workflow.md
@./../_shared/clojure-style-guide.md
@./../_shared/clojure-commands.md

## REPL-Driven Development Workflow

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
- Use the REPL fully:
  - Use the REPL as your primary tool to experiment with different approaches, iterate quickly, and get immediate
    feedback on your code.
- Follow functional programming principles:
  - Keep functions small, focused, and composable.
  - Use Clojure's functional programming features—like immutability, higher-order functions, and the standard
    library—to write concise, effective code.

## How to Evaluate Code

### Bottom-up Dev Loop

1. Write code into a file.
2. Evaluate the file's namespace and make sure it loads correctly with:

```
./bin/mage -repl --namespace metabase.app-db.connection
```

3. Call functions in the namespace with test inputs, and observe that the outputs are correct
   Feel free to copy these REPL session trials into actual test cases using `deftest` and `is`.
4. Once you know these functions are good, return to 1, and compose them into the task that you need to build.

## Critical Rules for Editing

- Be careful with parentheses counts when editing Clojure code
- After EVERY change to Clojure code, verify readability with `-check-readable`
- End all files with a newline
- When editing tabular code, where the columns line up, try to keep them aligned
- Spaces on a line with nothing after it is not allowed
