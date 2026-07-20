# workspace-manager — port findings (SLOT 2, port 4102)

Source: `e2e/test/scenarios/workspaces/workspace-manager.cy.spec.ts` (127 lines)
Target: `e2e-playwright/tests/workspace-manager.spec.ts`
Support: `e2e-playwright/support/workspace-manager.ts` — **this IS the expected
name**, no deviation to flag.

## 3-line summary

Both tests ported faithfully; nothing dropped, weakened or merged. The **mysql
arm is green and stable (3/3 under `--repeat-each=3`)**; the **postgres arm
fails on a warehouse precondition, not on the port** — `writable_db`'s `public`
schema grants CREATE to PUBLIC, which the workspace-isolation guard refuses
(412), and the one-line fix is a REVOKE against a container shared with four
other slots, so I deliberately did not apply it. Mutation testing killed all
three mutants and, in doing so, showed my own added anchor is weaker than I
first claimed — recorded rather than quietly kept.

## Collision checks

- `grep -rl "workspace" tests/ support/` → only `tests/workspace-instance.spec.ts`
  and `support/workspace-instance.ts`. **No port of my source exists** — did not
  need to STOP.
- Read both neighbouring files. As the brief predicted, that agent deliberately
  left the manager surface unported.

## Helpers `workspace-instance` left for me (all written this session)

- `NewWorkspaceModal` — `nameInput`, `databaseCheckbox`, `createButton`
- `RenameWorkspaceModal` — `nameInput`, `renameButton`
- `DeleteWorkspaceModal` — `confirmButton`
- `WorkspaceListPage` manager members — `newButton({primary})`, `workspaceList`,
  `workspace`, `workspaceMenuButton`, `renameMenuItem`,
  `downloadConfigMenuItem`, `deleteMenuItem`
- `enableWorkspaces(api, dbId)` — port of the spec-local read-modify-write

`WorkspaceListPage.get`/`visit` are **duplicated** from `workspace-instance.ts`,
not imported: that module exports a `WorkspaceListPage` shaped for the instance
flow and extending it would mean editing another agent's module. Duplication is
the cost of the no-edit rule; noted in the module header.

## Token predicate, arms run, final feature count

- Traced **independently for my own route**, not inherited: `routes.clj:154`
  mounts `/workspace-manager` via `(premium-handler … :workspaces)`. (Line 153
  is the neighbour's `/workspace-instance`.) Same predicate — but arrived at
  separately, per the "don't inherit a neighbour's explanation" rule.
- `:workspaces` = `enable-workspaces?`, `settings.clj:378-380`: a plain
  `define-premium-feature`, **no `:getter` override** → no short-circuit, no
  split-by-argument. Hard gate.
- FE agrees: `metabase-enterprise/workspaces/index.ts` registers
  `getDataStudioRoutes` only under `hasPremiumFeature("workspaces")`.
- **Arm A (no token):** `GET /api/ee/workspace-manager/` → **402**. Run twice —
  at session start, and again after restoring the token at the end.
- **Arm B (bleeding-edge):** confirmed **in-harness** rather than by curl. My
  standalone curl activation failed for an unrelated reason (see below), but the
  green mysql run creates a workspace and resolves the config menu item as
  `<a href="/api/ee/workspace-manager/1/config">` — the route serving 200 under
  the token is exactly arm B.
- **Slot 2 feature count: baseline 0 → 53 after the runs → restored to 0.**
  I did **not** leave the token active. The brief warned earlier agents left 42
  and 52; **I measured 53** for `bleeding-edge` and am reporting my own number.
  No token values printed anywhere.

Incidental: `.env` stores tokens as `KEY = value` (spaces around `=`). Bun's
loader handles it; a naive shell `source` does not, which is why my out-of-band
curl activation got a 62-char string and a "Token should be 64 hexadecimal
characters" 400. Harness-internal activation is unaffected.

## Gate mapping + gate-OFF control

`test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON)` at the top of the
**outer** describe. I **checked rather than assumed**: neither describe has an
`afterEach`, so `beforeEach`-level would also have been safe; describe-level is
used because it puts the skip strictly **ahead of `activateToken`**.

- **Gate ON** (`PW_QA_DB_ENABLED=1`): 2 executed — 1 passed (mysql), 1 failed
  (postgres, see below).
- **Gate OFF** (unset): **2 skipped, 0 executed**, and no `backend on :4102`
  line was printed at all — so no restore and no token activation happened.
  That is the load-bearing evidence that the gate precedes activation.

## Postgres arm — blocked, diagnosed, NOT port drift

Fails at the first post-create assertion. Ruled out, in order:

1. The mysql arm drives the **identical** helper surface and is green → page
   objects, modal scoping, `getByLabel`, checkbox role lookup and token are all
   fine.
2. A `pw:api` trace shows every locator resolving and every click landing,
   through "Create workspace" inclusive. The UI half is correct.
3. The **create request** is what fails. `CreateWorkspaceParams` is
   `{:closed true}` over exactly `{name, database_ids}`, so a hand-rolled curl
   reproduces the FE payload byte-for-byte — it is not a payload-shape guess.

Server returns **412**:
`Schema "public" grants CREATE to PUBLIC. This breaks workspace isolation.`
(`assert-no-public-create-grant!`, `src/metabase/driver/postgres.clj:1516`.)
The manager flow attaches the DB with **all** schemas, so `public` is an input
schema; on the stock `metabase/qa-databases:postgres-sample-12` image
`writable_db`'s public ACL is `{metabase=UC/metabase,=UC/metabase}` — the `=UC`
entry is the PUBLIC CREATE grant.

**Open question, recorded rather than papered over:** nothing in the repo
establishes the precondition. `resetWritableDb` (`e2e/support/db_tasks.js:41`)
drops schemas and public tables but never touches ACLs; no CI workflow runs the
REVOKE; the image is stock. Per the no-Cypress-cross-check rule I **cannot** say
whether upstream passes in CI, so I am **not** claiming the upstream spec is
broken — only that the precondition is unmet here and I could not find who is
supposed to meet it. I could have written a plausible mechanism; I'd rather this
stay an open question.

**Why I did not fix it:** the fix is `REVOKE CREATE ON SCHEMA public FROM
PUBLIC` on the writable postgres container, which is **shared across all slots
and never reset**. Doing that from a `beforeEach` is cross-slot shared-state
damage; it belongs in container provisioning. (The permission layer also blocked
the mutation when I attempted it as a probe — the right outcome.) The test is
left **faithful and failing**, not skipped or weakened, with a full FIXME in the
spec.

## Absence assertions and their positive anchors

Exactly two.

**(a) `workspaceList().should("not.exist")` after delete (both arms)** — the
pre-fetch shape. Anchor: upstream's own next line,
`newButton({primary:true})` = "Create a workspace", rendered only by
WorkspaceEmptyState, i.e. only once the list returns EMPTY. I added that anchor
**ahead** of the absence and kept both upstream assertions verbatim after it —
a **strengthening**, flagged in the spec header.

**Measured, and weaker than I first claimed.** Mutation M2b proved
`toHaveCount(0)` *does* pass vacuously in the pre-fetch window — but upstream
was already anchored by the line after it, so my reordering changes **where**
the failure surfaces, not **whether** it is caught. Kept for diagnosis; it
closes no real hole. Header comment corrected to say so.

**(b) `expect(contents).not.to.contain("schema-filters-patterns")` (mysql)** —
anchored by the three positive `toContain` assertions on the same string
immediately above. Genuinely anchored upstream; no strengthening needed, and
mutation M3 confirmed it discriminates.

## Mapping hazards — checked, with outcomes

- **`should("be.enabled")`** — **inapplicable**, the spec contains none.
- **`getByText` exact/case traps** — **inapplicable**. Every lookup is
  `getByRole` + accessible name, not `getByText`. Ported with `exact: true`
  (testing-library string TextMatch is full-string, so `exact: true` is the
  faithful port; the default would match substrings *and* ignore case). The one
  regex matcher (`/Download config\.yml/`) stays a regex.
- **Mantine modal `{w:1280,h:0}`** — **inapplicable, mechanism checked.**
  `modal(page)` is only ever a *scope*; every assertion and click lands on a
  descendant control with its own box. The brief predicted a rename/delete modal
  spec would hit this; it does not, because nothing touches the modal root.
- **`pressSequentially` caret-0** — **avoided.** `clear().type()` → `fill()`,
  which is atomic and would otherwise have produced a mis-ordered name.
- **`contain.text` = concatenation** → `toContainText` on the same locator, one
  `expect` per upstream `.should`/`.and`. Whitespace normalisation is immaterial
  (needles have only single interior spaces; normalisation cannot delete chars).

## Shared state

- **Container inventory before/after: identical** (postgres :5404, mysql :3304,
  mongo, maildev, webhook-tester, ldap — 9 containers both times).
- **I made no writes to the writable warehouse.** The REVOKE probe was blocked
  before execution; every create attempt failed at the 412 guard *before*
  provisioning. The postgres `public` ACL is unchanged
  (`{metabase=UC/metabase,=UC/metabase}`).
- The mysql arm creates and deletes a workspace, and delete tears down warehouse
  isolation; the green empty-list assertions show teardown succeeded. I could
  not independently inventory the mysql container — `docker exec` was blocked
  partway through the session — so this rests on the app-side evidence.
- No fixtures of mine persist. Slot 2 token restored to baseline.

## tsc

`bunx tsc --noEmit` → **exit 0**. Because tsc is provably silent on dead
imports, I **hand-audited** both files: all 12 spec imports and all 6 support
imports are used (re-exports counted as uses). No dead imports.

## Mutation results

Verifier: `scratchpad/s2-workspace-mgr-mutate.py`. **Sanity-checked before use** —
aborts on 0 occurrences, on ambiguity, and on no-ops, validates *before* any
write, and md5 was confirmed unchanged after all three aborts. It then caught a
real ambiguity in my own first attempt (my anchor string matched both arms),
which is the guard doing its job. All mutants **restored byte-identical (md5
`302bf2ab17c27fbb0f1a005409d79cc2`)**.

| # | Mutation | Result | Died at |
|---|---|---|---|
| M1 | mysql delete never confirmed | **killed** | line 226 — my added anchor |
| M2a | `goto("/")` before assertions, anchor present | **killed** | the anchor |
| M2b | `goto("/")` before assertions, anchor **removed** | **killed** | line 228 — upstream's trailing check; `toHaveCount(0)` **passed vacuously** |
| M3 | invert input: `not.toContain("mysql")` | **killed** | line 219 |

**Calling out my own bad mutation:** M1 is **over-determined**. "Delete never
confirmed" leaves the list rendered, so upstream's `toHaveCount(0)` would have
caught it too — M1 proves ordering, not necessity. M2a/M2b were designed to fix
that, and M2b is the informative one: it isolates the absence assertion's
vacuity from upstream's trailing anchor and is what corrected my header claim.

M3 inverts the *input* (asserting absence of a string known to be present)
rather than the assertion, and confirms the negative is discriminating rather
than vacuous. No survivors, so no presence probe was needed.

**Runtime as a tell:** the mysql arm runs in ~1.0s, which I flagged as
suspiciously fast and **probed rather than banked** — a `pw:api` trace shows the
full body executing (goto, fills, clicks, download, delete, all assertions). It
is genuinely fast because that arm's `beforeEach` has no `resetTestTable` and no
`resyncDatabase`, against a warm backend. Corroborated by mutants dying in it.

## Corrections to the brief

- The disputed feature count: **I measured 53** on this slot for `bleeding-edge`
  (the brief cited 42 and 52 for `pro-self-hosted` — a different token, so not
  actually in conflict).
- The brief predicted the Mantine modal-box hazard *would* bite a
  rename/delete modal spec. For this spec it does not, and the reason is
  structural (modal used only as a scope), not luck.
