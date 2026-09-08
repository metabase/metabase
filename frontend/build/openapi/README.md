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

# Explain an endpoint's checks, including existing baseline exemptions.
bun run api-contracts:check --explain getErd

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

The checker discovers query/mutation calls on typed RTK `EndpointBuilder` values
(including renamed variables), and the existing `builder.query` / `builder.mutation`
convention, throughout the frontend source trees. It pairs them with generated
operations by HTTP method and URL structure. Ambiguous routes are unverified.

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

The report includes endpoint source locations and up to five nested disagreements
per check (eight levels deep before falling back to a broader diagnostic). Missing
required properties and optional-versus-required presence are distinguished from
incompatible values. Loose-type diagnostics identify the side and field containing
`any` or `unknown`. Malformed source/declarations or disabled strict null checking
fail the command rather than producing a potentially misleading comparison.

The report lives at `.tmp/openapi/contracts-report.json` and is uploaded by CI even
when compatibility checks fail. Response coverage is reported separately so absent
request bodies do not inflate response coverage. `--explain` prints matching checks,
including exemptions, but still runs the complete baseline gate: it cannot hide an
unrelated new violation.

### Referenced entities do not need to be copied

TypeScript follows references on both sides. A generated response can contain
`MetabaseEnterpriseErdImplErdNode[]`, while the existing frontend response contains
`ErdNode[]`. The names do not need to match; their structures are compared,
including nested arrays, nullable fields, unions, and recursive references.

The frontend keeps its existing declarations, which may also express a compatible
shape inline or through utilities such as `Pick`. A real incompatibility may require
fixing a Malli schema or changing those declarations and their consumers, but it
does not require importing or copying the generated component graph. The nested,
recursive, primitive-alias and response-subset tests demonstrate this directly.

Maintaining handwritten types remains a cost: direct generated imports would
automate declaration updates. This approach instead keeps generated artifacts
inside verification, and lets contract enforcement and frontend type authoring
evolve independently. It does not eliminate schema or consumer migration work.

## Incremental enforcement

`baseline.json` explicitly lists existing mismatches and unverified checks. Every
other discovered check is enforced immediately. CI rejects:

* A new mismatch or unverified check without an exemption.
* A baselined mismatch becoming unverified (for example through a loose type).
* An obsolete exemption after a fix, deletion, or rename.

To adopt an endpoint:

1. Run `bun run api-contracts:check --explain <endpointName>` to inspect its debt.
2. Verify the Malli schema against the handler and serialization behavior. Do not
   change valid frontend behavior to accommodate an inaccurate backend schema.
3. Reconcile the raw frontend contract, regenerating after backend schema edits.
4. Run the normal frontend type checker to identify affected consumers, fix them,
   and remove resolved exemptions. No whole-codebase migration is required.

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
  computed properties, accessors, conditional request returns, inline query
  strings and Express-style substitutions require further explicit mapping. They
  are reported as unverified rather than guessed. Local named types need no
  special handling because TypeScript resolves them in their original module.
  Arbitrary endpoint factories or calls that no longer expose a recognizable
  builder are outside automatic discovery; reported coverage is for discovered
  definitions, not proof that every possible runtime endpoint was found.
* `void`/`undefined` results intentionally discard response bodies and are
  reported separately. They provide no response-compatibility coverage.
* Assignability allows structural subtyping, including extra properties. It does
  not prove runtime rejection of additional request properties or that an
  optional frontend response field is ever returned.
* Request serialization and custom base-query transformations may need dedicated
  contracts before their exemptions can be removed. Unsafe casts that assert a
  concrete type remain TypeScript escape hatches.

Direct application imports of generated types can be evaluated separately later.

## Measured cost

The [first CI run](https://github.com/metabase/metabase/actions/runs/34222534254/job/102049062985)
completed the entire job in 3m29s: backend spec generation took 89s, declaration
generation 2s, CLJS compilation 47s, and contract checking 17s. These are single-run
measurements, including that runner's dependency setup and environment, not a
performance guarantee. The earlier prototype's sub-two-second assertion benchmark
did not include this complete pipeline. None of these steps runs during ordinary
local installation or dev-server startup.
