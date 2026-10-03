# downgrade-ee-to-oss

Source: `e2e/test/scenarios/permissions/downgrade-ee-to-oss.cy.spec.js` (165 lines, 2 tests)
Target: `e2e-playwright/tests/downgrade-ee-to-oss.spec.ts` (+ `support/downgrade-ee-to-oss.ts`)

Result: **2/2 executed and passing on the CI uberjar** (`version.hash` `751c2a9` ==
`target/uberjar/COMMIT-ID` `751c2a98`), 4/4 under `--repeat-each=2`, green on three
separate consecutive runs on the same kept slot backend. `bunx tsc --noEmit` clean.
No test is gate-skipped in this environment. **No product bugs found.**

## Dividend: upstream's final EE assertion carries a value it can never check

Upstream's last assertion in *"should allow users to edit permissions after
downgrading EE to OSS"* lists **six** permission values for the Sample Database row:

```js
H.assertPermissionTable([[
  "Sample Database", "Can view", "Query builder and native", "No", "No", "No", "No",
]]);
```

The database-level EE permission table renders **five** permission cells. Measured
headers on the jar at that exact point in the test:

```
["Database name ","View data ","Create queries ","Download results ",
 "Manage table metadata ","Manage database "]
cells: ["Can view","Query builder and native","No","No","No"]
```

`H.assertPermissionTable` (e2e/support/helpers/e2e-permissions-helpers.js:56) iterates
the **rendered** cells, not the expected list:

```js
getPermissionRowPermissions(item).each(($permissionEl, index) => {
  cy.wrap($permissionEl).should("have.text", permissions[index]);
});
```

so any expectation past the last rendered column is silently discarded. The 6th `"No"`
has never been evaluated.

**Control (as required — not just source reading):** the unmodified Cypress spec was
run against the same slot backend (`MB_JETTY_PORT=4102`, `--browser chrome`,
`CYPRESS_RETRIES=0`, grepped to the single test) and **passes**, on the very backend
whose DOM has only 5 cells. A 6-value expectation that passes against a 5-cell row is
vacuous by construction.

**Why the 6th column is absent, and why this is NOT a bug.** The 6th column is
`Transforms`, added by `getDataColumns` (`enterprise/frontend/src/metabase-enterprise/
feature_level_permissions/utils.tsx:62-79`) only when `showTransformPermissions` is
true. `getShouldShowTransformPermissions`
(`frontend/src/metabase/admin/permissions/selectors/data-permissions/permission-editor.tsx:192`)
requires, for a self-hosted instance, **both** the `transforms-basic` token feature and
the `transforms-enabled` setting. Confirmed live on the jar:

```
transforms-basic: False   transforms-enabled: False   is-hosted?: False
```

The pro-self-hosted token used here does not carry `transforms-basic`, and this spec
(unlike ~10 other specs) never calls `H.updateSetting("transforms-enabled", true)`. So
the column is legitimately hidden.

**What the port does.** It asserts the five values upstream actually enforces, with a
comment pointing here. It deliberately does **not** assert a 6th value and does **not**
pin the cell count: a CI token that *does* carry `transforms-basic` would render six
columns, and the port stays green either way. Making the 6th expectation real would be
my over-reach on the app's legitimate behaviour, not a dividend — so it was removed.

Generalisable rule (new): **`H.assertPermissionTable` expectations past the last
rendered column are dead.** Any port that iterates the *expected* array instead — which
`support/create-queries.ts assertPermissionTable` does, and it is the shared copy — is
strictly stronger than upstream and will go red on over-listed rows. That helper is
fine as-is (its callers list exactly the rendered columns); the trap is for the next
spec that copies an over-listed upstream row verbatim.

## Real strengthenings kept

- Upstream's `cy.findByText("Save permissions?")` inside the confirm modal is a bare
  implicit-existence assertion; ported as a real `toBeVisible()`.
- `saveAndConfirmPermissions` **awaits the `PUT /api/permissions/graph`**. Upstream
  never waits, but Cypress's command queue always paced the following
  `H.deleteToken()` / `cy.reload()` past it. In Playwright the API call and the reload
  fire back-to-back and can beat the save — the standard "anchor on the change it
  saves" pattern. Not a bug; a port hazard.

## Token hygiene (the brief's specific hazard)

Both tests really do `deleteToken` mid-run, on a slot shared via
`PW_KEEP_SLOT_BACKENDS`. Two layers keep the slot clean:

- `beforeEach` restores the snapshot, which resets `premium-embedding-token`, then
  re-activates — so a poisoned slot self-heals for this spec regardless.
- an added `afterEach` re-activates the token, so a mid-test failure (between
  `deleteToken` and the re-activation) can't leave the slot OSS for the *next* spec.

Verified empirically: after two deliberately-failing mutation runs that died with the
token deleted, `GET /api/session/properties` reported `token-status.valid: true` and
the following run was green. Three consecutive full runs, all green.

## Mutation checks (port is not vacuously green)

Each mutation was killed at the right assertion with the right observed value:

| mutation | expected | received |
|---|---|---|
| test 1 final view-data `"Can view"` → `"Blocked"` | Blocked | **Can view** |
| test 2 final People `"Row and column security"` → `"Can view"` | Can view | **Row and column security** |
| `isPermissionDisabled(..., false)` → `true` | "true" | **"false"** |

The first two are exactly the two behaviours the spec exists to protect (a blocked EE
view-data value gets promoted to unrestricted when the row is edited in OSS; an
unedited sandboxed row keeps its EE value through the OSS round-trip), so the port is
genuinely exercising them.

## New helpers (support/downgrade-ee-to-oss.ts)

- `isPermissionDisabled` — first port of `H.isPermissionDisabled`. Note `aria-disabled`
  is *not* a jQuery boolean attribute, so upstream's two-arg `have.attr` really is a
  value comparison — ported as one (`PermissionsSelect` renders
  `aria-disabled={isDisabled}`, which React stringifies either way). `.contains()` →
  `toContainText`, not `toHaveText`.
- `configureSandboxPolicy` — first port of the EditSandboxingModal flow (column picker
  is a TippyPopover, user-attribute picker is a Mantine `Select` → pick the
  `role="option"`, per the wave-10 gotcha).
- `saveAndConfirmPermissions` — the spec's inline save+confirm. Note this is a *fourth*
  shape of the same idea alongside `saveChangesToPermissions` (command-palette.ts),
  `savePermissionsGraph` (data-model-permissions.ts) and `saveAndConfirmPermissions`
  (download-permissions.ts). Upstream has two distinct originals
  (`H.saveChangesToPermissions` and this inline block, which differ: the inline one
  omits the "Are you sure you want to do this?" assertion and clicks a page-wide
  button rather than one scoped to the edit bar), so consolidation should collapse to
  **two**, not one. Adding to the consolidation list rather than editing shared files.
