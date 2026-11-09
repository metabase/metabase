# Writing the filter bar spec: a guide

This guide is for moving the filter bar from prototype (Versions A, B and C) to a production feature. It doesn't contain the spec. It tells you **what to write, in what shape, and in what order**, so that the spec and the Figma files leave no gaps for the implementation to fill by guesswork.

Every bug in the prototype so far came from one of those gaps:

- "OR" + Enter picked the column "ID".
- Picking "is greater than or equal to" split the pill into two filters.
- The caret sat outside the pill after an operator.
- An empty popover drew as a thin line.
- The Filter button and F behaved differently on an empty bar.
- Removing the first filter left a dangling "AND".
- The pill changed width when you clicked into its number.

None of these were hard to fix. They were decisions nobody had written down. The spec's job is to write them down before code exists.

Work through the sections in order. Sections 1–3 are short and unlock everything else; section 4 is the bulk of the work, done one category at a time.

---

## 0. Know what you're specifying

The bar mixes two kinds of things, and most edge cases live where they meet:

| Thing | What it is in the editor | Can the caret be inside it? |
|---|---|---|
| **Finished pill** (filter, AI, opaque) | One atom node: a single unit of the document | No. The caret is before or after it. |
| **Draft pill** (a filter being typed) | Plain text, drawn to look like a pill | Yes, anywhere in it |
| **Connector** (`and`, `or`, `(`, `)`) | Plain text, drawn as a dark chip | Yes |
| **`+` button** | A widget drawn after the last character | No, and never to its right |
| **Popovers** | React, outside the editor | Focus stays in the editor, except for search inputs and pickers |

So "a pill" means two different things depending on its state. Every rule you write should say which one it applies to. Most of the bugs above were a rule written for one kind and hit by the other.

**Your first task:** read the glossary below, change any term you'd name differently, and use these words, and only these, in the spec and in Figma layer names.

### Glossary to confirm

- **Bar**: the whole filter row.
- **Expression**: everything in the bar, read left to right.
- **Pill**: a finished filter. Kinds: *filter pill* (column + operator + value), *opaque pill* (filters the bar can't edit inline, like dates, custom expressions, segments), *AI pill* (a prompt waiting for or failing to get an answer).
- **Draft**: a filter being typed, shown as a pill that grows. It becomes a pill when it's *committed*.
- **Part**: field, operator, or value, inside a pill or a draft.
- **Active part**: the part that has the caret.
- **Slot**: the space after a part where the next part goes, like the value slot after "is between ".
- **Connector**: `and`, `or`, `(`, `)`.
- **Implicit AND**: two pills next to each other.
- **Commit**: a draft turning into a pill.
- **Unwrap**: a pill turning back into a draft to edit it.
- **Preview**: ↑/↓ writing an option into the text while the list stays open.
- **Caret popover**: the suggestions under the draft. **Part popover**: opened by clicking a pill's part. **Picker**: the standard filter picker, for dates and other columns the bar can't edit inline.
- **Apply**: updating the question's query from the bar.

---

## 1. Write the states

List every state the bar can be in. Name each one, so the state table, the Figma frames and the tests can all refer to it. Here's a starting list from the prototype. Correct it and add what's missing:

**Bar states**
- `Collapsed`: the bar is hidden. Is this allowed with filters in it?
- `Idle`: not focused. Is the "Not applied" message shown here?
- `Focused-Empty`: focused, nothing typed.
- `Invalid`: the expression can't apply, like an unclosed "(" or text that isn't a filter.

**Draft states** (the caret is in a draft)
- `Draft-FieldPreview`: a column is filled in and selected, for a new filter.
- `Draft-FieldSearch`: typing a column name.
- `Draft-OperatorWhole`: a whole operator, with ↑/↓ previewing.
- `Draft-OperatorSearch`: part of an operator, like "is equal t".
- `Draft-Value`: typing or picking values. Sub-states: *single*, *multi*, *range: first*, *range: second*.
- `Draft-Picker`: a date or other column, with the standard picker open.
- `Draft-AIPrompt`: text starting with `/`, or text that matches no column.

**Pill states**
- `Pill-Idle`, `Pill-Hover`, `Pill-PartHover`, `Pill-Selected` (keyboard), `Pill-PartPopoverOpen`
- `AIPill-Loading`, `AIPill-Error`
- `Connector-Idle`, `Connector-Hover`

**Ask yourself for each state:**
1. Where is the caret, and is there a text selection?
2. Which popover is open, and what's highlighted?
3. Has the query been applied, or is it pending?
4. What does it look like? This becomes a Figma frame.

---

## 2. Write the state table

This is the core of the spec: one row per **state × trigger**. Leave nothing implicit. If a trigger does nothing in a state, write "nothing". That's still a decision.

### Triggers to cover

**Keyboard**
- A printable character, `Space`, `Enter`, `Tab`, `Shift+Tab`, `Esc`
- `Backspace`, `Delete`, `←`, `→`, `↑`, `↓`, `Home`, `End`
- `Cmd/Ctrl+A`, `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`
- `Cmd/Ctrl+C`, `Cmd/Ctrl+X`, `Cmd/Ctrl+V`
- Typing `and `, `or `, `(`, `)`
- `F` from outside the bar

**Mouse**
- Click on: a pill part, a pill's ×, a draft's ×, a connector (and its ×), the `+` button, empty bar space, outside the bar, a popover option
- Hover over a popover option
- Double-click
- Drag-select across pills

**From outside the bar**
- The header Filter button
- The question's query changing elsewhere: a column-header filter, undo in the query builder, navigation, loading a saved question
- The AI answering, or failing
- The window resizing or scrolling while a popover is open

### Table shape

| # | State | Trigger | Next state | Document change | Caret / selection after | Popover after | Applied? |
|---|---|---|---|---|---|---|---|

### Example rows (the prototype's current behavior; confirm or change them)

| # | State | Trigger | Next state | Document change | Caret / selection after | Popover after | Applied? |
|---|---|---|---|---|---|---|---|
| 1 | `Focused-Empty` | Filter button | `Draft-FieldPreview` | Insert first column name | Column name selected | Columns, first highlighted | No |
| 2 | `Draft-FieldPreview` | `↓` | `Draft-FieldPreview` | Replace column name with the next one (no undo step) | New name selected | Same list, next highlighted | No |
| 3 | `Draft-FieldSearch` "or" | `Enter` | `Draft-FieldPreview` | "or" becomes a connector, and a new draft starts after it | New column name selected | Columns | No |
| 4 | `Draft-OperatorWhole` | `↓` on "is greater than" | `Draft-OperatorWhole` | Replace with "is less than" (no undo step) | End of operator | All operators, the new one highlighted | No |
| 5 | `Draft-Value` range, first value "100" | `Space` | `Draft-Value` range, second | Add " and " | After "and ", inside the pill | Values for the second number | No |
| 6 | `Pill-Idle`, caret right after it | `Backspace` | `Pill-Selected` | None | Pill selected | None | No |
| 7 | `Pill-Selected` | `Backspace` | `Focused-*` | Pill removed | Where the pill was | Depends on what's around it | Yes, if the rest is valid |
| 8 | Any draft | Blur | `Idle` | A complete draft commits; a draft with only a column is removed | None | None | Yes, if valid |

**Tip:** don't write the table in one go. Do one state per sitting, and work through every trigger for it. That's where you find the "nothing" cases that turn into bugs.

---

## 3. Write the invariants

Invariants are rules that hold in **every** state, whatever the input. They're the cheapest guard against "fix bug A, break bug B": an implementation checks them after every change, and so can a test.

Here's a draft list from the prototype. For each one, mark it **Keep**, **Change** or **Drop**, and add your own.

**Document**
1. The bar is one line. `Enter` never inserts a line break.
2. The caret is never inside a finished pill. It's before or after it.
3. The caret is never to the right of the `+` button.
4. A connector word inside a column name, an operator ("greater than *or* equal to") or a known value is never a connector.
5. A draft commits only when it's complete: column, operator, and as many values as the operator needs.

**Applying**

6. The bar applies to the query only when the whole expression is valid. A half-typed state never reaches the query.
7. Pills next to each other mean AND. AND binds tighter than OR. A connector with nothing on one side is ignored.
8. The bar reloads from the query only when the query changed somewhere else, never because of its own apply.

**Visual**

9. A draft and the pill it commits to have the same size and spacing. Committing never moves anything.
10. A popover with nothing to show isn't drawn.
11. Only one popover is open at a time.
12. Clicking an option in a popover never moves focus out of the bar, except into a search input or a picker.

**History**

13. Previews (↑/↓ through columns or operators) don't create undo steps.
14. An AI answer arriving doesn't create an undo step of its own. *Open:* should undo after an AI answer bring back the prompt?
15. Undo after a commit… *Open:* does it bring back the draft text, or remove the pill?

**Ask yourself:** which of these are product rules a designer owns (7, 9, 11), and which are engineering rules the code must guarantee (2, 6, 8)? Write the product ones into the spec in plain words. Hand the engineering ones to implementation as a test list.

---

## 4. Specify one category at a time

Write the spec in these categories, one at a time, each its own section or page. Each category below lists the **questions the spec must answer**. If you can't answer one, mark it **Open** and keep going. Open questions are fine; missing ones aren't.

### A. Creating a filter
- **Entry points:** the Filter button on an empty bar, `F`, `+`, typing a connector, clicking empty bar space. Which of these start a new filter, and which only focus the bar?
- **Pre-filled column:** is it the first column, the most used one, or none? Is it selected, so typing replaces it?
- **After picking a column:** is the first operator pre-filled? Which operator is "first" for each column type?
- **Operators with no value** ("is empty"): do they commit right away?
- **Several values:** how is the next value added (comma, `Enter`, click)? When does the draft commit?
- **Ranges:** how is the second value reached (`Space`, `Enter`, typing "and")? Can the second value be smaller than the first?
- **Dates and other picker columns:** where does the picker open? What does the draft show while it's open, and what if the user closes it without picking?
- **Segments:** are they in the column list? What do they look like as a pill?

### B. Caret and selection
- **Arrows across pills:** do `←`/`→` select the pill on the way past, or skip it?
- **Arrows inside a draft:** can the caret move into the middle of a part? What does the popover do then?
- **Long expressions:** `Home`/`End` when the bar wraps to several lines.
- **`Cmd+A`:** what is selected, and what does `Backspace` do with it?
- **Dragging a selection** across pills, connectors and a draft: what can be deleted, copied, or replaced by typing?
- **Clicks:** inside a draft's part, on its edge, on the space between two pills.

### C. Editing an existing pill
- **Clicking a part:** for each part (column, operator, value), does it open a list, turn the pill back into a draft, or something else?
- **Keyboard editing:** how does a keyboard user edit just the value of a pill? (Today it's: select the pill, `Enter`, which unwraps the whole pill.)
- **Changing the column:** what happens to an operator or values that don't fit the new column?
- **Undoing an edit:** after editing a pill, does `Esc` restore the original, or keep the change?

### D. Deleting
- **Next to a pill:** `Backspace`/`Delete` select the pill first, then delete it. Keep this?
- **× buttons:** on a pill, on a draft, on a connector. Does each delete at once? Should there be an undo toast?
- **Inside a draft:** deleting the whole value, the operator, or everything. Does the draft go back a step, or disappear?
- **Leftovers:** what happens to a connector or parenthesis left without a partner?
- **The last filter:** does the bar stay open when it's empty?

### E. Logic: connectors and parentheses
- **Implicit AND:** confirm "pills next to each other mean AND". How is that shown, if at all (nothing, a faint "and", a gap)?
- **Typing a connector:** where can it be typed, and when does "or" stop being the start of a word like "Orders"?
- **Suggestions:** do connectors appear in the caret popover? Where, and when are they highlighted?
- **Parentheses:** how does the user group pills? Typing only, or also a gesture like select-and-wrap? What does an unmatched parenthesis look like?
- **Precedence:** is "AND binds tighter than OR" visible to the user, or only explained?
- **Loading a saved question:** how are its filters shown, implicit or explicit AND? And its OR groups?

### F. Popovers
For **each** popover (caret, part, picker, AI), answer:
- **Content:** what it shows in each draft state, and how options are grouped and ordered.
- **Highlight:** the default highlighted option, or none, and why.
- **Keys:** `↑`/`↓`, `Enter`, `Tab`, `Esc`. Does `Esc` close the popover, cancel the draft, or both in steps?
- **Mouse:** does hovering move the highlight? (Today it does, on mouse move only.)
- **Empty states:** no results, still loading, unavailable.
- **Position:** where it anchors (the draft's start or the caret), how it flips near the window edge, and its widths.
- **Footer:** what's in it (the logic operators hint, match counts, sample notes).

### G. Values
For each column type (text, number, coordinate, true/false, date, category with few or many values), answer:
- **Input and suggestions:** what is typed or picked, and which widget suggests values (tiles, list, map, histogram).
- **Validation:** what happens to a value that isn't valid, like letters in a number?
- **Display:** how a value is formatted in the pill (codes vs. names, thousand separators), and when values are cut short ("+3 more").
- **Operator display:** symbols (`=`, `>`, as in Version C) or words (Versions A and B). For which operators and which column types?

### H. AI
- **Triggers:** `/`, text that matches no column, the "Ask AI" option. Which ones stay?
- **While it thinks:** what the pill shows, and can the user keep typing elsewhere?
- **Success:** the answer becomes pills at once (Versions B and C). Are they marked as AI-made?
- **Failure:** what the error pill shows, and what the user can do (edit the prompt, remove, retry).
- **Several prompts:** two prompts at once, and a prompt removed before it answers.

### I. Applying and syncing
- **When the query updates:** on every commit, on blur, or on an explicit action?
- **Slow tables:** changes wait for Run. How is "not run yet" shown?
- **Invalid expression:** what's shown, where, and when? (Today: a "Not applied" line, only while the bar isn't focused.)
- **Outside changes:** when the query changes elsewhere while the user is mid-draft, what happens to the draft?

### J. Copy, paste and serialization
- **Copy:** what copying pills produces as text.
- **Paste:** pasting "status is paid or total > 100". Today it becomes pills, except the last one if the caret is in it.
- **Messy pastes:** text with line breaks, unknown columns, or quotes.

### K. Accessibility
- **Roles and announcements:** the bar's role and its name, what a screen reader announces for a pill, a connector, the popover and an AI result.
- **Keyboard-only:** can everything be done without the mouse? (This was a hard requirement in the v2 hand-off doc.)
- **Focus:** the focus ring for a selected pill, versus the hover state.

---

## 5. Turn the states into Figma frames

Name frames after the states in section 1, so the spec, the frames and the tests use the same words. Here's a checklist of frames the prototype shows are needed:

- [ ] **Pill:** idle, hover, part hover (column / operator / value / ×), selected (keyboard), part popover open
- [ ] **Draft:** each active part (column selected for preview, column, operator, value), the empty value slot, a range with its first value, a range with both values, multi values
- [ ] **Connector:** idle, hover with ×; parentheses; an unmatched parenthesis
- [ ] **`+` button:** idle, hover, after one pill, at the end of a wrapped second line
- [ ] **Caret popover:**
  - columns (with and without matches)
  - connectors at the bottom
  - operators (whole, searching)
  - values: tiles, list, map, histogram, "Use “x”"
  - AI option
  - no results
  - loading
  - footer
- [ ] **Part popover:** column and operator search
- [ ] **AI:** loading, error, the error popover; the answer turning into pills
- [ ] **Bar:** empty and focused, invalid with its message, slow table "not run yet", wrapped to two or three lines, very long values
- [ ] **Dark mode**, for all of the above

For each frame, note the **caret position** and **what's highlighted**. Those are the details the implementation gets wrong when a mockup leaves them out.

---

## 6. Report bugs with state, not prose

When something's off, during the build or in review, describe the state exactly. Write "the editor content and the caret, the key, what happened, what should have happened", not "the pill feels weird when I edit the number".

```text
STATE:  Draft-FieldSearch
Doc:    [pill: Tax is between 100 and 200] "or"
Caret:  after "or", no selection
Popover: Columns, "ID" highlighted
Input:  Enter

ACTUAL:   "ID" picked; the draft becomes "ID ="
EXPECTED: "or" becomes a connector; a new draft starts after it
Invariant broken: #4 (a connector word is a connector only when nothing else claims it)
```

**Implementation ask:** add a small debug panel to the bar (behind a dev flag) that shows the document as JSON, the selection, the draft's state and the popover's highlight. Then a bug report is a screenshot of that panel plus the key you pressed.

---

## 7. Tie every rule to a test

Each row of the state table and each invariant becomes a test, named after it, like `Draft-Value(range, first) + Space → adds "and"`. Three levels, cheapest first:

1. **Parser tests** (pure functions, milliseconds): splitting connectors, recognizing columns, operators and values, ranges, implicit AND, precedence. Most of the logic bugs above belong here. The prototype already has these (`parser.unit.spec.ts`).
2. **Editor tests** (a real editor in Jest, no browser): state × trigger rows. Set up the document and caret, press the key, check the document, the caret and the popover state.
3. **Browser tests** (Playwright or Cypress): focus, popover position, hover, the visual invariants like "the pill doesn't change width", and the full flows from the hand-off doc.

**Ask for tests before code.** For a new rule or a bug: first a test that fails, then the change, then all tests green. That's what stops a fix from quietly breaking an earlier one.

---

## 8. Decisions the prototype left open

These came up while building Versions A–C. Each needs an answer in the spec:

1. **Which version is the base:** B or C? Or a mix: B's draft pill with C's operator symbols?
2. **Operator symbols:** for numbers only, or also for text ("Category = Gizmo") and true/false?
3. **Pre-filled column:** keep it (B, C), or start empty with the list open (A)?
4. **Blur:** should a draft with only a column be removed when the bar loses focus? (Today: yes.)
5. **Implicit AND:** keep (B, C) or explicit (A)? Should implicit ANDs ever be shown?
6. **Value click:** clicking a value turns the whole pill back into a draft. Should it open a value popover on the pill instead, like column and operator?
7. **Esc in a draft:** close the popover only, or also cancel the draft?
8. **Connector deletion:** removing an `or` silently turns that pair into an AND. Is that the intended result, or should the user confirm?
9. **Values containing "and"/"or"** that aren't in the column's known list need quotes. Is that acceptable, and how is it explained?
10. **Not applied:** when and where the "Not applied" state shows, and whether invalid parts are marked in the bar itself.
11. **AI answers:** are they marked as AI-made after they turn into pills? Can they be undone back to the prompt?

---

## 9. Prompts to use with the coding agent

Once the spec exists, these keep each implementation session narrow.

**Spec review, before any code**
> "Here's the spec for category [X] and the state table rows [#–#]. Check them against the invariants in section 3 and the current code in `FilterExpressionBar[B|C]/`. List contradictions, unhandled state × trigger pairs, and any rule the editor model can't express (for example, a caret position that can't exist inside an atom node). Don't write code."

**One row at a time**
> "Implement state table row #N. First write an editor-level test that reproduces the current behavior and fails. Then show the editor transaction steps now, and the steps needed, before changing code. Then make the smallest change. Run the parser and editor tests, and list which invariants you checked."

**Bug fix**
> "Bug report below, in the section 6 format. Name the invariant it breaks. Write a failing test first. Fix it without changing any other row of the state table. If the fix needs a rule the spec doesn't have, stop and ask me instead of choosing."

**Visual parity**
> "Here are the Figma frames for [state]. Match spacing, colors (use theme tokens) and sizes exactly. Check invariant #9 (draft and pill are the same size) in a browser test."

---

### Suggested order of work

1. Glossary and state list: half a day.
2. Invariants: keep, change or drop each, and add yours: an hour.
3. Category A (creating), with its state table rows and Figma frames. Review it with engineering before going further, since it sets the patterns for the rest.
4. Then E (logic), C and D (editing and deleting), F and G (popovers and values), H (AI), I (applying), B (caret details), J and K.
5. The open decisions in section 8, as each category reaches them.
