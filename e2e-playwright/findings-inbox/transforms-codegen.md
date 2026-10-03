# transforms-codegen

Port of `e2e/test/scenarios/metabot/transforms-codegen.cy.spec.ts` →
`tests/transforms-codegen.spec.ts` (5 tests). New helpers in
`support/transforms-codegen.ts`.

## Result: gated-skip (infra-gated)

The whole upstream spec restores the `postgres-writable` snapshot, resets the
`many_schemas` test table, and drives `WRITABLE_DB_ID` (the writable QA
postgres). None of that is in the jar's snapshots nor provisioned in the spike,
so the spec is gated on `PW_QA_DB_ENABLED` and SKIPS on the jar. Faithful by
construction, runtime-unverified — a green run means "correctly skipped", not
"passing". Also token-gated (EE, `pro-self-hosted`).

Verified on the jar (slot 4): 5/5 skipped, 10/10 skipped under
`--repeat-each=2`. tsc clean.

## No product-bug / fixme claims

The spec never executes on the jar, so no cross-check was warranted (the fidelity
cross-check exists to gate bug/fixme claims; there are none here). Not run
against the original Cypress spec for the same reason.

## Notes worth keeping (not FINDINGS-worthy on their own)

- **Metabot codegen is fully stub-verifiable in principle** — like the rest of
  the metabot family, the LLM is stubbed via canned SSE (POST
  `/api/metabot/agent-streaming` mocked from `support/metabot.ts` builders). The
  ONLY thing keeping this spec off the jar is the writable QA postgres it targets
  (transforms write to a real DB). If `many_schemas` + the writable pg container
  were ever provisioned in CI, this spec would run without a key. Candidate to
  revisit when the writable-DB path is wired up (same bucket as
  actions-on-dashboards, native-sql-generation multi-db, dependency-graph).
- **`transform_suggestion` SSE data part** is the new codegen wire shape: a text
  part + `data-transform_suggestion` (the parsed transform JSON) + empty
  `data-state`. Built with the shared `metabotDataPart`; no new SSE machinery
  needed.
- **The request carries `profile_id: "transforms_codegen"`** — asserted in
  `sendCodgenBotMessage` via a `waitForResponse` on the mocked route (route
  fulfill still produces a response for `waitForResponse`).
- Three beforeEach intercepts (`@agentReq`, `@createTransform`,
  `@updateTransform`) are all never-awaited upstream — dropped (PORTING rule 2).

## Consolidation candidates (later pass)

- **Python CodeMirror editor helper** — `support/transforms-codegen.ts` adds a
  local `focusPythonEditor` / `[data-testid=python-editor] .cm-content` accessor
  mirroring `native-editor.ts`. If more python-editor specs land, promote a
  shared `pythonEditor`/`focusPythonEditor` next to the native pair.
- **`resetTestTable` for writable-pg tables** — this file grows a third
  knex-backed reset (`resetManySchemasTable`) alongside
  `actions-on-dashboards.ts` (`scoreboard_actions`/`many_data_types`) and the
  other QA-DB specs. A single gated `support/writable-db.ts` with the knex client
  + a table registry would collapse the duplicated connection config.
