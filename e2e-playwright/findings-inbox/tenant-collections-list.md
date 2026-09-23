# tenant-collections-list (collections/tenant-collections-list.cy.spec.ts)

2 tests, both executed, 4/4 under `--repeat-each=2`. Jar 751c2a98.
**New support module: none** — the two `H` helpers used (`main`, restore/signIn)
are shared, and the raw `POST /api/ee/tenant` is kept inline because upstream
uses `cy.request` directly and test 2 needs the created tenant's `id`
(`support/tenant-users-sidecar.ts createTenant` returns `void`).

## The tier gate is REAL (measured, not assumed)
Removing `activateToken("pro-self-hosted")` **and** the `use-tenants` write
fails both tests at `POST /api/ee/tenant` (the API refuses). This is a data
point for the "tier gating does not generalise" rule: for *this* spec it does
gate. Probed by removing the token, not by reading the source.

Upstream writes the setting through the **bulk** endpoint
(`cy.request("PUT", "/api/setting", {"use-tenants": true})`), not
`/api/setting/:key` — ported literally rather than swapped for
`api.updateSetting`.

## Mutation results
| mutation | outcome |
|---|---|
| tenants POSTed with `name: "Zzz " + name` | KILLED at the first `main().getByText("Tenant 01")` visibility |
| click "Tenant 02" instead of "Tenant 01" | KILLED at the final `"Tenant collection: Tenant 01"` assertion — proves the click-through **and** the destination check |
| `is_active: false` write removed (test 2) | KILLED — `"Deactivated Tenant"` `toHaveCount(0)` resolved to 1 |
| `{length: 3}` → `{length: 1}` | **SURVIVED, and correctly so** — see below |

## A mutation that cannot kill is not evidence of vacuity
`Array.from({length: 3})` feeds *both* the creation loop and the assertion loop,
so shrinking it shrinks both sides symmetrically. It is a self-consistent
edit, not an inversion. When a mutation survives, check whether you actually
inverted an input or merely relabelled one before recording it as a surviving
mutant — the useful mutation here was corrupting the *name* sent to the API
while leaving the expectation alone.

## Weak-by-construction assertion, ported as-is
`cy.findAllByRole("link").should("have.length.at.least", 3)` is a page-wide
count with a floor of 3 on a page that has a navbar — it can essentially never
fail. Ported faithfully (`expect.poll(() => page.getByRole("link").count())`,
retrying like Cypress's `should`) rather than strengthened. Noting it so nobody
later reads it as meaningful coverage.
