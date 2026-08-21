# tenant-collection-trash (collections/tenant-collection-trash.cy.spec.ts)

1 test, executed, 2/2 under `--repeat-each=2`. Jar 751c2a98.
**New support module: none** — the spec-local `createTenantCollection` was
already ported (identical body) in
`support/entity-picker-shared-tenant-collection.ts`; `archiveCollection` comes
from `collections-trash.ts`.

## The tier gate is REAL, and BOTH halves of it are load-bearing
Upstream activates **`bleeding-edge`**, not `pro-self-hosted` — kept.
- token + `use-tenants` both removed → `POST /api/collection` **400 "Cannot
  create tenant collection on OSS."**
- token kept, `use-tenants` removed → `POST /api/collection` **400 "Invalid
  Request."**

Two different rejections, so the setting and the token gate at different
layers. Both probed by removal; neither inferred from "activateToken didn't
throw".

## Mutation results
| mutation | outcome |
|---|---|
| `archiveCollection` removed | KILLED at `archive-banner` visibility |
| modal confirm replaced with `Escape`, DELETE-status assertion dropped | KILLED at the final `GET /api/collection/:id` → **200**, expected 404 |

The second mutation is the useful one: it reaches past the first assertion and
proves the terminal 404 check (the actual subject of metabase#74461) is live,
and that the modal-title assertion and banner-link click on the way there are
executed rather than skipped over.

## Scoping note
`"Delete permanently"` is both the banner link text and the modal's confirm
button text. Upstream disambiguates with `H.modal()`; the port keeps that exact
scoping (`modal(page).getByText(...)` vs `archiveBanner.getByText(...)`) rather
than adding a `.first()`.
