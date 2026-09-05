# subscriptions (slot 1, port of `e2e/test/scenarios/sharing/subscriptions.cy.spec.js`)

Target: `tests/subscriptions.spec.ts` (43 tests) + `support/subscriptions.ts`.
Verified against the local CI uberjar (`target/uberjar/COMMIT-ID = 751c2a98`;
slot backend on :4101 reports `version.hash = 751c2a9` — confirmed, not assumed).

## Collision checks (both done before writing)

- `ls` of the source dir: there IS a same-basename sibling —
  `e2e/test-component/scenarios/embedding-sdk/subscriptions.cy.spec.tsx`. It is a
  disjoint SDK component test, not my source. Kept the target name
  `tests/subscriptions.spec.ts` for the `sharing/` one; if the SDK spec is ever
  ported it needs a different filename.
- `ls tests/`: no existing port of this source. The only near-name is
  `onboarding-notifications.spec.ts` (a different source, `onboarding/notifications`),
  whose `support/onboarding-extras.ts` email helpers I reused **read-only**.

## Infra tier — this one really is REAL EMAIL

The brief's decisive question ("does a test read an inbox, or only need email
configured?") lands unambiguously on **reads an inbox**:

- 22 tests call `H.sendEmailAndAssert` / `H.sendEmailAndVisitIt` /
  `H.viewEmailPage` / `H.openEmailPage`, which fetch maildev's REST API and, in
  four cases, **navigate the browser to maildev's own web UI** (`:1080`) and
  click through it.
- So `configureSmtpSettings` (bulk `PUT /api/setting`, no validation) is **not**
  sufficient here and `H.setupSMTP` (`PUT /api/email`, live-validates against
  :1025) is the correct port. `support/onboarding-extras.ts setupSMTP` already
  does exactly this; no new SMTP helper was needed.
- maildev locally is **2.2.1** (`GET /config` → `{"version":"2.2.1"}`), so the
  maildev-3.x silent-skip trap does not apply. `/api/email` 404s, `/email` 200s,
  which is what `isMaildevRunning()` probes.
- **Gate-skips converted to real coverage: 2** — the `@OSS` describe. See below.
  Nothing else was gateable-but-runnable: the email tier genuinely needs the
  container, and it *is* up, so all 31 email tests execute.

`H.getInbox()`'s "returns as soon as the inbox is non-empty" hazard is present in
spirit but not in fact for this spec: `H.sendEmailAndAssert` does not even call
`getInbox` — it does a bare `cy.request` and takes `body[0]`. Since `setupSMTP()`
clears the inbox in every `beforeEach`, exactly one email exists at read time, so
"first" is unambiguous. The port polls for non-empty before indexing (documented
in `sendEmailAndAssert`) rather than adding a subject match that upstream does
not have.

## Executed vs gate-skipped

Final full run (single, jar, `--workers=1`):

| | count |
|---|---|
| passed | 42 |
| skipped | 1 |
| failed | 0 |

The single skip is the upstream `{ tags: "@skip" }` test (28673), ported as a
declared-and-skipped `test.skip`, exactly as upstream leaves it.

Also green: `--repeat-each=2` (80 passed / 6 skipped / 0 failed) taken **before**
the OSS gate was removed, and two consecutive full runs afterwards — which also
answers the "does this spec poison the slot?" question. It mutates instance-wide
email settings (`/api/email`, `bcc-enabled?`, `user-visibility`) and the admin's
locale, but every test's `mb.restore()` resets the app DB, so run B is
indistinguishable from run A.

### Gate-OFF control (#67/#49) — run, and it earned its place as a null result

Forcing `maildevUp = false`: **35 skipped, 8 passed, 0 failed.** No untagged
describe calls `setupSMTP`, and nothing fails when the gate is off — i.e. the
`afterEach`-runs-anyway trap that hit an earlier QA-DB port is not present here.
The 8 executable-without-email tests are the 2 top-level sharing tests, sidebar
toggling, "with no channels set up", and the 4 Slack tests (Slack is a stubbed
`/api/pulse/form_input`, no container).

### The `@OSS` gate is NOT real here — 2 tests recovered

PORTING's standing rule is "gate `@OSS` describes on `isOssBackend`". I probed it
instead of applying it (PORTING: *"tier gating does not generalise across specs —
probe by removing the token and seeing what actually breaks"*), and with the skip
removed **both OSS tests pass on the EE jar, 2/2**. `restore()` leaves the
instance unlicensed, and the "Made with Metabase" export branding is
**token-gated, not build-gated** — so the EE-jar-with-no-token instance behaves
like an OSS build for exactly the thing this describe asserts. Its sibling EE
describe activates `pro-self-hosted` and asserts the same link is *absent*, and
that also passes, so the pair is genuinely discriminating on this backend.

Applying the rule by reflex would have thrown away two executable tests, one of
which ("a list of the default parameters applied to the subscription") is not
about branding at all and is `@OSS` only by virtue of where it sits. The
assertions are matcher-based, so PORTING's *"an EE jar with no token still
renders EE-build chrome"* caveat — which only bites page-wide upsell counts —
does not apply. Ungated, with the probe recorded in the spec header.

## Findings

### 1. Two upstream absence assertions target a string that does not exist anywhere in the component

`cy.findByLabelText("subscriptions").should("not.exist")` and
`H.sharingMenu().findByText("subscriptions").should("not.exist")` are both
**exact, case-sensitive** testing-library queries. `DashboardSharingMenu.tsx`
contains no occurrence of "subscription" in any case — `grep -i subscription`
over it returns nothing. So both assertions are true by construction in *both*
directions; neither can ever detect the regression it is written to catch (the
real menu item, when it renders, is "Subscriptions"). Ported verbatim with the
analysis inline, per the faithfulness rule. Fixing them upstream means matching
`/subscriptions/i` (or the menuitem role), not deleting them.

### 2. `should("not.have.value")` with no argument is a chai-jquery tautology

In 24629, `cy.findByPlaceholderText(...).should("not.have.value")` asserts
`$el.val() === undefined` and negates it. `.val()` on an input returns `""`, never
`undefined`, so the assertion **always passes** — including with text still in the
box. The step's actual content is that the *placeholder query resolves at all*,
which only happens while `recipients.length === 0` (`RecipientPicker.tsx:49`).
Ported as the equally-tautological literal translation with the analysis, rather
than silently strengthened to `toHaveValue("")`.

### 3. 🔴 The region-map test's three assertions do not discriminate what it claims — 3 mutants, all survived

`renders a region (choropleth) map as an image in a subscription email` asserts
(a) no "An error occurred while displaying this card.", (b) `html` contains
`<img`, (c) `html` does not contain `99999` / `11111`. Its comment says *"a table
fallback would instead leak these values as text"*. Measured:

| input mutation | result |
|---|---|
| `display: "map"` → `"table"` | **survived** |
| `"map.region": "us_states"` → `"nonexistent_region"` | **survived** |
| native query → `SELECT * FROM NO_SUCH_TABLE_XYZ` | **survived** |

Presence-probe under mutation 1 (PORTING's "vacuous, or bad mutation?" method):
`has<img: true, has99999: false, has99,999: true, hasCA: true`. So the table
fallback **does** render — it just formats the metric with a thousands separator,
which assertion (c) cannot see, while assertion (b) is satisfied by the email's
own chrome images. Under mutation 3 the email is 5,756 bytes, carries the card
name, and contains no "error" substring at all.

Scope caveat, stated: the error string is reachable in code
(`src/metabase/channel/render/body.clj:53`), so assertion (a) is *not*
structurally impossible — the honest claim is "not triggered by any failure mode
I could induce for this card", not "vacuous". A discriminating version would
assert the un-separated digits' formatted form (`99,999`) is absent, or match the
`<img>` whose src is the card's rendered PNG.

Ported verbatim with all of the above inline. **This is the same three-assertion
shape as the object-detail and 15705 tests — but there the positive assertions
are load-bearing** (see the mutation table), so the weakness is specific to this
test, not the pattern.

### 4. The recipient placeholder disappears the moment a recipient is added — `.blur()` on it deadlocks

`RecipientPicker` only sets `placeholder` while `recipients.length === 0`. A
literal port of `cy.findByPlaceholderText(...).type("First Last{enter}").blur()`
therefore re-resolves a locator that has just stopped existing, and burns the full
timeout **on the blur**. This took out **15 of the first run's 20 failures**, all
with the same misleading `locator.blur: Timeout` fingerprint pointing at a helper
rather than the cause. Cypress never saw it because `.blur()` acted on the already
resolved subject. Fix: blur the live `document.activeElement`. Same root cause for
`assignRecipients`' `Escape`, which now targets the stable token-field input.

Generalisable: **any Cypress chain whose later links act on a subject the earlier
link's action invalidates needs the subject captured, not re-queried.**

### 5. maildev's list row is a mixed-content text node

`cy.findByText(subject)` (exact, own-text-nodes) matched maildev's email row;
Playwright's exact `getByText` compares the element's *full* text and matched
nothing, so `openEmailPage`/`viewEmailPage` timed out. Another instance of
PORTING's mixed-content-text-nodes rule, now on a third-party UI. Ported as a
substring regex + `.first()`.

### 6. `bcc-enabled?` — a setting key ending in `?` never survives a pathname comparison

`PUT /api/setting/bcc-enabled?` — the `?` starts the query string, so
`new URL(url).pathname === "/api/setting/bcc-enabled?"` can never match and the
`waitForResponse` times out. Any port anchoring on a `?`-suffixed Metabase setting
key (there are several: `bcc-enabled?`, `enable-public-sharing`… ) has this. Match
the `/api/setting/` prefix instead.

### 7. `check({ force: true })` on the embed wizard's "Allow subscriptions" checkbox reports "did not change its state"

Playwright's own log shows the click landing ("click action done") with the
checkbox unchanged. `dispatchEvent("click")` — which runs the input's activation
behaviour and React's `onChange` — works. Consistent with the
`click({force:true}) ≠ Cypress {force:true}` rule, and with Cypress's `.check()`
being a dispatch at the resolved element.

### 8. `H.fieldValuesCombobox().type(...)` — the dropped click plus the MultiAutocomplete submit trap, in one step

`should allow for setting parameters in subscription` failed with the pulse card
reading `"Text: Corbin Mertz and 1 more filter"` instead of
`"Text: 2 selections and 1 more filter"` — i.e. the Bobby Kessler pick silently
never landed while every surrounding step "worked". Two known gotchas stacked:
`pressSequentially` does not click (cy.type does), and the "Update filter" submit
fires while the `PillsInput` holds focus. Fixed with click + `pressSequentially` +
`blur()` before the submit. **Fingerprint worth knowing: the failure surfaced two
steps later, at a filter-description string, not at the picker.**

## Mutation testing — 13 mutants, 10 killed, 3 survived

Inverting the **input** in every case; never the expectation.

| # | mutation | outcome | died at |
|---|---|---|---|
| M1 | `press("Enter")` → no-op in `typeRecipient` (recipient never committed) | killed (2 tests) | `clickSend` — "Send email now" unreachable |
| M2 | object-detail fixture `'Hammer'` → `'Wrench'` | killed | assertion #2 `toContain("Hammer")` |
| M2b | object-detail `NULL AS discount` → `5 AS discount` | killed | **tail** `toContain("Empty")` |
| M3 | region map `display: "map"` → `"table"` | **survived** | — (finding 3) |
| M3b | region map `map.region` → nonexistent | **survived** | — |
| M3c | region map query → `SELECT * FROM NO_SUCH_TABLE_XYZ` | **survived** | — |
| M4 | 15705 dashboard parameter `default: "3"` → `"4"` | killed | **tail** `toContain("2,738")` |
| M5 | "Send only attachments" never enabled | killed | **tail** `toContain("Dashboard content available in attached files")` |
| M6 | mocked Slack channel id `C001` → `C009` (in the helper, not the assertion) | killed | **tail** `channel_id` assertion |
| M7 | 14117 "Questions to attach" never ticked | killed | `Questions to attach` visible |
| M7b | 14117 tick, then untick "Orders" | killed | same assertion (see below) |
| M8 | 24629 `Escape` → a no-op key | killed | `popover().toHaveCount(0)` |
| M10 | EE "no parameters" — add parameters first | killed | `"Set filter values…"` `toHaveCount(0)` |

Per the brief I checked **where** each died and aimed follow-ups at tails: M2b,
M4, M5 and M6 all die at their tests' *last* assertion, so those tails are proven
load-bearing rather than shadowed by assertion #1.

**Both of this spec's headline absence assertions are load-bearing** (M8, M10) —
which matters given the brief's warning that I was porting the surface where an
empty-state component fooled `admin-people`. The subscriptions sidebar's absence
checks are anchored on the loaded state (the email form's recipient input) and
they bite.

**Unproven, stated as such:** the final assertion of 14117
(`getByLabel("Orders")).toBeChecked()`). M7b unticks Orders, but Orders is the
only attachable card, so unticking it collapses the attachment section and the
mutant dies one assertion earlier. I could not construct an input mutation that
isolates that last line. Not claimed as proven.

## Fixmes

**None.** 42/43 executable, 0 `test.fixme`, and the one skip is upstream's own
`@skip` tag.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` is clean for both new files. (It does
report one pre-existing error in a sibling agent's `tests/joins-reproductions.spec.ts`
— `parameters` not in the question-details type — which is not mine and I did not
touch it.)

## Summary (3 lines)

Ported all 43 tests of `sharing/subscriptions.cy.spec.js`; 42 execute green on the
CI uberjar (single run, two consecutive runs, and `--repeat-each=2`), the one skip
is upstream's own `@skip` tag, and there are no fixmes.
This is a genuine read-the-inbox email tier (maildev 2.2.1, up), so `setupSMTP` is
the right helper rather than `configureSmtpSettings`; probing the `@OSS` gate
instead of applying it recovered 2 tests, and the gate-OFF control came back clean
at 35 skipped / 8 passed / 0 failed.
13 mutants: 10 killed (4 at tail assertions, including both absence checks), 3
survived — all three on the region-map test, whose assertions I measured cannot
distinguish a map from a table fallback and which I ported verbatim with that
analysis rather than silently strengthening.
