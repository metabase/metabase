---
name: fix-api-contract
description: Investigate and fix API contract checker diagnostics, or bring a selected Metabase RTK endpoint's request or response checks under enforcement.
---

# Fix an API contract

Start from an endpoint name, route, or pasted checker diagnostic. Keep the work scoped to the selected
contract and affected consumers. Generated declarations are verification inputs under `.tmp/openapi`;
application code keeps its handwritten types.

## Establish the current contract

Unless this session already generated a snapshot from the current backend source, run:

```sh
bun run api-contract-check
```

This generates the Enterprise spec and TypeScript declarations, then checks the frontend contracts.
It requires the backend JDK/Clojure environment and built CLJS dependencies. Run
`bun run build-pure:cljs` if those dependencies are missing. If generation fails, resolve that failure
before interpreting an existing report. Run one generation command at a time per worktree.

Inspect the selected checks, including existing exemptions:

```sh
bun run api-contract-check-pure --explain <endpointName>
```

The JSON report is `.tmp/openapi/contracts-report.json`. Use its full check IDs when endpoint names
are ambiguous. `--explain` filters the displayed results but still runs the complete baseline gate.
The `-pure` command reuses the snapshot; regenerate after backend edits or switching branches.
Ordinary `type-check` does not generate or check backend contracts.

## Find which layer is wrong

Follow the diagnostic's field path through the RTK definition, its handwritten types, the Malli schema,
handler, hydration and serialization, and relevant endpoint tests. Neither declaration is automatically
correct. Existing behaviour is evidence but may itself contain a bug.

- Response values must be assignable from backend to frontend. Every frontend response field,
  including optional nested fields, must be supported by the backend schema; omitting backend fields is allowed.
- Requests compare the expressions actually sent in URL parameters, `params` and `body`.
  The RTK argument type may differ from the wire request because the query function transforms it.
- Distinguish absent keys from nullable values. A key always emitted with a possible null value
  is required and nullable, not optional. Check conditional responses and error variants too.
- An `unverified` result can mean a missing or loose schema, an unresolved frontend type, or an
  unsupported mapping such as `transformResponse` or `queryFn`. It does not establish a type mismatch.

## Fix the contract

Before editing Malli schemas, read [add-malli-schemas](../add-malli-schemas/SKILL.md).
Response validation sees Clojure values before JSON serialization. In particular, response timestamps
that are Java time objects need `ms/TemporalInstant`, not a blanket `:any` or string schema.

Correct inaccurate schemas or handwritten declarations based on the intended API behaviour, then fix
affected consumers. TypeScript follows aliases structurally, so keep compatible existing names and
compositions. A nested mismatch does not require copying the generated entity graph.

Fields added by frontend normalization or store hydration belong to frontend models, not invented
backend response fields. Separate the raw response contract from that model where necessary.
Do not silence diagnostics with casts, `any`, unconstrained types, or application imports of generated
declarations. Do not edit generated output. If the checker cannot represent a valid mapping, fix it with
a regression test when in scope, or report the unsupported case as remaining work.

## Remove exemptions and verify

`frontend/build/openapi/baseline.json` is an exemption list, keyed by individual checks such as
`getErd:request.query` or `getErd:response.2XX` (prefixed by the source path). A response exemption covers
all its fields. Requests and responses can be adopted separately.

A zero exit status can mean the selected failure is still exempted. Confirm the targeted checks are
present in the report with status `pass`, then remove their exact baseline entries. `ignored` and
`unverified` do not count as adopted. Do not bulk-refresh the baseline or add exemptions to claim a fix.
An obsolete-exemption error after a fix means its entry needs removal.

Run the full contract command after backend changes, or `api-contract-check-pure` after frontend-only
changes against the current snapshot. Run `bun run type-check-pure` for affected frontend code and the
relevant backend tests for schema or handler changes. Regenerate after the final backend edit.
Report the checks fixed, exemptions removed, validation results, and any remaining failures separately.
