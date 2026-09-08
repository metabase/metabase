# API contract verification

This checks handwritten RTK Query types against the backend's Malli contracts.
Generated declarations are verification inputs, outside the application source tree:

```text
Checked-out Clojure source (Enterprise routes included)
  → .tmp/openapi/openapi.json
  → .tmp/openapi/types/types.gen.d.ts
  → TypeScript compatibility checks against existing frontend types
```

All generated artifacts are gitignored. Installation, dev-server startup, ordinary
type checking, and SDK builds do not run generation or import these declarations.
There is no running-server input, freshness cache, background worker, or lock.
Run generation sequentially in a worktree; CI uses a clean checkout.

## Run locally

```sh
# Fresh backend contract and compatibility check (requires Clojure/JDK).
bun run api-contracts

# Recheck frontend edits against the already generated backend snapshot.
bun run api-contracts:check

# Individual steps, including spec validation.
bun run openapi:generate
bun run openapi:lint
bun run openapi:types
bun run api-contracts:test
```

The checker resolves frontend dependencies using `tsconfig.json`. As with the
normal frontend type checker, build CLJS with `bun run build-pure:cljs` if those
dependencies are missing. CI always does this before checking contracts.
The checker-only command deliberately does not promise backend freshness: rerun
generation after backend edits or switching branches when checking locally.

## What is compared

The checker discovers `builder.query` and `builder.mutation` calls throughout the
frontend source trees and pairs them with generated operations by HTTP method and
URL structure. Ambiguous routes are reported as unverified.

Both sets of declarations are loaded into the repository's JavaScript TypeScript
compiler API. `isTypeAssignableTo` performs the structural comparison; the script
does not implement a second type system or execute endpoint code. The ordinary
frontend type-check job still checks consumers using the native TypeScript CLI.

* **Response:** each declared successful backend response must be assignable to
  the handwritten RTK result type.
* **Request:** the actual expressions returned by the RTK query function are
  checked against their corresponding backend slots: `params` against `query`,
  `body` against `body`, and URL template expressions against path parameters by
  position. A numeric RTK argument mapped into `/api/card/${id}` is checked as a
  path value, not incorrectly compared with an entire request object.

The report includes endpoint source locations and a nested property path where a
mismatch can be narrowed down. It lives at `.tmp/openapi/contracts-report.json`
and is uploaded by CI even when compatibility checks fail. Response coverage is
reported separately so absent request bodies do not inflate response coverage.

### Referenced entities do not need to be copied

TypeScript follows references on both sides. A generated response can contain
`MetabaseEnterpriseErdImplErdNode[]`, while the existing frontend response contains
`ErdNode[]`. The names do not need to match; their structures are compared,
including nested arrays, nullable fields, unions, and recursive references.

The frontend keeps its existing declarations. A real incompatibility may require
fixing a Malli schema or changing those declarations and their consumers, but it
does not require importing or copying the generated component graph. The nested
and recursive entity tests demonstrate this directly.

## Incremental enforcement

`baseline.json` explicitly lists existing mismatches and unverified checks. Every
other discovered check is enforced immediately. CI rejects:

* A new mismatch or unverified check without an exemption.
* A baselined mismatch becoming unverified (for example through a loose type).
* An obsolete exemption after a fix, deletion, or rename.

To adopt an endpoint, verify its backend schema against implementation, reconcile
the frontend contract, run the checker and normal frontend type checker, and
remove its resolved exemptions. No whole-codebase migration is required.

`bun run api-contracts:check --update-baseline` rewrites the baseline for an
explicitly reviewed change. Review its diff: normally a fix should only remove
entries. Do not use it to hide newly introduced incompatibilities. Existing
exemptions cover the whole named check, not individual fields; regressions within
an already exempted check are not prevented until that exemption is removed.

The workflow exposes `api-contracts-result` as a stable status, including PRs
outside its path filter. Repository administrators must make that status required
in branch protection to prevent merging failures. The job checks the revision
checked out by CI; it does not establish compatibility with future master changes.

## Limits and coverage gaps

* This verifies declared static contracts, not actual server responses, runtime
  validation, exact type equality, or serialization behavior.
* Types containing `any`, `unknown`, unresolved references, or unbound generic
  parameters are unverified, including nested occurrences. They are not counted
  as compatible merely because TypeScript permits assignment.
* `transformResponse`, `queryFn`, dynamic URLs/methods, configuration spreads,
  inline query strings and Express-style substitutions require further explicit
  mapping. They are reported as unverified rather than guessed. Local named
  types need no special handling because TypeScript resolves them in their
  original module.
* `void`/`undefined` results intentionally discard response bodies and are
  reported separately. They provide no response-compatibility coverage.
* Assignability allows structural subtyping, including extra properties. It does
  not prove runtime rejection of additional request properties or that an
  optional frontend response field is ever returned.
* Request serialization and custom base-query transformations may need dedicated
  contracts before their exemptions can be removed. Unsafe casts that assert a
  concrete type remain TypeScript escape hatches.

Direct application imports of generated types can be evaluated separately later.
