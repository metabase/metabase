# sdk-iframe-embedding-setup / embed-parameters

Slot 4 (:4104), jar mode (`version.hash` = `751c2a9`, matching
`target/uberjar/COMMIT-ID` `751c2a98`).

Source: `e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-parameters.cy.spec.ts`
(294 lines, 7 tests) → `tests/sdk-embed-setup-embed-parameters.spec.ts`.

## Numbers

- **7/7 green, 0 gate-skipped, 0 fixme.** No `test.skip`, no tier gate — the
  spec's only licence surface is `activateToken("pro-self-hosted")` in the
  shared `beforeEach`, same as `embed-parameters-remapping`. Nothing to skip.
- **14/14 under `--repeat-each=2`** (35.7s). Single run 18.2s.
- `bunx tsc --noEmit` clean; prettier-formatted.
- **`support/sdk-embed-setup.ts` needed ZERO changes** — the eighth Group B spec
  in a row. No companion support module was needed either (second in a row,
  after `embed-parameters-remapping`): `codeBlock`, `getEmbedSidebar`,
  `navigateToEmbedOptionsStep`, `navigateToEntitySelectionStep`,
  `getSimpleEmbedIframe`, `popover`, `createQuestionAndDashboard`,
  `createNativeQuestion`, `editDashboardCard` and `installSnowplowCapture`
  covered everything. The three spec-local helpers are translations of upstream
  spec-local code.

## The one thing worth writing down: `cy.type()` CLICKS its subject first

This spec's core interaction is `getEmbedSidebar().findByLabelText("ID").type("123")`
followed by `H.popover().findByText("Add filter").click()`. That looked
impossible: probed on the jar, `getByLabel("ID")` inside the sidebar resolves to
a **`<button data-testid="parameter-value-widget-target" aria-label="ID">`** —
the Mantine Popover trigger from `ParameterValueWidgetTrigger`. There is no
input under it, and buttons are not typeable, so a naive reading says the
upstream test should error.

Reading Cypress's own bundle settles it (`cypress_runner.js`, `type` command):

```
// click the element first to simulate focus
// and typical user behavior in case the window is out of focus
return cy.now('click', $elToClick, { force: true, … }).then(() => {
  let activeElement = getActiveElByDocument($elToClick)
  if (!options.force && activeElement === null) { …throw… }
  return type()          // keystrokes go to document.activeElement
})
```

So `cy.type()` is *click, then type at the active element*. Here the click opens
the popover, Mantine autofocuses the `field-values-widget` PillsInput, and the
"123" lands there — which is also why "Add filter" is available immediately
after. The port reproduces that literally (`typeIntoParameter`: click the
labelled element → assert an input took focus → `keyboard.type`), which
additionally covers the SQL-question case where the same accessible name is a
`<div aria-label="ID">` wrapping an inline `<input>` (the `noPopover` branch of
`ParameterValueWidget`).

**Generalisable**: any port of `cy.type()` on a non-typeable subject is really
porting a click. If the Playwright locator you reach for is an input while
Cypress's was a wrapper/trigger, you have silently dropped the click, and the
failure will surface as "the popover never opened" or "Add filter not found".

## Second gotcha: `cy.get()` inside a chain RESETS the subject

Upstream's spec-local helper is

```js
cy.findAllByTestId("parameter-visibility-toggle").get(`[data-parameter-slug="${slug}"]`)
```

`cy.get()` re-queries from the current `.within()` scope, not from the previous
subject — so the `findAllByTestId` half is **dead** and the effective selector is
just `[data-parameter-slug=…]` scoped to the sidebar. Ported as exactly that.
(Harmless here — `ParameterVisibilityToggle.tsx` puts both attributes on the
same element — but a port that "helpfully" ANDs the two conditions is asserting
something upstream does not.)

## Absence assertions: 3, all anchored, all proven non-vacuous

Per the corrected rule, all three are retrying (`toHaveCount(0)` /
`not.toContainText`) — never one-shot `count()`.

| upstream | anchor |
| --- | --- |
| `dashboard-parameters-widget-container` `not.exist` (after hiding both params) | dashcard title "Orders table" visible **inside the preview iframe** |
| `/missing required parameters/` `not.exist` | the "123" / "75.41" result cells — upstream asserts these immediately *after*; hoisted so they anchor the absence. Same assertions, reordered only. |
| `codeBlock().should("not.contain", "hidden-parameters=")` | upstream's own preceding `toContainText("initial-sql-parameters=")` on the same element |
| `findByText("Parameters").should("not.exist")` (exploration) | upstream's own preceding "Appearance"/"Behavior" visibility in the same panel |

**Vacuity disproved by inversion, not by reading.** Five input-inverting
mutations, one per test, in a single run:

| # | inverted input | result |
| --- | --- | --- |
| 1 | click both visibility toggles before asserting `data-hidden="false"` | ✘ line 164 |
| 2 | type `999` instead of `123` | ✘ `toContainText` |
| 3 | **do not** click the toggles (anchor left in place) | ✘ `toHaveCount(0)` at 234 |
| 4 | **do not** set the SQL parameter, **and delete the two hoisted anchors** | ✘ `toHaveCount(0)` at 294 |
| 5 | exploration → `dashboard` / "Orders in a dashboard" | ✘ `toHaveCount(0)` at 367 |

**Exactly those 5 failed; the two untargeted tests passed.** Mutations 3 and 4
are the load-bearing ones — both leave the absence assertion as the *first*
thing that can fail, so they show the retrying `toHaveCount(0)` genuinely
catches a present element rather than passing off an unpainted preview.

## Brief claims that reproduced / did not

- "Group B needs no `sdk-embed-setup.ts` changes" — **reproduced.**
- "Tier gating is often not real; report executed vs gate-skipped" —
  **reproduced trivially**: this spec has no tier surface at all. 7 executed,
  0 gate-skipped.
- "Check rather than assuming this family has no absence assertions" — the
  sibling's family had none; **this one has four**. Checking was right.
- `completeWizard` / `metabot` / SMTP notes: not applicable to this spec.

## No product-bug claims, no dividends

Nothing was fixme'd, no cross-check was needed (nothing failed), and every
question raised during the port was answered by reading source or probing the
jar. The `cy.type()`-clicks-first finding is a *porting* dividend, not a product
one.
