# admin-permissions (permissions/admin-permissions.cy.spec.js)

Ported all 19 tests across the four upstream describe blocks. Green on the jar
(slot 5): 7 passed / 12 skipped first run, 14/24 under `--repeat-each=2`. tsc
clean. No `test.fixme`, no product bugs.

The 12 skipped are the whole `@OSS`-tagged first describe (data + collection
permission tables, group/db/schema granularity, save/confirm, discard-changes
modals, stale-revision modal). Upstream tags that block `@OSS`, so CI's EE leg
excludes it (`grepTags` carries `-@OSS`) and it runs only against the OSS jar —
gated here with `isOssBackend`, mirroring admin-authentication /
embedding-smoketests. The 7 that run are the EE / help / partial-update blocks.

## Migration dividend (flagged) — the @OSS block is coverage left on the table

I temporarily removed the `isOssBackend` gate and ran all 12 @OSS tests against
the **EE jar with no token active** (which is what `restore()` gives — describe 1
never activates a token): **12/12 pass**. So on the spike/CI EE jar these tests
are green, not red — unlike the embedding-smoketests `@OSS` case (which asserts
OSS-specific upsell copy and genuinely differs on EE). The @OSS tag exists
because the real EE CI instance has a token baked in, under which the granular
"View data" column appears and `should not show view data column on OSS` would
fail; the Playwright spike has no such token. **Reclaiming these 12 tests on the
Playwright EE leg is likely safe** — either drop the gate, or gate on "no token
active" rather than "OSS build". Left gated for now to follow the established
convention + the wave-5 rule; recording the evidence so the decision is a choice,
not an oversight.

## Fixes classified (all known gotchas — no new ones)

- **`@OSS` describe gated with `isOssBackend` skip** (wave-5 rule) — the spike
  backend is EE, so the block skips. Ported faithfully so it runs on an OSS
  build; validated green on EE-no-token per the dividend above.
- **`H.modifyPermission`'s full signature** (propagate-toggle + `null` value)
  isn't covered by the shared create-queries / command-palette `modifyPermission`
  (value-only). Ported into the new support/admin-permissions.ts: Mantine Switch
  clicked via `role="switch"` + `{ force: true }` only when its `isChecked()`
  differs from the wanted state (rule 4); `null` value toggles-only.
- **`assertSidebarItems` → `toHaveText(array)`** — upstream's `.each` over the
  menuitems with `have.text` per index requires the counts to line up; the array
  form of `toHaveText` asserts count + exact per-item text (same call the shared
  `assertPermissionTable` uses).
- **Stale-revision modal** — upstream reads the revision from the intercepted
  `/api/permissions/graph/group/1` response, then PUTs `{groups:{}, revision}` to
  bump it. The revision is global and the staged UI edit isn't saved, so a fresh
  `mb.api.get("/api/permissions/graph")` yields the same value — used instead of
  racing the FE's group/1 fetch. Modal "Someone just changed permissions"
  appears on the next `selectSidebarItem`.
- **`should("not.contain", /regex/)` is vacuous upstream** — chai `contain`
  stringifies the regex (`"/No self-service/"`), so it never matches and the
  assertion is a no-op. Ported as the intended `not.toContainText("No
  self-service")` on the `database-view-data-level` / `schema-table-level`
  testids (meaningful, not vacuous).
- **`have.attr` boolean / disabled** — n/a here; the disabled-cell helper
  (`isPermissionDisabled`) isn't exercised by this spec.
- **Session-properties response modify** — the split-permission tests'
  `cy.intercept("/api/session/properties", req => req.continue(res => res.body =
  {...res.body, ...tempState}))` ported as `mockSessionPropertiesMerging` using
  **native fetch** (not `route.fetch()`, which chokes on the backend's set-cookie
  headers under bun — same workaround as admin-extras `mockSessionProperty`).
  The two `api/setting/*` intercepts that flip `tempState` are `route.continue()`
  (pass-through with a side effect); the network-fail variant `route.fulfill({
  status: 500 })`. Each `cy.wait("@sessionProps")` → a `waitForResponse`
  registered before the triggering action (rule 2).
- **Curly quotes preserved verbatim** — the help-reference labels use U+2018/
  U+2019 (`Database ‘View data’ levels`, `‘Create queries’ levels`); copied
  exactly so `getByText`/regex match.
- **Retried URL checks → `expect.poll`** (gotcha) — `cy.url().should("include",
  …)` after tab switches.
- **`cy.contains` → case-sensitive regex `.first()`**; `cy.findByText(str)`
  string args → `{ exact: true }` (rule 1).

## Cross-check

Not needed — no `test.fixme` and no product-bug claims. All EE-path tests pass
on the jar directly; the @OSS block is faithful-by-construction and additionally
validated green on EE-no-token (dividend above).

## Helpers added (support/admin-permissions.ts, new file)

`modifyPermission` (full signature), `assertSidebarItems`,
`assertPermissionOptions`, `mockSessionPropertiesMerging`, and the group-id
constants `ADMIN_GROUP` / `COLLECTION_GROUP` / `DATA_GROUP` / `READONLY_GROUP` /
`NOSQL_GROUP`. Everything else imported read-only (create-queries.ts, ui.ts,
notebook.ts, filter-bulk.ts, dashboard-repros.ts, data-model.ts, admin.ts).

## Consolidation candidate (later pass)

Three `modifyPermission` variants now exist: command-palette.ts (value-only,
no popover-count assert), create-queries.ts imports it, and this file's
full-signature port. Fold the propagate-toggle + `null`-value handling into one
shared `modifyPermission` and drop the command-palette copy.
