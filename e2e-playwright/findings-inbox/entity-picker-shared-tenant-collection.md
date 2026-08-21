# entity-picker-shared-tenant-collection

Port of `organization/entity-picker-shared-tenant-collection.cy.spec.ts` (17 tests).
Verified on the CI EE uberjar (slot 4), green under `--repeat-each=5` twice (170 executions).
EE-gated (`pro-self-hosted`); multi-tenancy works on the jar (`use-tenants` + namespaced collections).

## Migration dividend — the "not shown in search" test is Cypress-timing-masked and hides a real leak

`should NOT show tenant collections in search when moving a non-tenant collection`
asserts that searching the entity picker (while moving a NON-tenant collection)
does not surface tenant-namespace collections. On the jar this is **not what the
app does** — the tenant collection *does* appear once it is indexed. The upstream
test only passes because of a timing accident, and the port had to reproduce that
accident to stay faithful.

Root cause, established by reading the FE and probing the live jar backend (not
inference):

- The picker search hits `/api/search?...&context=entity-picker&models=collection`.
  Its response **omits the collection `namespace`** — verified live: the result
  for a tenant collection comes back with `namespace: null` even after a full
  `force-reindex` (12/12 polls). The tree-navigation endpoint
  (`/api/collection/:id/items`) *does* carry namespace, which is why tree-based
  filtering works and search-based filtering doesn't.
- `SearchResultsItemList.tsx` filters results by `isSelectableItem(item)`, and the
  collection picker's `canSelectItem` calls
  `PLUGIN_TENANTS.canPlaceEntityInCollection({ entityType, collection: item })`,
  whose EE impl (`tenants/utils/utils.ts:44`) reads `collection.namespace`. With
  the namespace missing from search hits, a tenant collection is treated as a
  regular collection → selectable → **shown**, so it leaks into a non-tenant move
  picker's search results.
- Upstream Cypress passes because a freshly-created collection is not searchable
  for ~1–2s, and `should("not.exist")` is checked immediately after typing (before
  the debounced search returns) — the assertion wins the race against the index.
  The Chrome cross-check on the same jar confirmed this (passes in ~3s). Playwright
  is faster/looser and my first attempt awaited the search response, which revealed
  the leak and "failed" — that was **port drift**, not an app bug: the faithful
  port checks ahead of the debounced search, exactly as upstream does.

Net: the test is effectively vacuous (it verifies index lag, not filtering). The
underlying product behaviour — entity-picker search omits `namespace` and so
leaks tenant collections into non-tenant move pickers — is worth a real look, but
is out of scope for the port. Ported faithfully with the immediate-check timing;
documented inline in the spec.

## Search-index readiness for freshly-created collections (the positive test)

`should find tenant collections via search` is the mirror image and was the
hardest to stabilize. A collection created right after `restore()` can be dropped
from the index while restore's own async rebuild is still in flight (the
`fixtures.ts` "back-to-back restores drop the rebuild trigger" hazard). The picker
fires ONE debounced RTK-Query search; if that single fire lands on an empty index,
the empty result is cached under the query string and a re-type with the same
string hits the cache and never refetches — so the test hangs the full timeout
(observed 1.5m) even with a re-nudge loop (re-nudge can't bust an RTK cache keyed
on an identical string).

Fix: `setupTenantCollections(api, { waitForSearchIndex: true })` force-reindexes
and polls the **exact** picker endpoint (`context=entity-picker`, not the bare
`models=collection` variant — the two indexes go ready a beat apart) until the
collection is searchable, so the FE's first fire is against a ready index. Opt-in,
because the negative test above must NOT have the collection reliably searchable.

## Gotchas worth folding into PORTING.md

- **Entity-picker search omits `namespace`; tree items carry it.** Any port that
  reasons about namespace-based filtering in the picker must know search results
  are missing that field. (New; extends the "read the code before believing a
  shape-mismatch story" rule.)
- **RTK-Query caches an empty search by query string → a same-string re-nudge is a
  no-op.** The re-nudge pattern (used for editor autocomplete) does NOT help when
  the emptiness is cached by args; the fix is index/endpoint readiness before the
  first fire, not retrying the same query. (New.)
- **Breadcrumb crumbs are `Ellipsified` (Mantine Tooltip).** Under load a transient
  duplicate text span appears inside `[data-testid="breadcrumbs"]` → strict-mode
  violation on `getByText(...).click()`. Mantine renders target-then-dropdown, so
  `.first()` is the real crumb. (Instance of the documented transient-UI rule.)
- **Entity-picker navigate-then-click (parent collection → child) is racy** when
  the two clicks are back-to-back: the tree column re-renders as the parent's
  children load, so the parent click can land on a replaced node and never
  navigate, and the child click burns its timeout. Tests that assert a button
  state between the two clicks never hit it (the assertion paces them, as Cypress's
  queue always did). `selectTenantSubCollectionInPicker` re-clicks the parent in a
  toPass loop until the child renders. (Instance of the "list re-renders under a
  resolved locator" rule, specific to the picker.)

## Fixes classified

- **Known gotcha (brief should have avoided):** transient-UI strict-mode on the
  breadcrumb (`.first()`); the immediate-check timing for the negative search
  (rule 1 — `should("not.exist")` is checked before the debounced search).
- **New gotcha:** entity-picker search omitting `namespace`; RTK empty-result
  caching defeating same-string re-nudge; navigate-then-click picker race.
- **Migration dividend:** the negative search test is vacuous and masks a real
  tenant-collection leak in entity-picker search (documented above).
