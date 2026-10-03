# documents/comments.cy.spec.ts → tests/documents-comments.spec.ts

48 tests, 1:1 with the Cypress original (including the one `it.skip` →
`test.fixme`). Port written by an earlier agent, verified here.

Fidelity cross-checks in this file were run with the **original Cypress spec
against the same slot-7 backend** (`MB_JETTY_PORT=4107 GREP="<test name>"
bunx cypress run --config-file e2e/support/cypress.config.js --spec
e2e/test/scenarios/documents/comments.cy.spec.ts`), port 4000 never touched.
Running the unmodified Cypress spec needs snowplow-micro (its `beforeEach`
calls `H.resetSnowplow()` → `localhost:9090/micro/reset`); I brought the
container up (`snowplow/docker-compose.yml`) rather than patching the spec,
so the comparison is against the spec exactly as CI runs it.

---

## 1. Real app race: Escape during comment creation resurrects the sidebar

**Status: real product race, found by the port, invisible to Cypress.**
Scoped narrowly — see "what this is NOT" below.

`CommentsSidesheet.handleSubmit` awaits `createComment`, then calls
`deleteNewParamFromURLIfNeeded(location, dispatch)` to strip `?new=true`.
That helper (`frontend/src/metabase/comments/utils.ts:126`) replaces the URL
using the **`location` captured when the submit started**:

```js
dispatch(replace({ pathname: location.pathname, search: newSearch }));
```

`location.pathname` is the *comments* route. So if the user leaves that route
between pressing Cmd+Enter and the mutation resolving, the late `replace`
navigates them **back** to the comments route.

Observed directly by instrumenting `history` in the browser (probe, now
deleted). Pressing Escape in that window produces:

```
[["push","/document/1"], ["replace","/document/1/comments/b7fa322a-…"]]
```

i.e. Escape's `closeSidebar()` → `navigate("..")` **worked** (`push
/document/1`), and was then undone ~immediately by the stale `replace`. The
sidebar reopens and the URL silently returns to the comments route.

**Why Cypress cannot see this.** The race window is "mutation in flight".
Cypress's command-queue latency between `cy.realPress([META,"Enter"])` and
the subsequent `cy.realPress("Escape")` (several retried `.should()`s, each
with queue overhead) is reliably longer than the POST, so the `replace` has
always landed before the Escape. Playwright issues the same steps fast enough
to land inside the window. The original Cypress test passes on the same
backend — cross-check run, see header.

**User-visible?** Plausible but narrow: submit a comment with Cmd+Enter in a
new (`?new=true`) thread and hit Escape before the request returns — the
sidebar reappears. Needs a fast user or a slow network. I have **not**
verified it by hand in a browser, and have not checked whether other exits
from the route (clicking the X, browser Back, a link) hit the same stale
`replace` — the same code path suggests they would, but I did not test it.

**What this is NOT**: not a port defect (the port's selectors and flow match;
Cypress passes because it's slower, not because it does something different),
and not something CI would catch today.

**Port fix**: anchor the submit on its `POST /api/comment` response
(porting rule 2 — the submit is a request-triggering action and the original
had no wait, relying on incidental slowness). `waitForCommentCreated` in
`support/documents.ts`; registered before the submit, awaited after, at the
submit sites that are followed by a navigation/Escape.

---

## 2. NEW GOTCHA (harness-wide): a parked real cursor opens a tooltip that
swallows the next Escape

**Status: port defect, but a general one — added to PORTING.md.** Worth
reading even if you never touch documents: it silently eats keystrokes, and
the failure looks like "the app ignored my Escape".

Symptom: `page.keyboard.press("Escape")` did nothing — the comments sidebar
stayed open. A *second* Escape closed it.

Mechanism, established by instrumenting the page rather than inferring:

1. A capture-phase window listener saw the Escape; a bubble-phase window
   listener on the same event **never fired** → something called
   `stopPropagation()` mid-flight.
2. Monkey-patching `Event.prototype.stopPropagation` to capture a stack
   trace pinned it to **floating-ui's `useDismiss`** (`vendor.hot.bundle.js`,
   `if (!escapeKeyBubbles) { event.stopPropagation(); … }`). It runs only
   when a floating element is `open`, and `escapeKeyBubbles` defaults false.
3. Dumping open floating elements *before* the Escape named the culprit: a
   Mantine tooltip reading **"Jul 18, 2026, 12:03 AM"** — the comment
   timestamp tooltip behind "a few seconds ago".

Why it only happens in Playwright: **Cypress's `.click()` is synthetic and
does not move the OS cursor.** In the original, the real mouse is left by the
last `realHover()` on the *document node* and never enters the sidebar.
Playwright's `.click()` moves the real cursor and **leaves it parked** — so
when the submitted comment renders under it, its timestamp tooltip opens and
eats the first Escape.

So the app is fine and the original is fine: `CommentsSidesheet`'s
`useWindowEvent("keydown")` never saw the event. Note this is the same
failure shape PORTING.md already warns about for FINDINGS #24 — *the absence
of a reaction you expected is evidence about your harness, not the app*.

**Fix**: `parkMouseAwayFromTooltips` (`support/documents.ts`) — move the
mouse to (0,0) and wait for `[role="tooltip"]` to hit 0 before a keyboard
Escape that must reach a window listener.

**Generalisation for other porters**: any ported test that Playwright-clicks
and then sends Escape (or any key handled at window level) can lose that key
to a tooltip under the parked cursor. Mantine tooltips are everywhere, so
this is not a documents-specific trap.

---

## 3. Keystroke pacing: Playwright outruns ProseMirror and frimousse

**Status: port defect, new gotcha (added to PORTING.md).**

Three tests failed because repeated `page.keyboard.press` calls have no gap,
while every `cy.realPress` is its own Cypress command and therefore always
had command-queue latency between presses. Two editors can't keep up:

- **ProseMirror selection** — "supports basic formatting with keyboard
  shortcuts" / "with formatting menu" applied bold/italic/strike/code to the
  wrong words (`expected "bold", received " i"` / `"old "`). Arrow keys
  arriving back-to-back drop/coalesce selection updates, so the running
  offset arithmetic drifts.
- **frimousse (emoji picker)** — see below.

Fix: `realPress`/`pressTimes` in the spec now pace presses at
`KEY_DELAY_MS` (25ms), the same cadence `realType` already used.

### 3a. The emoji picker needs gates, not just pacing

`supports emojis` was the most stubborn. Two separate async races, both
masked by Cypress's latency:

1. **Enter takes row 0 of an async-filtered list.**
   `EmojiSuggestionExtension`'s Enter handler reads the live DOM:
   `popup.querySelector("[data-active]") ||
   popup.querySelector('[frimousse-row][aria-rowindex="0"] [data-emoji]')`.
   frimousse filters asynchronously, so typing `:eggplant` + Enter selected
   🥺 — a leftover match for an earlier prefix. Asserting 🍆 was *somewhere*
   in the picker was **not** a sufficient gate (it can be present while row 0
   still lags). `expectFirstEmojiSuggestion` gates on the exact element the
   handler reads.

2. **Arrow navigation from a still-filling grid.** `:smile` + ArrowDown +
   ArrowRight gave 🥲 instead of 😊. Dumping the grid showed why the intent
   is sound — row 0 is `😼 🥲 😀 …`, row 1 is `🙃 😊 😇 …`, so down-then-right
   is 😊 — but the extension itself documents that the first arrow may be
   spent initialising navigation rather than moving ("initiating navigation
   is restricted by frimousse's internal logic, depending on 'interaction'
   type"). That state has **no DOM signal**, so a settle gate can't see it.
   `pressArrowUntilActive` re-nudges until the active cell arrives — the
   pattern PORTING.md already prescribes for editor autocomplete. Safe to
   repeat: each press moves at most one cell and we stop on arrival.

Worth noting (**not** claimed as a bug — Cypress passes and I did not check
it by hand): both are real async races in the app. A user typing
`:eggplant<Enter>` fast enough could get the wrong emoji. Narrow, low-stakes,
recorded only so the next person who sees it has the context.

---

## 4. Known gotcha the port missed: mixed-content text nodes

**Status: port defect, gotcha already in PORTING.md** — the brief's
feedback-loop rule says this one should have been avoided, not rediscovered.

"handles commenting with users without first and last names" asserted
`getCommentByText(sidebar, "needs to see this")` with exact matching. The
mention renders as its own span, so the paragraph's full text is
`"@no-name@metabase.test needs to see this"`. testing-library's `findByText`
matches an element's *direct text nodes* (so the original's exact string was
right); Playwright's exact `getByText` compares the element's *whole* text
and never matches. The spec's own comment even flags the shape of the DOM
("mention is it's own span").

Fix: `getCommentByText` now takes `string | RegExp`, plus
`commentTextContaining` for case-sensitive substring matching at that call
site. The sibling assertion (`@no-name@metabase.test`) stays exact — the
mention span's own text *is* exactly the handle.

---

## 5. Flake seen once, not reproduced

"allows to create / update / delete comments" failed once at `My Reply 1`
(the edit-autofocus step) during a 6-test batch, then passed standalone and
in every subsequent run including `--repeat-each=2`. Left as-is; recorded
here so a recurrence isn't treated as new.

---

## Environment note for whoever runs Cypress next

The unmodified Cypress spec's `beforeEach` calls `H.resetSnowplow()`, which
hard-fails without snowplow-micro (`localhost:9090`) — the whole spec dies in
`before each hook` in ~1s. `docker compose -f snowplow/docker-compose.yml up
-d` fixes it; it is **left running**. Also: other agents' concurrent Cypress
runs race this one on the shared `example_custom_viz` tarball fixture that
`e2e/support/config.js:135` builds in `setupNodeEvents`, which throws and
produces a confusingly interleaved log naming *another agent's* spec. If a
Cypress cross-check dies in the config, just retry.
