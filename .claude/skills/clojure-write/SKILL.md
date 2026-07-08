---
name: clojure-write
description: Guide Clojure and ClojureScript development using REPL-driven workflow, coding conventions, and best practices. Use when writing, developing, or refactoring Clojure/ClojureScript code.
---

# Clojure Development Skill

## Tool Preference

When `clojure-mcp` tools are available (e.g., `clojure_eval`, `clojure_edit`), **always use them**
instead of shell commands like `./bin/mage -repl`. The MCP tools provide:
- Direct REPL integration without shell escaping issues
- Better error messages and feedback
- Structural Clojure editing that prevents syntax errors

Only fall back to `./bin/mage` commands when clojure-mcp is not available.

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

## Writing Docstrings

A docstring is a contract for the *caller*, not a diary for the
implementer. It states what the function does, what it takes, returns,
throws, and the preconditions/invariants the caller must respect. Those
guarantees and requirements *belong* there — they are exactly what the
caller needs surfaced in the IDE.

When you find implementation context in a docstring, the default is to
**relocate it, not delete it** — move it to an inline comment at the
point in the body where it is actually relevant. That context is often
genuinely valuable; it is just in the wrong place (the caller should not
have to read it; the implementer standing at that line should). Delete
outright only when it is blather: self-congratulation, restating the
obvious, or documenting a property that is the expected default.

On that last case — narrating properties like "portable across all
supported appdbs" earns no sentence. If it were not portable, that is
either a bug, or it means callers must handle each case themselves — and
in *that* case it is the *absence* of the property that must be
documented. Document deviations from expectation, not conformance to it.

Heuristic: if a sentence would still be true after a full rewrite of the
body, it may belong in the docstring. If it describes *how the current
body works*, it belongs in the body — as an inline comment, if it is
non-obvious.

Multi-line docstrings are not banned — a genuinely non-obvious constraint
the code had to deal with can be worth explaining. But be prudent; the
failure mode is far too much detail. When tempted to write a
multi-paragraph explanatory docstring, check with the user first. And
prefer a *test* to prose: if a future reader thinks "that's a silly way
to do it" and changes it, a test should fail and tell them why. If that
breakage keeps happening, *that* is the signal a comment was warranted.

## Critical Rules for Editing

- Be careful with parentheses counts when editing Clojure code
- After EVERY change to Clojure code, verify readability with `-check-readable`
- End all files with a newline
- When editing tabular code, where the columns line up, try to keep them aligned
- Spaces on a line with nothing after it is not allowed
