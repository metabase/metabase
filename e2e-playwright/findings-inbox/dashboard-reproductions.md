# dashboard-reproductions — findings

Port of `e2e/test/scenarios/dashboard/dashboard-reproductions.cy.spec.js`
(2388 lines, 41 tests) → `tests/dashboard-reproductions.spec.ts`.

**Result: 40 passed / 1 skipped / 0 fixme / 0 failed.** Verified on slot 2
against the **CI uberjar** (`JAR_PATH=target/uberjar/metabase.jar`, :4102),
clean under `--repeat-each=2` (80 passed / 2 skipped). The 1 skip is issue
46337, which carries `{ tags: "@skip" }` upstream. **No product bug is claimed
by this port**, and no test is fixme'd.

Written incrementally during verification. Each entry is scoped to what was
actually observed — claims of product bugs are only made after the
cross-check against the original Cypress spec on the same backend.

**Headline for the spike's argument:** the one candidate product bug here
(#5) evaporated against the uberjar, and the one mysterious cross-harness
failure (#4) turned out to be a *harness* bug in the per-worker-backend
experiment that was silently corrupting every drill-through test on every slot.

---

## 1. NEW GOTCHA (port rule): `cy.tick(ms)` → `clock.runFor(ms)`, never `fastForward(ms)`

**Classification:** new gotcha → PORTING.md. Not a product bug.

Issue 12578 ("should not fetch cards that are still loading when refreshing")
failed with `gate.count()` = 0 (expected 1): the dashboard auto-refresh never
fired at all.

Root cause is a semantic difference between the two fake-clock APIs:

- Cypress `cy.tick(ms)` (Sinon) advances the clock firing **every** due timer.
- Playwright `clock.fastForward(ms)` jumps the clock and fires due timers
  **at most once**. `clock.runFor(ms)` is the one that fires them all.

`frontend/src/metabase/dashboard/hooks/use-dashboard-refresh-period.ts` drives
refresh from a **1-second** interval that increments a counter:

```ts
const TICK_PERIOD = 1; // seconds
elapsed.current = (elapsed.current || 0) + TICK_PERIOD;
if (period && elapsed.current >= period) { elapsed.current = 0; onRefresh(); }
useInterval(intervalFactor, TICK_PERIOD * 1000);
```

So reaching a 60s refresh period needs ~60 separate firings. `cy.tick(61_000)`
delivers 61; `fastForward(61_000)` delivered 1, `elapsed` reached 1, and no
refresh ever happened.

**Why this one matters beyond the single test:** the same substitution in issue
28756 was *silently passing*. That test asserts a toast does **not** appear
after `TOAST_TIMEOUT`. Under-firing timers means the toast's timer chain may
never run, so the assertion passes vacuously — a green test proving nothing.
`fastForward` weakens every negative-assertion timer test it touches. Both
sites now use `runFor`.

**Fix pattern for PORTING.md:** `cy.tick(ms)` → `page.clock.runFor(ms)`.
Only reach for `fastForward` when the intent really is "jump time without
running the intervening timers" — and never under a negative assertion.

---

## 2. NEW GOTCHA (port rule): Cypress `:visible` treats `opacity: 0` as hidden — Playwright's does not

**Classification:** new gotcha → PORTING.md. Not a product bug.

Issue 31274 ("should not clip dashcard actions") failed: the port's
`.filter({ visible: true })` on `dashboardcard-actions-panel` resolved to **3**
elements where Cypress's `.filter(":visible")` resolves to 1.

`DashCard.tsx` renders an actions panel for **every** card while
`isEditingDashboardLayout`, and `DashCardActionsPanel.module.css` hides them
with `opacity: 0; pointer-events: none`; `DashCard.module.css` fades in only
the hovered card's panel (`&:hover { .DashCardActionsPanel { opacity: 1 } }`).

The two harnesses disagree on what "visible" means:

- **Cypress** overrides jQuery's `:visible` with its own algorithm, which
  explicitly treats `opacity: 0` as hidden → 1 match.
- **Playwright** `{ visible: true }` = non-empty bounding box + not
  `visibility:hidden`. **Opacity is ignored** → 3 matches.

(Note this is *not* jQuery semantics either — bare jQuery `:visible` ignores
opacity too and would also return 3. The behaviour is Cypress-specific.)

**Fix pattern:** added `countOpaqueElements(locator)` to
`support/dashboard-repros.ts` (filters on computed `opacity !== "0"`), and
scoped the close-icon lookup to the hovered dashcard. Any hover-revealed
affordance ported from a `:visible` filter needs this treatment.

---

## 3. KNOWN GOTCHA instance: `cy.wait` on a pre-registered alias consuming a backlogged response (issue 17879 ×4)

**Classification:** known gotcha (PORTING.md "cy.wait after non-triggering
clicks"). Port bug, now fixed. Not a product bug.

All four 17879 tests failed on `waitForResponse` timing out after
`saveDashboard`. Upstream:

```js
cy.intercept("POST", `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`)
  .as("getCardQuery");        // registered BEFORE visitDashboard
...
H.saveDashboard();
cy.wait("@getCardQuery");     // satisfied by the INITIAL LOAD's response
```

Saving the dashboard changes no parameters and fires no new dashcard query, so
the upstream `cy.wait` only consumes a response recorded during the initial
dashboard load — it asserts nothing about the post-save state. The faithful
Playwright translation (`waitForResponse` registered at the true trigger) has
nothing to wait for and hangs.

Fixed by dropping the wait; the subsequent chart-circle locator auto-waits for
the re-rendered chart, which is what the wait was standing in for. This is a
textbook instance of the documented gotcha — a second one in this spec family
(`dashboard-filters-reproductions-1` reported the same shape).

---

## 4. INFRA DISCOVERY (high value): per-worker backends inherit `site-url=http://localhost:4000` from the snapshot, breaking every drill-through/click-behavior navigation

**Classification:** harness/infra bug in the per-worker-backend experiment.
**Not a product bug. Not a port bug.** Fixed in `support/worker-backend.ts`.

### Symptom

All four issue-17879 tests drill through a click-behavior custom destination
and then assert on the target question's filter. They failed with
`qb-filters-panel` **not found** — after `expect(page).toHaveURL(/\/question/)`
had *passed*.

### Root cause (mechanism confirmed in source)

1. `e2e/snapshots/*` were captured against the standard dev backend on
   **:4000**, so they carry `site-url = http://localhost:4000`. Verified live:
   `GET :4102/api/setting/site-url` → `http://localhost:4000`.
   `mb.restore()` reinstates it on every test.
2. `frontend/src/metabase/visualizations/lib/open-url.ts:105`:
   `url = ignoreSiteUrl ? url : getWithSiteUrl(url)`.
3. `frontend/src/metabase/utils/dom.ts:66` — `getWithSiteUrl` prefixes any
   root-relative URL with site-url: `/question#…` →
   `http://localhost:4000/question#…`.
4. `window.location.origin` on a slot backend is `http://localhost:4102`, so
   `isSameOrigin` is false → no client-side navigation → `clickLink()` does a
   **full page load of :4000**, a different backend that has none of the
   test's data → "We're a little lost".

`toHaveURL(/\/question/)` passes because `http://localhost:4000/question#…`
matches the regex — the test sails past the wrong-origin navigation and only
dies later, at the filter assertion. A nastier failure than a hard 404.

On the normal setup (backend on :4000) site-url == the page origin, so this is
invisible. **It only manifests on a backend whose port isn't 4000** — i.e.
exactly the per-worker-backend mode this spike is evaluating.

### Evidence it is not a product bug

- The **original Cypress spec** fails these 4 identically on the same backend
  (`MB_JETTY_PORT=4102`), so the port is faithful.
- The failure is fully explained by an environment value (`site-url`) that is
  wrong *for this harness*, not by application logic.
- Cypress's screenshot shows the smoking gun directly: the browser sitting on
  `http://localhost:4000/question#…` displaying "We're a little lost".

### Fix

`support/worker-backend.ts` now boots each slot backend with
`MB_SITE_URL=http://localhost:<port>`. Settings resolve env before the app DB,
so this pins the right origin and **survives `restore()`** (a value written
into the DB would not).

### Why this matters beyond this spec

Any test navigating via `openUrl` is affected on **every** slot backend, and
the failure is silent-ish (the URL still matches `/question`), so it surfaces
as a confusing downstream assertion rather than an obvious error. Every port
verified on a slot backend before this fix was running with a mis-set
`site-url`.

**Relationship to RESUME.md open thread 3 — hypothesis raised, then DROPPED.
Do not cite site-url for those.** It was tempting to blame this for
`dashboard-filters-reproductions-1`'s 6 `test.fixme`s ("dashcard title
drill-through does not carry the dashboard filter's value"). I did not, because
**the symptoms did not match**:

- Mine: a **cross-origin** full page load to `:4000`; the URL *does* carry its
  hash/query, and the page 404s in-app ("We're a little lost").
- Theirs: the navigation appears same-origin and the **search string is empty**
  (`expected '' to include '2029-01-01~'`). If site-url were the cause there,
  the URL would have been rewritten to `:4000` *with* the search string intact
  and their assertion would have passed, not seen `''`.

Their drill is a dashcard **title** click, which I did not confirm routes
through `openUrl` at all (it may be a react-router `Link`, which never touches
`getWithSiteUrl`).

**Settled independently, and the answer was no.** Thread 3 was closed the same
day by the slot-11 agent: all 6 pass against the CI uberjar on **:4111** — a
non-4000 port, with site-url still `http://localhost:4000` and no `MB_SITE_URL`
— so site-url was demonstrably not their cause; the hot bundle was. Both
results are consistent: `openUrl` targets get the site-url prefix (my 17879),
react-router `Link` navigation does not (their title drill). Two genuinely
different faults with a superficially similar smell — worth remembering before
the next "this explains that" leap.

---

## 5. RESOLVED — a product bug that wasn't: issue 12926 passes on the uberjar (source-mode/hot-bundle artifact)

**Classification:** local environment artifact. **Not a product bug, not a port
bug.** No fixme in the landed spec. This is the second time this exact trap has
been walked into and the second time the jar retracted it — see "Why this
keeps happening" below.

### The short version

This test failed persistently in source mode **and the original Cypress spec
failed identically at the same assertion** — the classic "faithful port + real
upstream behaviour" signature that justifies a fixme and a bug claim. It
survived a raised-timeout Cypress re-check too. I was one step from claiming a
regression.

Then I ran it against the **CI uberjar** (`JAR_PATH=…/metabase.jar`): **it
passes**, first try, and again in the full `--repeat-each=2` jar run. The
failure only exists against the local source-mode backend + long-lived rspack
hot bundle.

### Why the "Cypress fails too" evidence was not enough

The fidelity rule ("run the original Cypress spec against the same backend")
proves the *port* is faithful — and it did. But it cannot distinguish a product
bug from an environment bug, because **both harnesses load the same rspack hot
bundle from :8080 and hit the same source-mode backend**. Any frontend-side
environmental fault fails both harnesses identically and looks exactly like a
confirmed upstream bug. The jar run is the step that separates them: different
backend build *and* different (statically built) frontend.

### Detail, for whoever meets this symptom again

The dashcard rendered `DisabledNativeCardHelpText` ("A number variable in this
card can only be connected to a number filter with Equal to operator") instead
of the "Select…" mapping button, i.e. `getParameterMappingOptions` returned
`[]` (`DashCardCardParameterMapper.tsx:85`,
`isDisabled = mappingOptions.length === 0`) — even though the parameter is
`number/=`, the tag `F` is `type: "number"`, and `tagFilterForParameter`
(`metabase-lib/v1/parameters/utils/filters.ts:119`) accepts exactly that
combination. Consistent with a stale hot bundle serving older
mapping/`legacyNativeQuery` code, not with a real defect.

Also noted en route, and worth **not** repeating: the card returns
`parameters: []`, which looks like RESUME.md's open `#2/#22` "dimension-tag
`parameters: []` regression" thread. I probed this via `curl` and briefly
believed template tags were being dropped — they are not. The API simply
returns **MBQL5 `stages[]`** now (`stages[0].template-tags`, as an array), and
my probe was reading the legacy `dataset_query.native["template-tags"]` shape.
The tags round-trip fine. A `parameters: []` sighting is not by itself evidence
of anything.

### Why this keeps happening (process point)

RESUME.md records FINDINGS #24 being retracted after precisely this inference,
and still lists #2/#22 as awaiting the same jar re-verification. That is three
occurrences of one pattern. The cheap prophylactic, now that
`target/uberjar/metabase.jar` exists locally: **verify ports in jar mode by
default** (`export JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar`)
rather than reserving the jar for adjudicating suspected bugs. It boots in
~200s cold but ~0s reused, individual tests ran *faster* than source mode
(1–3s vs 5–10s), and it is what CI actually runs. Recommend PORTING.md make
jar mode the default verification loop and demote "Cypress fails identically"
from proof-of-bug to proof-of-fidelity-only.

---

## 5b. Reference: the original (now superseded) source-mode analysis

Kept only because the reasoning chain is the point. Everything below was
correct as an observation and wrong as a conclusion.

`issue 12926 › saving a dashboard that retriggers a non saved query (negative
id) › should load the card with correct parameters after save` fails: the
dashcard's "Select…" mapping button never renders. The card instead renders
`DisabledNativeCardHelpText`, which only happens when
`isNative && isDisabled && question && editingParameter` — and
`isDisabled = mappingOptions.length === 0`
(`DashCardParameterMapper/DashCardCardParameterMapper.tsx:85`).

So `getParameterMappingOptions` returned `[]`, even though by inspection it
should return one option:

- The parameter is `number/=` (the sidebar shows type Number / operator Equal
  to, and the help text is the `isNumberParameter` branch).
- The template tag `F` is `type: "number"` (confirmed: the tag survives the API
  round-trip — the card returns it under MBQL5 `stages[0].template-tags`).
- `tagFilterForParameter` (`metabase-lib/v1/parameters/utils/filters.ts:119`)
  maps `number` + operator `=` → `(tag) => tag.type === "number"` → true.

That points at `question.legacyNativeQuery()` not surfacing variables, but I
did not confirm it, and note the card also returns `parameters: []`.

**Fidelity cross-check (the deciding step):** the ORIGINAL Cypress spec fails
identically at the same assertion on the same backend — both at Cypress's
default 4s timeout and with `defaultCommandTimeout=30000`. The port is
faithful; this is not a port defect and not a timeout artifact.

**Why no bug is being claimed:** "Cypress fails identically" does **not** rule
out the environment here, because both harnesses load the *same* rspack hot
bundle from `:8080` and hit the same source-mode backend. A frontend-side cause
would fail both harnesses identically and look exactly like this. FINDINGS #24
was retracted for precisely this inference, and RESUME.md flags a sibling
`parameters: []` thread (#2/#22) still awaiting the same jar re-verification.

**Next step (one concrete action):** re-run this single test against the CI
uberjar + static assets — the procedure that retracted #24. If it fails there
too, it is a real regression worth an issue; if it passes, the cause is local
environment and the fixme comes off.

→ **Done: it passed. See #5 above.** The fixme was removed and the test is
green.

---

## 6. Port bug: a wait invented by the port, on an endpoint that never fires (issue 51524)

**Classification:** port bug (agent-introduced), fixed. Worth a brief note.

`47170 › should show legible dark mode colors in fullscreen mode
(metabase#51524)` hung 30s on `waitForResponse` for `PUT /api/user/:id`.
Upstream has **no wait at all** here — it clicks "Dark" and navigates. The port
added the wait to close that race, but guessed the endpoint: the color scheme
is a *setting*, not a user field. `AppThemeProvider.handleUpdateColorScheme`
calls `updateSetting({ key: "color-scheme" })` → **`PUT
/api/setting/color-scheme`** (`frontend/src/metabase/api/settings.ts:51`).

Kept the wait (it removes a real race that upstream just gets away with) but
pointed it at the request that actually fires. Lesson: when a port *adds* an
anchor upstream didn't have, verify the endpoint exists — an invented wait on a
never-fired request is indistinguishable from a product hang.

---

## 7. NEW GOTCHA: Cypress `realHover` silently hovers nothing off-viewport; Playwright refuses (issue 64138)

**Classification:** new gotcha → PORTING.md. Also a (mild) upstream
test-strength observation.

`64138` hovers a leaflet map marker and asserts no tooltip opens in edit mode.
Upstream picks `.last()` ("so it will be on top" — leaflet orders markers
back-to-front). Two distinct problems, in sequence:

1. **Off-viewport.** The map draws ~4,000 pins and leaflet keeps camera-placed
   markers in the DOM outside the viewport. `.last()` is one. Playwright's
   mouse refuses such a point — **`force: true` does not help**, the error
   changes from an actionability timeout to a hard "Element is outside of the
   viewport". Cypress's `realHover` dispatches CDP mouse events at the reported
   coordinates *without* erroring, so it hovers **nothing** and the upstream
   "no tooltip" assertion passes **vacuously**.
2. **Overlapping neighbours.** Once a genuinely in-viewport marker is chosen,
   Playwright's hit-target check reports a *neighbouring* marker on top
   (thousands of overlapping pins). Cypress's real mouse does no such check.

**Fix pattern:** added `lastIndexInViewport(locator)` to
`support/dashboard-repros.ts` — the topmost element actually inside the
viewport — then `hover({ force: true })` on it. Whatever is topmost at that
point is still a marker, so the assertion stays meaningful rather than vacuous.
This is the hover-side sibling of the documented react-flow/dnd-kit
"camera-placed / clipped element" gotchas; unlike those, the answer is *not*
synthetic dispatch — for a **negative** assertion a synthetic event is either
vacuous or falsely strong (it bypasses `pointer-events: none`, which may be the
very mechanism under test). Pick a real, reachable target instead.

---

## 8. NEW GOTCHA: entity-picker search — a late `/api/search` response silently drops the selection (issue 61013)

**Classification:** new gotcha → PORTING.md. Port-side flake, fixed.

`61013` types a dashboard name into the entity picker, clicks the result, then
clicks **Select**. Intermittently (≈1 run in 3, either test in the describe)
Select stayed `disabled` forever and the click timed out at 30s. The page
snapshot was decisive: `button "Select" [disabled]` with the result list
rendered — i.e. **nothing was selected**.

`pressSequentially` fires a debounced `GET /api/search` per keystroke. Clicking
a result while an earlier query's list is on screen selects it, and then a
later response re-renders the list and **drops the selection**, re-disabling
Select. Cypress's `.type()` has the same race but its retried `.click()`
happens to win it.

The two-step fix does **not** work: asserting `toBeEnabled()` and then clicking
still loses, because a late response can land *between* the assertion and the
click (observed — the failure just moves to the Select click). The pick and the
Select must be retried **as one unit**, gated on an effect that proves it took:

```ts
await expect(async () => {
  await picker.getByText(dashboardName, { exact: true }).click({ timeout: 5000 });
  await selectButton.click({ timeout: 5000 });
  await expect(picker).toHaveCount(0, { timeout: 5000 });  // modal closed = it took
}).toPass({ timeout: 30_000 });
```

Verified 8/8 across repeats. Generalisation: **when a debounced list can
re-render under you, retry the whole interaction to its observable effect — not
to an intermediate "looks ready" assertion.** Note `fill()` would dodge the
race by firing one search, but port rule 5 prefers real keystrokes for
search/typeahead, and the retry keeps that.

Also worth flagging: this test was **green in isolation and red in a full run**
— a reminder that per-test verification is not evidence of stability, and why
the `--repeat-each=2` full-file gate earns its keep.

---

## 9. Methodology note: the Cypress cross-check is weaker evidence than it looks

The fidelity rule ("run the original Cypress spec against the same backend")
did its job here — it correctly told me the port was faithful for 17879 and
12926. But **three separate confounds** made its output misleading as evidence
about the *product*, and two of them bit me in this spec:

1. **Timeouts.** My first cross-check ran at Cypress's default 4s
   `defaultCommandTimeout` while three sibling agents' Playwright suites + JVMs
   pegged the box: **20/41 failed**. Re-running at
   `defaultCommandTimeout=30000` (matching the port's timeouts) turned several
   green (12926-undo, 13736). Those 16 "failures" were noise. Match the
   timeouts before quoting a Cypress baseline.
2. **Shared frontend.** Both harnesses load the same rspack hot bundle, so a
   stale-bundle fault fails both identically and masquerades as a confirmed
   upstream bug. This is what happened to 12926 (#5) — and to #24, #2/#22, and
   thread #3 before it.
3. **H2 sample-DB lock contention** (discovered by the slot-11 agent, see
   RESUME thread #2): snapshots pin database 1 to the shared `e2e/tmp` H2 file;
   the Playwright harness re-points it to a per-worker copy after every
   restore, **Cypress does not**. So a Cypress cross-check on a multi-slot box
   can fail for reasons entirely unrelated to the app. This very likely
   contributed to my 20/41 as well.

**Net:** the Cypress cross-check establishes *fidelity of the port* and nothing
more. It is **not** evidence of a product bug. Only the jar (which swaps
backend artifact *and* frontend bundle, and doesn't share the hot-bundle or
source-mode environment) can support that claim — and even it doesn't isolate
which of the two changed. Every claim of this shape attempted so far (#24,
#2, #22, thread #3, and 12926 here — five) has died on contact with the jar.
