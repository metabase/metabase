# sdk-embed-setup-embed-flow-enable-embed-js-oss-and-starter — port findings

Slot 5 (:4105), jar mode. Backend verified: `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`, real `java -jar` process.

Source:
`e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-flow-enable-embed-js-oss-and-starter.cy.spec.ts`
(184 lines, 4 tests × 2 tiers = 8) →
`tests/sdk-embed-setup-embed-flow-enable-embed-js-oss-and-starter.spec.ts`.

## Numbers

- **8 executed, 0 gate-skipped, 0 fixme.** No `test.skip` anywhere.
- **8/8 green**; **16/16 under `--repeat-each=2`**.
- `bunx tsc --noEmit` clean.
- **No support-module changes.** `support/sdk-embed-setup.ts` consumed
  read-only; no companion support module — every helper already existed
  (`filter-bulk.ts` for `hovercard`, `notebook.ts`, `sdk-iframe.ts`).

## Is the tier gate real? YES — mutation-confirmed

This is the `-oss-and-starter` half of the pair whose `-ee` half is
`tests/sdk-embed-setup-embed-flow-enable-embed-js-ee.spec.ts` (slot 2). Same
shape as the `common-*` pair: an **assertion gate**, not a describe gate. The
`@OSS` tag means "runs on an OSS build"; the only mechanical difference between
the two describes is whether `activateToken("starter")` is called.

Measured token-features on this jar:

| tier           | enabled token-features                                             |
| -------------- | ------------------------------------------------------------------ |
| no token (OSS) | (none)                                                             |
| `starter`      | config_text_file, hosting, offer-metabase-ai-managed, support-users |

Neither contains `embedding_simple`. That absence is the entire point of the
file's last test ("does not show the Enable to Continue button and disables
item" → SSO radio **disabled**), which is exactly the setup the `-ee` sibling's
`modular` describe drives to completion with `bleeding-edge`. **Nothing is
skipped; skipping by reflex would delete the only assertion distinguishing this
file from its EE counterpart.**

Preconditions are **asserted, not assumed** — the beforeEach probes
`/api/session/properties` per tier and requires `embedding_simple` absent.
"We did not call `activateToken`" is no more evidence than "`activateToken`
did not throw".

## Mutation matrix — all four tests bite

Every test was killed by inverting its own inputs (OSS tier, single-tier mutant):

| # | test | mutation | result |
| - | ---- | -------- | ------ |
| 1 | shows the Enable to Continue button… | `enable-embedding-static` false→**true** | **KILLED** — card reads "Agree to the usage conditions to continue." |
| 2 | shows the enable card with fair usage terms… | `enable-embedding-static` true→**false** | **KILLED** — card reads "To continue, enable guest embeds…" |
| 3 | hides the enable card… | see below | **KILLED** (third attempt) |
| 4 | does not show the Enable to Continue button… | add `activateToken("pro-self-hosted")` | **KILLED** — SSO radio `Expected: disabled, Received: enabled` |

Test 4's kill is the direct proof that the OSS/starter tier gate is real.

## Test 3 is insensitive to its own named variable — worth knowing, not a defect

Test 3 ("hides the enable card when embedding is already enabled") sets
`enable-embedding-static: true`, `show-static-embed-terms: **false**` and
asserts the "To continue, enable guest embeds…" copy is absent. Test 2 is the
same except `show-static-embed-terms: true`.

**Inverting `show-static-embed-terms` does NOT kill test 3.** Nor does inverting
`enable-embedding-static` alone. The copy renders only under the *conjunction*
`(enable-embedding-static=false AND show-static-embed-terms=true)` — which is
test 1's configuration. Setting that combination **does** kill test 3
(`toHaveCount(0)`, `Received: 1`).

So the assertion is **non-vacuous** (the locator provably matches when the text
is present, under the correct scope) but it is **not sensitive to the setting
the test is named after** — both of test 3's own input combinations produce
absence. That is an upstream property faithfully carried over, not something to
"fix". Recording it because a future reader inverting the obvious variable will
see a surviving mutant and wrongly conclude the port is vacuous.

**Generalises — a mutation-testing caution:** when a surviving mutant appears,
check whether the rendering condition is a *conjunction* before concluding the
assertion is vacuous. The right vacuity probe is "can this locator ever match?",
not "does this one input flip it?".

## Port notes worth keeping

- `cy.trigger("mouseover"/"mouseout")` is a **synthetic** dispatch, not a real
  hover → `dispatchEvent`. Faithful *and* safe: `UsageConditionsInfoIcon` is a
  Mantine `HoverCard` taking React `onMouseEnter`/`onMouseLeave`, which React
  synthesises from delegated `mouseover`/`mouseout` — so the dispatch drives it
  exactly as Cypress does, while leaving the real cursor parked nowhere (the
  wave-9 parked-cursor tooltip trap).
- The two `within()` blocks rooted at `embedModalEnableEmbeddingCard()` need the
  card to **exist** — `cy.findByTestId` throws when absent and `.within()` on a
  missing subject is a Cypress error. That implicit existence requirement is
  ported explicitly as a `toBeVisible()` anchor, so an absence check *inside* the
  card cannot pass on a card that never rendered. Same reasoning as the
  `getEmbedSidebar()` anchor in test 3.
- `getEmbedSidebar()` is used in two places (the info icon; the absent card copy)
  and both are inside the `<aside>`, so the shared narrower helper resolves the
  same elements upstream does. **Not widened.**
- `H.mockEmbedJsToDevServer()` dropped, per the `sdk-embed-setup.ts` header.
