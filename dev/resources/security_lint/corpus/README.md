# Security-lint test examples

Example code for the security linter (`dev.security-lint`): a small fake Metabase source tree containing one
instance of every vulnerability pattern the linter has a rule for, plus the near-misses each rule must leave alone.
The linter scans it end to end. The exact findings it must produce are frozen in
`dev/test/dev/security_lint/corpus_test.clj`, as a set of `[rule file row severity reachable-from]` tuples. That test is the regression guard for the *assembled* linter:
the unit tests prove each rule and each call-graph feature in isolation, but a graph bug can change whole-codebase
results while every unit test still passes. This catches that.

## What you will find here

Nothing under `src/` is real code and none of it loads. Each namespace is a few lines shaped like the production
code it imitates -- a `defendpoint` REST namespace, a Ring handler, a `defjob`, an MQ listener, an event handler,
a `-main`, a `defsetting`, a `reify`'d trust manager -- and each is written to trip particular rules through
particular analyzer features. The namespace docstring says what the file is for, and a comment above each form
says what that form is exercising: taint through a `mu/defn` return schema, a vector-form route, a guard on the
wrong branch of an `if`, an authz check reached through a helper, a namespace authorized by router middleware
rather than per endpoint, dead code that must be skipped.

Some forms are there to be *found* and some to be *not* found. A file that fetches a card through a helper that
checks public sharing is enabled sits next to an endpoint that never reaches that check. A fixed-string
`http/get` sits next to one fed from the request body. The expected set in the test says which is which.

The fifth element of each expected tuple lists the entry kinds that reach the finding (`:http`, `:job`, `:mq`,
`:event`, `:cli`, `:startup`, `:setting`, `:protocol`), so a regression in entry-point detection or multimethod
resolution shows up even when the finding itself is unchanged. An empty list means the analyzer found the code
but nothing it recognises as an entry point reaches it.

## Working with it

- **Adding a rule**: add a form that trips it and a row to `expected`. A second test fails if any registered rule
  has no corpus case.
- **Changing analyzer behaviour on purpose**: update `expected` in the same commit and say why in the message.
- **A surprise diff here** after a change elsewhere is the signal this fixture exists to give. Understand it before
  updating the expected set.

## Why it lives under `dev/resources`

The fixtures require each other and reference vars that are deliberately not on the classpath, so they cannot be
loaded. clj-kondo and Eastwood walk the test roots in CI and would report them; as resources they are only ever
read by the linter.
