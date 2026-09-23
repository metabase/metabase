# database-details-permissions (permissions/database-details-permissions.cy.spec.js)

1 test, executed (not gate-skipped), 2/2 under `--repeat-each=2`. Jar 751c2a98.

## Reuse, not re-implementation
Every helper this spec needed already existed: `modifyPermission`
(admin-permissions.ts), `assertPermissionForItem` (download-permissions.ts),
`goToAdmin` (command-palette.ts). The save-and-confirm block is **byte-identical
in intent** to `savePermissionsGraph` (data-model-permissions.ts) — same button,
same two modal strings, same "Yes" — so it was reused rather than re-ported.
Cypress has exactly one copy of this flow across both specs, so consolidating
stays faithful. **New support module: none.**

## `cy.get("nav").should("contain", X).and("not.contain", Y)` is an ANY-of-set
Another instance of PORTING rule 3's chai-jquery family. `contain` resolves to
`$el.is(":contains(text)")`, and jQuery's `.is()` is true when *any* matched
element satisfies it — so on a multi-`nav` page this is "at least one nav
contains X" / "no nav contains Y". Porting it as
`expect(page.locator("nav")).toContainText(X)` would be a strict-mode violation
the moment a second `<nav>` renders. Faithful shape:

```ts
await expect(nav.filter({ hasText: caseSensitiveSubstring("Databases") })).not.toHaveCount(0);
await expect(nav.filter({ hasText: caseSensitiveSubstring("Settings") })).toHaveCount(0);
```

`caseSensitiveSubstring` matters: jQuery `:contains` is case-sensitive,
Playwright's `hasText` **string** form is not.

## Mutation results (all inputs, no assertion edits)
| mutation | outcome |
|---|---|
| `DETAILS_PERMISSION_INDEX` 4 → 3 (grant Data Model instead) | KILLED at the `/admin/databases` location poll (landed on `/admin/datamodel/...`) |
| actor inverted: run the tail as **admin** instead of the db manager | KILLED at `"Remove this database"` `toHaveCount(0)` (resolved to 1) |
| same, with that assertion removed | KILLED at `DELETE /api/database/1` → **204**, expected 403 |
| same, with that removed too | KILLED at `getByRole("img", {name:/key/})` on `/admin/databases/create` |
| nav absence block run as admin | KILLED — `nav` filtered on "Settings" resolved to 1 |

So every assertion in the spec is live. The only one not independently killed is
the final `getByRole("status")` text check, which sits on the same page as the
key-icon assertion that was killed one line earlier.

## Timing note (not a finding, a calibration)
The whole test runs in **1.4–2.3s** on the jar, including `restore()`. That
looked implausible enough to be worth checking rather than assuming — the
mutation run above is what settled it (the same prefix took 11.7s only because
of a 10s poll timeout). Fast is not the same as skipped; check with a mutation,
not with intuition.
