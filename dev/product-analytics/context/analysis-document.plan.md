---
name: PA analysis document
overview: Rework the event analysis builder into a document. Analyses are their own editor node next to text and regular charts. The data source and date range belong to the document. Clicking an analysis card puts it in edit mode, which shows a toolbar in the card header and a right panel with Setup, Advanced and Insights tabs. Insights and drill-throughs add new cards to the document instead of navigating away.
todos:
  - id: editor-extension-points
    content: Let a host add tiptap extensions and slash command sections to the documents Editor, and let a command run a callback
    status: completed
  - id: page-and-routes
    content: AnalysisDocumentPage on the standard document API, new routes, New → Event analysis points here
    status: completed
  - id: document-context
    content: Document-level table and date range stored in the doc node's attrs, with a header that edits them
    status: completed
  - id: analysis-node
    content: productAnalysis node and its view mode (title strip, chart, lazy loading, drill-through clicks on the chart)
    status: completed
  - id: inserting
    content: Illustrated gallery as the empty-document state, "+" on an empty line, Analyses section in the slash menu
    status: completed
  - id: edit-mode
    content: Click the card frame to edit; one card at a time; the card header becomes the toolbar; exit rules
    status: completed
  - id: side-panel
    content: Right panel with Setup / Advanced / Insights tabs for the card being edited
    status: completed
  - id: insights-to-document
    content: An insight's "Add to document" inserts a copy below the source card
    status: completed
  - id: funnel-breakdown
    content: Funnel breakdown setting, so an inserted insight is an editable analysis rather than a native question
    status: completed
  - id: drill-to-document
    content: Drill-through inserts the resulting analysis below the clicked card
    status: completed
  - id: standard-editor-guard
    content: Keep the standard document page from opening, and so dropping the nodes of, an analysis document
    status: completed
isProject: false
---

# Product analytics: analysis documents

## Goal

Today an event analysis is one chart on its own page (`AnalysisWorkspace`). We want a document where people can mix several analyses with text and regular charts, and build up a narrative: "here's the funnel, here's where people drop off, here's who drops off."

This replaces the current flow. If we like it, `NewAnalysisPage`, `AnalysisPage` and `SavedAnalysisPage` go away, and **New → Event analysis** opens a new analysis document.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Node | A new `productAnalysis` node type, not the existing `cardEmbed` |
| Source of truth | The analysis definition lives in the node's attrs. The SQL is derived from it on the client. |
| Data source and date range | Global to the document. No per-card override for now. |
| Edit mode | One click on the card frame (not the chart) enters it. One card at a time. |
| Toolbar | In the card header while editing. Expect to iterate on what fits. |
| Panels | One right-hand panel with Setup / Advanced / Insights tabs. Only one is open at a time. |
| Insight → document | Inserts a **copy** below the source card. Whether it should be linked is unresolved (see [Later](#later)). |
| Inserted insights and drills | Should be analyses themselves, so the same tools can edit them |
| Side-by-side | Not supported for analysis nodes |
| "Expand" to a full-page editor | Not now |
| Marking insights already in the document | Not now |
| Module boundaries | Same approach as Explorations: `product-analytics` imports from `documents` directly. This is a known hack, acceptable for a prototype. |

## UX

### Creating a document

**New → Event analysis** creates an empty, unsaved analysis document.

```
┌───────────────────────────────────────────────────────────────┐
│ Untitled analysis                                     [Save]  │
│ Event data: [ events ▾ ]   ·   [ Last 30 days ▾ ]             │
│───────────────────────────────────────────────────────────────│
│                                                               │
│   Choose an analysis to start with                            │
│   ┌────────┐ ┌────────┐ ┌────────┐                            │
│   │ Funnel │ │ Paths  │ │ Habit  │   (illustrated cards,      │
│   └────────┘ └────────┘ └────────┘    same as NewAnalysisPage)│
│   ┌────────┐ ┌────────┐                                       │
│   │Lifecyc.│ │Cohorts │                                       │
│   └────────┘ └────────┘                                       │
│   …or just start writing.                                     │
└───────────────────────────────────────────────────────────────┘
```

- The **document header** holds the title, the event table picker (today's `EventTablePicker`) and the date range (today's `DateRangeButton`). Every analysis in the document uses both.
- While no table is picked, the gallery is disabled, as it is today. The table picker keeps the ClickHouse-only restriction.
- The **empty-document state is the illustrated gallery**. Picking a card inserts that analysis, already in edit mode with Setup open. Typing makes the gallery disappear like a normal placeholder.

### Inserting more analyses

- **"+" on an empty line.** When the cursor is on an empty paragraph, a "+" appears in the left margin. Clicking it opens a popover with the same illustrated grid, smaller.
- **Slash menu.** An "Analyses" section lists the five kinds, with icons rather than full illustrations. The existing "Chart" command still embeds regular questions.
- A new analysis always enters edit mode with Setup open, because it can't run until it's set up.

### View mode

```
┌─ Funnel ─────────────────────────────── ✎ ─┐  ← title strip: click target for edit mode
│ How many people get through each step?     │
│                                            │
│   ███████                                  │
│   ███████  █████                           │  ← chart: clicks are drill-through
│   ███████  █████  ██                       │
└────────────────────────────────────────────┘
```

- The card has a title strip with the analysis name, its question, and a pencil that appears on hover. Hovering the card outlines it. Clicking anywhere on the card frame (the strip, padding or border) enters edit mode.
- Clicking the chart is drill-through, never edit mode.
- Readers who can't write to the document never see edit affordances.
- An incomplete analysis shows the existing "missing setup" state from `AnalysisResult`. Its button enters edit mode with Setup open.

### Edit mode

```
┌──────────────── document ─────────────────────────┐┌── panel ─────────────┐
│ ┌─ Funnel ──────────────────────────────────────┐ ││ [Setup][Adv][Insights]│
│ │ [Steps][⚙] [Uniques▾] [Filter] [Day▾] [SQL] Done││                      │
│ │                                               │ ││  Steps               │
│ │   ███████                                     │ ││  1. Viewed pricing   │
│ │   ███████  █████                              │ ││  2. Started trial    │
│ │   ███████  █████  ██                          │ ││  + Add step          │
│ └───────────────────────────────────────────────┘ ││                      │
│ Some text the user wrote…                         ││                      │
└───────────────────────────────────────────────────┘└──────────────────────┘
```

- **Toolbar.** The card's title strip turns into the toolbar. It holds what's left of `AnalysisToolbar` once the table, date range and Save have moved to the header: the Setup and Advanced toggles, counting, filter, granularity, Insights, SQL, and Done.
  - Expect overflow. A first pass can collapse the less-used controls (SQL, filter) into a "…" menu. Settle the layout by trying it.
- **Right panel.** It has three tabs: Setup (`SettingsPanel` with the `setup` section), Advanced (`SettingsPanel` with the `advanced` section), and Insights (`InsightsPanel`, funnels only). Clicking a toolbar toggle opens the panel on that tab, and clicking it again closes the panel. Analyses without advanced settings or insights don't show those tabs.
- **The document column moves over** to make room for the panel; it doesn't get narrower. When a card enters edit mode, it scrolls into view so the user can watch it change.
- **Only one card at a time.** Clicking another analysis card moves edit mode to it, keeping the same panel tab if that card has it.
- **Leaving edit mode:** Esc, Done, clicking into document text, or clicking a non-analysis node. Clicking inside the panel or a popover it opens does **not** leave edit mode.
- **Undo.** Each settings change is a document transaction, so Cmd-Z undoes it, including while still in edit mode.

### Insights → document

- In the Insights tab, "Explore" becomes **Add to document**. It inserts the insight as a new card directly below the source analysis. If insights from the same source were already added this session, it goes below the last of them, so they keep the order they were added in.
- The new card flashes briefly. The panel stays open, and edit mode stays on the source card, so several insights can be added in a row.
- The inserted card is a **copy**. Editing the source funnel later doesn't change it.
- It's an analysis: a funnel with a breakdown by the insight's attributes (see [Funnel breakdown](#funnel-breakdown)), so the same tools can edit it.

### Drill-through → document

Same rule as insights: a drill-through inserts its result as a new card below the one that was clicked, and never navigates away. The "hello world" action in `click-actions-mode.ts` turns into a mechanism: a click action can return an analysis definition to insert. Which drills each analysis offers is a separate design question. The prototype needs at least one real drill to prove the mechanism.

### Side-by-side

Analysis nodes can't be placed side by side, and this comes free. `FlexContainer`'s schema only accepts `(supportingText|cardEmbed)`, and the drop handlers in `HandleEditorDrop` only act on `cardEmbed` and `supportingText`. A dragged `productAnalysis` node falls back to ProseMirror's default block move, which is what we want. Regular charts in the same document can still go side by side.

## Architecture

### Where it lives

- `product-analytics/pages/AnalysisDocumentPage.tsx` is the page. It follows `explorations/components/ExplorationSummary`: it uses `useDocumentEditor` for load, save and unsaved changes, renders the documents `Editor` with a `hostOverride`, and lays out the right panel next to it.
- `product-analytics/document/` holds the node, its view, the page context, the header, the panel and the insert UI.
- **Routes:** `event-analysis/new` (replaces `NewAnalysisPage`) and `event-analysis/document/:id`. The old `new/:kind` and `:cardId` routes stay unlinked until we remove them. `NewItemMenuView` points **Event analysis** at the new route.

### Persistence

An analysis document is an ordinary Document (`/api/document`); nothing new is needed on the backend. `prose_mirror.clj`'s `::node.attrs` is an open string-keyed map, so new node types and attrs round-trip.

- **Doc node attrs** hold the document-level context, which also marks the document as an analysis document:

  ```json
  { "type": "doc",
    "attrs": { "product_analytics": { "version": 1, "table_id": 42, "date_range": { … } } },
    "content": [ … ] }
  ```

  Add them with `addGlobalAttributes({ types: ["doc"], … })` and write them with `tr.setDocAttribute`, so changes to the table or date range are undoable too. If tiptap gets in the way, the fallback is a non-deletable header node at the top of the document.
- **`productAnalysis` node attrs:** `_id` (a uuid, for comments and for finding the node) and `definition: { version, kind, settings }`. This is `ProductAnalyticsDefinition` without `table_id`, because the table comes from the doc. `date_range` is no longer a per-card setting either: the document's value is merged into the card's settings before `useAnalysis` runs.
- Nothing is written to `report_card`. The compiled SQL is never stored. That keeps the prototype simple, but it means analyses in a document can't be added to a dashboard or found in search. That's acceptable for now.
- **Check early:** that nested setting values (event definitions with filters) round-trip unchanged through `normalize-document`.

### Editor extension points (the documents "hack")

The documents `Editor` has a fixed extension list and a fixed slash menu. Explorations got by with `hostOverride` because it only *restricts* the editor; we need to *add* to it. Smallest changes in `documents` / `rich_text_editing`:

1. An `extraExtensions` prop on `Editor`, appended to the list. It carries the `productAnalysis` node, the doc attrs, and the "+" on empty lines.
2. A host hook such as `useExtraCommandSections()` on `EditorHost`, merged into `getAllCommandSections`.
3. An optional `run(editor, range)` on `CommandOption`, which `CommandExtension` calls before its `switch` on the command string.
4. Adding `productAnalysis` to `BUBBLE_MENU_DISALLOWED_NODES`. It's passed in from the host so `documents` doesn't need to know the name.
5. Host capabilities: `canEmbedCharts: true`, `canUseMetabot: false` for the prototype.

`product-analytics` imports `Editor`, `useDocumentEditor` and `DocumentEditorHost` from `documents`, as `explorations` does. It needs the same lint and modules allowance.

### Page state

A React context, `AnalysisDocumentContext`, provided by the page. It's local state, not Redux:

- `table`, `dateRange` (read from doc attrs), `setTable` and `setDateRange` (which write doc attrs)
- `editingNodeId`, `setEditingNodeId`
- `panelTab: "setup" | "advanced" | "insights" | null`, `setPanelTab`
- `editor`, the tiptap instance, so code outside the editor can find a node by `_id` and update its attrs

**Edit mode isn't tied to ProseMirror's selection.** Clicking the panel moves focus out of the editor, which would end the selection. The node view sets `editingNodeId` when its frame is clicked. A small plugin clears it when the selection moves into text or onto another node; panel clicks never touch the editor's selection. `use-click-outside-first.ts` already handles a similar problem.

### Node view

Each `productAnalysis` node view:

- reads `definition` from attrs and `table` / `dateRange` from context;
- calls `useAnalysis` (the same hook `AnalysisWorkspace` uses) with `onChangeSettings` writing back to the node's attrs;
- only loads data once near the viewport (`host.useNodeInViewport`), because a document with ten analyses would otherwise run ten heavy queries on open;
- renders `AnalysisResult`, with the title strip in view mode and the toolbar in edit mode.

**The panel is rendered by the page, not the node view.** For the node being edited, it calls `useAnalysis` again with the same inputs. Queries go through RTK Query (`useGetNativeDatasetQuery`, `useGetAdhocQueryQuery`), so the second call is served from cache. This keeps the panel independent of the editor's DOM. `useFunnelInsights` runs only here, so insights only ever run for the card being edited.

### What happens to today's components

| Today | In the document |
| --- | --- |
| `AnalysisWorkspace` | Split up between the node view and the page panel. Removed with the old pages. |
| `AnalysisToolbar` | Loses table, date range, Save and the Insights toggle state. Becomes the card header toolbar. |
| `SettingsPanel` | Body of the Setup and Advanced tabs, without its own frame |
| `InsightsPanel` | Body of the Insights tab. `onExplore` becomes `onAddToDocument`; its close button goes away. |
| `useAnalysisState` | `panel` moves to page context. `stored` moves to node attrs. Unsaved-changes tracking moves to `useDocumentEditor`. |
| `useSaveAnalysis`, `useAddToDashboardToast`, `LeaveRouteConfirmModal` | Replaced by the document's own save and leave-confirmation flow |
| `NewAnalysisPage` / `AnalysisTypeCard` | `AnalysisTypeCard` is reused in the empty-document gallery and the "+" popover |

### Funnel breakdown

So that an inserted insight can be an analysis, funnels get an optional `breakdown` setting: up to two attribute columns, plus which transition to focus on. With a breakdown set, the funnel shows what the explore card shows today: people as bars and conversion as a line, by each attribute value at that transition. The SQL is already in `sql/analyses/funnel-insights.ts`. The setting is at the bottom of the Setup tab (step-by-step view only), so a breakdown can also be added by hand.

"Add to document" for an insight becomes: copy the source funnel's definition, then set `breakdown` from the insight's attributes and transition.

We build this rather than inserting the explore card as a native `cardEmbed` first, which would be throwaway code. A grouped step chart for broken-down funnels is listed under [Later](#later).

### Guarding the standard document page

Tiptap drops nodes it doesn't recognize. Opening an analysis document at `/document/:id` (from a collection, search or recents) and saving it would delete every analysis. For the prototype, `DocumentPage` checks for `attrs.product_analytics` on the doc node and redirects to `/event-analysis/document/:id`. It only checks for a string key, so it needs no import from `product-analytics`. A later version should have a real document "kind" and route collection items correctly.

## Build order

1. `editor-extension-points`, `page-and-routes` and `document-context`: an empty analysis document that saves and reloads with a table and date range.
2. `analysis-node` and `inserting`: analyses appear and run in view mode. Settings can be hard-coded at first.
3. `edit-mode` and `side-panel`: the main interaction. This is where the toolbar layout will need iterating.
4. `standard-editor-guard`: before anyone else tries it.
5. `funnel-breakdown`, then `insights-to-document`.
6. `drill-to-document`.

## Build notes

What the first build does differently from the plan above, or adds to it:

- **Overflow menu.** The card toolbar puts Filter (still "coming soon") and View the SQL in a "…" menu. Expect the toolbar layout to keep changing.
- **Keyboard access to edit mode.** The card header's hover prompt is a real "Edit analysis" button. It's focusable and shows on focus.
- **Inserting never replaces a selected node.** With an analysis selected, a new one goes after it.
- **Drill-through.** Clicking a step in a funnel's step chart offers "Where people went after <step>". This inserts a Paths analysis that starts from that step's event. It's the only real drill so far.
- **Copy and paste duplicates an analysis.** The definition is rendered into the node's HTML, and duplicate node ids are re-minted.
- **Readers** see the table and date range pickers, but changing them does nothing without write access.
- **The document context is written** once the document has content, so a saved analysis document always carries the marker.
- **The old pages are gone.** `AnalysisPage`, `SavedAnalysisPage`, `AnalysisWorkspace`, `AnalysisToolbar`, the card save flow and the old `new/:kind` and `:cardId` routes have been removed. Cards saved from the old builder no longer redirect to it, so they open in the query builder as native questions.

## Later

- **Linked or copied insights.** Inserted insights are copies for now. If they were linked to their source funnel, editing the funnel would update them, and it would also give a natural home for the shared-query optimization below. This needs a decision before we go past the prototype.
- **Shared base query cache.** A funnel and the insights or drills inserted from it share most of their SQL (the per-person funnel table). They could share one cached base result rather than each running it again.
- **Grouped step chart** for broken-down funnels (one bar series per segment, across all steps).
- **Per-card overrides** of the document's table and date range.
- **Marking insights already in the document** in the Insights tab.
- **"Expand" escape hatch:** a full-page editor for a single analysis, if the document's width turns out to be too tight (for example for Paths).
- **Card height and resizing.** Analysis nodes aren't wrapped in `ResizeNode`, so their height is fixed per kind. Adding `productAnalysis` to `ResizeNode`'s content would allow resizing.
- **Real extension points in `documents`** for node types, slash commands and doc-level attrs, so `product-analytics` (and `explorations`) stop importing documents internals.
- **Saving analyses as cards**, for dashboards, search and subscriptions.
- **Metabot** in analysis documents.
