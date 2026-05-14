# Metabase Slides — Design Spec

**Status:** Draft, in worktree `feat/metabase-slides`
**Author:** Ngoc (with Claude)
**Date:** 2026-05-14

## Goal

A Gamma.app-style slide-deck feature inside Metabase. Differentiator vs. PowerPoint / Google Slides / Gamma: **every chart on every slide is a live, interactive Metabase question.** Filter it, drill into it, refresh it — mid-presentation.

This spec describes a **polished MVP** good enough to demo and "try and feel". Not production-ready. No EE/OSS gating, no feature flag debate — we build where it's quickest to iterate, and worry about packaging later.

## Non-goals (deferred)

- Themes / template picker (one default theme only)
- PDF / image export
- Speaker notes
- Public sharing links
- Comments / collaboration
- Animations beyond a single slide-transition
- Slide-level "layouts" (cover/two-column/etc.) — just rely on TipTap blocks + FlexContainer
- Serialization (export/import)
- Embedding SDK support

These are real follow-ups but each adds days and the demo doesn't need them.

## User flow

1. `+ New → Slides` → empty deck with one blank slide, title "Untitled slides".
2. Editor: sidebar with slide thumbnails on the left, current slide in the middle, header with **Generate with AI**, **Present**, title, save indicator.
3. Author writes text, drops in a Metabase question (same flow as Documents — search → drop → resize), uses `+ Add slide` to add slides, drags to reorder.
4. **Generate with AI** opens a modal: textarea ("What's this presentation about?") + optional "Pick cards/dashboards to include". Hit *Generate* → loading state → 4–6 slides materialize in the sidebar. Author can keep editing.
5. Hit **Present** → fullscreen takes over, slide 1 fills the screen. Keyboard:
   - `→` / `space` / `PgDn` — next slide
   - `←` / `PgUp` — prev slide
   - `Home` / `End` — first / last
   - `esc` — exit
   - `f` — toggle browser fullscreen
6. Charts on each slide are clickable, filterable, drill-able, just like in a dashboard.

## Data model

### Entity: `:model/Slides` (table `slides`)

A standalone entity. **Approach B** from the brainstorm: each slide is its own TipTap document, stored in an ordered array.

| Column         | Type           | Notes                                       |
| -------------- | -------------- | ------------------------------------------- |
| `id`           | BIGSERIAL PK   |                                             |
| `entity_id`    | CHAR(21)       | NanoID, like other entities                 |
| `name`         | VARCHAR(254)   | NOT NULL                                    |
| `collection_id`| BIGINT FK      | nullable (root collection)                  |
| `creator_id`   | BIGINT FK users| NOT NULL                                    |
| `slides`       | JSONB          | NOT NULL, ordered array of slide objects    |
| `created_at`   | TIMESTAMP      | `:hook/timestamped?`                        |
| `updated_at`   | TIMESTAMP      |                                             |
| `archived`     | BOOLEAN        | default false                               |

`slides` JSONB shape:

```json
[
  {
    "id": "01J8K…",                        // client-generated nanoid, stable across reorders
    "doc": { "type": "doc", "content": [ … ] },   // TipTap JSON
    "layout": "default"                   // future-proofing; only "default" for MVP
  },
  …
]
```

Permissions: inherits parent collection (same as Documents — `:perms/use-parent-collection-perms`).

### TipTap content

Reuse the existing Document prose-mirror schema **wholesale**. Slides' TipTap docs can contain all the same nodes Documents support, including:

- `cardEmbed` (interactive Metabase question)
- `flexContainer` (side-by-side cards)
- `resizeNode`
- Standard text/heading/list nodes

We do **not** add a `slideBreak` node — slides are explicit array elements, not inline separators.

### Why standalone over an extension of Documents

- Cleaner mental model: a Slides record is *a deck*, not a doc that happens to render paginated.
- Each slide gets its own undo history and editor instance, which matches author expectation when navigating between slides.
- Avoids polluting the Document schema with presentation-only concerns.

## Backend

### Namespace layout

Build under `src/metabase/slides/` (mirror `src/metabase/documents/`):

```
src/metabase/slides/
  api.clj              ; route assembly
  api/slides.clj       ; CRUD endpoints
  api/generate.clj     ; AI generation endpoint
  core.clj             ; public api (small)
  init.clj             ; namespace requires for init
  models/slides.clj    ; toucan2 model
  schema.clj           ; slide JSONB schema validation
  ai.clj               ; LLM prompt + tool definition
```

Routes registered into `metabase.api.routes` under `/api/slides/` (top-level, not nested in collections).

### Endpoints

| Method | Path                       | Body / Query                                | Returns           |
| ------ | -------------------------- | ------------------------------------------- | ----------------- |
| GET    | `/api/slides/`             | `?collection_id=&archived=`                 | array of metadata |
| POST   | `/api/slides/`             | `{name, collection_id?, slides?}`           | full deck         |
| GET    | `/api/slides/:id`          |                                             | full deck         |
| PUT    | `/api/slides/:id`          | `{name?, collection_id?, slides?, archived?}` | full deck       |
| DELETE | `/api/slides/:id`          |                                             | 204               |
| POST   | `/api/slides/generate`     | `{prompt, card_ids?, dashboard_ids?}`       | `{slides: [...]}`|

All endpoints use `api.macros/defendpoint` with malli schemas.

### Migration

Single Liquibase changeset adding the `slides` table. Use the standard pattern (see recent Documents migrations).

### Schema validation

```clojure
(def SlideSchema
  [:map
   [:id :string]
   [:doc map?]                         ; TipTap JSON, validated structurally elsewhere
   [:layout {:optional true} [:enum "default"]]])

(def SlidesArray [:vector SlideSchema])
```

## AI slide generation

### Approach

Single LLM call to Anthropic via the existing `metabase.llm.anthropic` namespace, using **tool use** with a `generate_slides` tool whose JSON schema describes the deck shape. Tool input becomes our response.

### The tool schema (what the model is forced to return)

```json
{
  "name": "generate_slides",
  "description": "Generate a slide deck outline",
  "input_schema": {
    "type": "object",
    "required": ["title", "slides"],
    "properties": {
      "title": {"type": "string"},
      "slides": {
        "type": "array",
        "minItems": 3, "maxItems": 8,
        "items": {
          "type": "object",
          "required": ["type", "title"],
          "properties": {
            "type": {"enum": ["cover", "content", "chart", "closing"]},
            "title": {"type": "string"},
            "subtitle": {"type": "string"},
            "bullets": {"type": "array", "items": {"type": "string"}},
            "card_id": {"type": "integer"},     // for type=chart
            "card_caption": {"type": "string"}
          }
        }
      }
    }
  }
}
```

### Context the LLM sees

System prompt (paraphrased):
> You are designing a short, punchy slide deck for a business audience using Metabase. Each slide should be focused. When the user provides cards, include them as `chart` slides with a short caption explaining the insight. Always start with a `cover` slide and end with a `closing` slide.

User prompt:
```
Topic: <prompt>

Available cards (id — name — description):
  142 — Monthly Active Users — count of distinct users per month
  201 — Revenue by region — …

Available dashboards (id — name):
  17 — Q1 Exec Summary

Produce a deck.
```

### Translating LLM output → TipTap docs

Backend converts the structured output to TipTap JSON before returning to frontend, so the FE just calls `setSlides(response.slides)`:

- `cover`: large heading + subtitle (centered, "cover" layout class)
- `content`: heading + bullet list
- `chart`: heading + `cardEmbed` node for `card_id` + optional caption paragraph
- `closing`: large heading + subtitle

This conversion lives in `metabase.slides.ai/llm-output->slides`.

### Error handling

If the LLM call fails or returns an unparseable result, the endpoint returns 502 with a friendly message. The frontend toast says "Couldn't generate slides — try again or write them by hand." No retries from the backend (the user is right there and can click again).

## Frontend

### Routes

```
/slides/:entityId            → editor (entityId="new" → create-on-first-save)
/slides/:entityId/present    → presenter (full-screen)
```

Add to the app router next to `/document`.

### Directory

```
frontend/src/metabase/slides/
  routes.tsx
  components/
    SlidesPage.tsx                 ; outer page (loads deck, header)
    SlidesEditor/
      SlidesEditor.tsx             ; sidebar + main editor
      SlideThumbnail.tsx           ; sidebar item
      SlideThumbnailList.tsx       ; sortable list
    SlidesHeader.tsx
    Presenter/
      Presenter.tsx                ; full-screen container, keyboard handling
      Slide.tsx                    ; renders a single slide read-only
    GenerateModal/
      GenerateModal.tsx
      CardPicker.tsx               ; lightweight wrapper around existing search
  api.ts                           ; RTK Query endpoints
  slides.slice.ts                  ; deck state (current slide index, dirty flag, etc.)
  selectors.ts
  hooks/
    useSlidesAutosave.ts
    usePresenterKeyboard.ts
  types.ts
```

### Editor — visual layout

```
┌────────────────────────────────────────────────────────────────────┐
│  [< back]   Untitled slides       [✨ Generate]  [▶ Present]  [⋯]  │  ← SlidesHeader
├──────────────┬─────────────────────────────────────────────────────┤
│   1          │                                                     │
│ ┌──────────┐ │                                                     │
│ │ thumbn.  │ │                                                     │
│ └──────────┘ │            current slide content                    │
│              │            (TipTap editor, max-width centered)      │
│   2          │                                                     │
│ ┌──────────┐ │                                                     │
│ │ thumbn.  │ │                                                     │
│ └──────────┘ │                                                     │
│              │                                                     │
│  [+ Slide]   │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

- **Sidebar:** ~220px, dark-grey, vertical list of thumbnails. Each thumbnail is a scaled-down read-only render of the slide (CSS `transform: scale(0.18)` on a real `<Slide>` component — cheap, accurate, interactive-ish if needed).
- **Reorder:** drag handle on each thumbnail (`@dnd-kit` — already used in dashboards/documents).
- **Selection:** click thumbnail = make active.
- **+ Slide:** appends a new blank slide and selects it.
- **Delete:** menu on each thumbnail (3-dot or hover X), confirms if non-empty.

### Editor — main area

- Reuses the existing `Editor` component from `frontend/src/metabase/documents/components/Editor` **almost verbatim**.
- The editor instance is **per-active-slide**: when the user clicks a different thumbnail, we re-mount with `key={slide.id}` and load that slide's doc. This guarantees clean undo history per slide.
- On every TipTap update, we patch the active slide's `doc` in Redux and the autosave hook debounces a `PUT /api/slides/:id`.
- Max content width ~960px, centered, with comfortable padding. White background, slight shadow to evoke a "slide".

### Generate modal

Triggered by sparkles button. Mantine `Modal`.

```
┌─────────────────────────────────────────────────────────┐
│  ✨ Generate slides                                      │
│                                                          │
│  What's this presentation about?                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ e.g. Q3 product review for the leadership team  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Include these from Metabase: (optional)                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ [search cards & dashboards…]              [+]   │    │
│  │  ▸ Monthly Active Users          ×              │    │
│  │  ▸ Revenue by region             ×              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│                              [Cancel]   [Generate ✨]    │
└─────────────────────────────────────────────────────────┘
```

- Card picker uses existing search components (`SearchInput` over `search?models=card,dashboard`).
- On Generate: POST `/api/slides/generate`, loading spinner inside the button, on success **replace** the current deck's slides (after a confirmation if it's non-empty). Reset to slide 1.

### Presenter

- New route, **not** wrapped in the standard app shell — completely full viewport.
- Background: subtle dark gradient (`#0F0F12` → `#1A1A1F`).
- Slide rendered centered, 16:9 aspect ratio, max ~1280×720 logical, with white card background and large readable typography.
- Slide transitions: simple horizontal slide (`translateX`) + opacity, ~250ms, ease-out. Direction depends on nav (`next` vs `prev`).
- Bottom-center thin progress bar + "3 / 7" counter, auto-hides after 2s of mouse inactivity.
- Top-right `Esc` hint + exit button.
- **Charts stay interactive.** Because we render the same `cardEmbed` node React component as the editor, clicks/filters/drill work. Keyboard handler is attached to a wrapper div and checks `e.target` — if it's inside a chart's interactive surface (input, button, select), we don't swallow the arrow keys.

### State

Slices:

```ts
// slides.slice.ts
interface SlidesState {
  deckId: number | "new";
  name: string;
  slides: Slide[];
  activeSlideIndex: number;
  isDirty: boolean;
  isSaving: boolean;
  // generation modal
  generateOpen: boolean;
  isGenerating: boolean;
}
```

Autosave: same shape as Documents — debounce 1.5s on slide content changes, immediate on name change, status indicator in header (`Saved 3s ago` / `Saving…`).

### App-shell integration

- Add **Slides** entry to the `+ New` menu (next to Document). Icon: `presentation`.
- Add a Slides icon to collection items so existing browse / search picks them up. (Search indexing is best-effort for the MVP — full search.spec wiring is a follow-up.)
- Skip a dedicated "browse all slides" page; users find decks in their collection.

## Polish budget

These are the things that separate "demo-able MVP" from "rough prototype":

- Smooth, snappy slide transitions in the presenter
- Real-render thumbnails (not text snippets)
- Clean keyboard UX in the presenter (incl. not breaking chart interactivity)
- Empty state for the deck (e.g., "Drop a chart here or write something")
- Loading skeleton in the AI generate modal
- Reasonable default slide content when AI returns weird output
- Title slide that doesn't look like a content slide (centered, larger heading)
- Don't ship with TODOs, console.logs, or unhandled errors

## Out of scope, explicitly

- No tests beyond happy-path manual verification. (MVP. We'll write tests if this graduates.)
- No telemetry / analytics events.
- No serdes / export / import.
- No search indexing entry in `search.spec`.
- No collection picker in the app — defaults to root or current collection.
- No revision history.
- No mobile layout.

## Open questions deferred to implementation

- Do thumbnails render the CardEmbed components at full fidelity (live data) or do we lazy-load placeholders? **Initial answer:** render them lazily, only when the thumbnail is in view, to keep sidebar light.
- Are chart filters in presenter persisted back into the deck doc? **Initial answer:** no — they're presentation-time only and reset when the slide is left and re-entered.
- What happens when an embedded card is deleted? **Initial answer:** show the existing CardEmbedNode "card not found" fallback. Already handled by Documents.

## Done means

- I can click `+ New → Slides`, get a blank deck.
- I can drop a real chart from search onto a slide, see it render live.
- I can add 3+ slides, reorder them by drag.
- I can click ✨ Generate, type "Show me how my user growth is going this quarter", select an MAU card, click Generate, and a 4–6 slide deck appears with the MAU chart embedded on one of them.
- I can click ▶ Present, the deck goes fullscreen, arrow-key through, and I can drill into the embedded chart mid-slide without breaking navigation.
- It looks good.
