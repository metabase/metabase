# `dashboard_write` MCP v2 tool — design

- Ticket: [GHY-4147](https://linear.app/metabase/issue/GHY-4147/dashboard-write-tool)
- Spec: [MCP v2 Proposal §11](https://linear.app/metabase/document/mcp-v2-proposal-c9c3e002e504#11-dashboard-write-04f930a0)
- Base branch: `mcp-v2-foundation`
- Scope: the whole tool in one PR, parameters and autowire included.

## Goal

One watch-list tool that authors dashboards end to end: create/update the dashboard record, and
apply an ordered list of editor operations — cards, text, headings, links, iframes, actions, tabs,
and parameters — as a single atomic save.

The design constraint that drives everything: an agent cannot reliably round-trip a whole dashboard
JSON through model context. So the agent sends *ops*, the server reads current state and compiles
the ops into the app's own save payload. Read-modify-write happens server-side, deterministically.

## Architecture

Three namespaces, functional core / imperative shell.

| Namespace | Role | Purity |
| --- | --- | --- |
| `metabase.mcp.v2.tools.dashboard` | `deftool`, Malli arg schema, `common/dispatch-write`, domain calls, response | effectful |
| `metabase.mcp.v2.dashboard-ops` | `compile-ops` + per-op validation | pure |
| `metabase.parameters.mapping-targets` | `valid-targets` for a card + parameter | reads metadata only |

### Update flow

1. `common/resolve-and-read :model/Dashboard id` (accepts numeric id or 21-char `entity_id`), then
   `t2/hydrate [:dashcards :series :card] :tabs`.
2. `dashboard-ops/compile-ops` folds the ops over that state, producing
   `{:dashcards [...] :tabs [...] :parameters [...]}` plus any dashboard-attribute updates.
3. If `validate_only`, stop and return the would-be layout.
4. Otherwise, one call to `metabase.dashboards-rest.api/update-dashboard!`. Its own
   `api/write-check` and enclosing transaction give us permission inheritance and atomicity.
5. Response: the `:dashboard` projection in concise form — no follow-up read needed.

### Create flow

Calls an extracted `create-dashboard!`, then falls through to the same op path when `ops` are
supplied, so "make a dashboard with these three charts" is one call.

## Reuse

This tool is mostly assembly. What already exists:

- **`update-dashboard!`** (`src/metabase/dashboards_rest/api.clj:1025`) is currently `defn-`. Make it
  public; the endpoint keeps calling it. Extract the `POST /` body (`api.clj:143-176`) into
  `create-dashboard!` the same way. This is the pattern the segment/measure write tools established
  on `origin/mcp-v2-segment-measure-write` — extract the defendpoint body into a public domain fn so
  the tool and REST share one permission-checked path.
- **Negative ids are already the temp-id convention.** `UpdatedDashboardCard` documents it at
  `api.clj:890` (`;; id can be negative, it indicates a new card and BE should create them`), same for
  tabs at `api.clj:902`. `u/row-diff` in `do-update-dashcards!` (`api.clj:876`) partitions
  create/update/delete, and `dashboard-tab/do-update-tabs!` returns `old->new-tab-id`, which
  `update-dashboard!` uses to rewrite each dashcard's `dashboard_tab_id` after tab creation
  (`api.clj:1090-1096`). The compiler emits negative ids and gets all of this free.
- **`dashboards.autoplace/get-position-for-new-dashcard`** places cards when `position` is omitted.
- **`common/dispatch-write`** (`src/metabase/mcp/v2/common.clj:317`) already implements the
  `method` create/update contract, `create-required` enforcement, and the `:update-scope` recheck.
- **Scopes exist**: `agent:dashboard:create` and `agent:dashboard:update`
  (`src/metabase/metabot/scope.clj:64-67`), already bucketed under `:permission/metabot-other-tools`.
- **Dashboard projection** exists at `src/metabase/mcp/v2/tools/content.clj:319-339`. **Move it** into
  `projections.clj` so `get_content` and `dashboard_write` share one definition. The `fields` catalog
  regenerates from the sample walk, so no drift.

## Tool surface

```
method            "create" | "update"          required
id                                             required on update
validate_only     bool                         dry run, returns the would-be layout
name                                           required at create
description, collection_id, collection_position
width             "fixed" | "full"
auto_apply_filters, cache_ttl
archived          bool                         update only; true = trash, false = restore
ops               op[]                         ordered
```

Closed Malli map. `:scope agent-dashboard-create`, `:update-scope agent-dashboard-update`.

### Op grammar

`ops` is `[:sequential [:multi {:dispatch :op} ...]]`, closed per op. Twenty-four ops, in three
groups by how they compile.

Throughout, `position` is `{row, col}` and `size` is `{size_x, size_y}` — two separate optional args,
so a caller can pin a card's slot without also fixing its size. Omitting either falls back to
autoplace and the display type's default size respectively.

**Adds** — produce a new dashcard carrying a caller-supplied negative `id`. All take `tab?`,
`position?`, `size?`.

| Op | Args |
| --- | --- |
| `add_card` | `id, card_id, tab?, position?, size?, series?, inline_parameters?` |
| `add_text` | `id, markdown, …` |
| `add_heading` | `id, text, inline_parameters?, …` |
| `add_link` | `id, url \| entity: {type, id}, …` |
| `add_iframe` | `id, src, …` — gated by allowed-iframe-hosts |
| `add_action` | `id, action_id, label?, display?: "button" \| "form"` — rejected when actions are disabled |
| `duplicate_card` | `id, dashcard_id, tab?, position?` — clones content, remaps inline params |

**Edits** — modify or drop an existing entry.

| Op | Args | Notes |
| --- | --- | --- |
| `replace_card` | `dashcard_id, card_id` | keeps the dashcard id; resets series, mappings, overrides like the editor |
| `move` | `dashcard_id, tab?, position?` | validates the target tab |
| `resize` | `dashcard_id, size` | |
| `remove` | `dashcard_id` | |
| `set_series` | `dashcard_id, card_ids` | ordered full replace |
| `patch_dashcard` | `dashcard_id, patch` | content merge only: viz settings, `click_behavior`, `column_settings`, link entity. Layout and identity keys are rejected, and the error names the op to use instead |

**Tabs and parameters** — write the `:tabs` and `:parameters` vectors.

| Op | Args | Notes |
| --- | --- | --- |
| `add_tab` | `id, name` | negative `id` |
| `rename_tab` | `tab_id, name` | |
| `move_tab` | `tab_id, index` | |
| `duplicate_tab` | `id, tab_id` | |
| `remove_tab` | `tab_id` | deletes the tab's cards |
| `add_parameter` | `parameter_id, name, type, default?, required?, isMultiSelect?, temporal_units?, values_query_type?, values_source_type?, values_source_config?, filteringParameters?` | REST names as-is, camelCase warts included |
| `update_parameter` | `parameter_id, …same…` | |
| `remove_parameter` | `parameter_id` | strips mappings, linked-filter refs, inline placements; names broken subscriptions |
| `move_parameter` | `parameter_id, index?, dashcard_id?` | reorder in header, or relocate between header and a card |
| `wire_parameter` | `parameter_id, dashcard_id, target_field \| target_tag \| target, autowire?` | writes `:parameter_mappings` on the dashcard |
| `unwire_parameter` | `parameter_id, dashcard_id?` | one card, or all |

Moving a card between tabs is `move` with `tab`. Not ops, per the proposal: sections (client-side
templates), embedding and public links (admin), dashboard questions (`question_write` with
`dashboard_id`).

### Temp ids

New dashcards and tabs carry caller-supplied negative `id`s, exactly what the frontend editor sends
to `PUT /api/dashboard/:id`. Later ops in the same batch reference them by that negative id, so
`add_tab {id: -1}` then `add_card {id: -2, tab: -1}` works with no translation layer — the compiler
passes the number through and `update-dashboard!` does the rest.

Parameters are not int-keyed, so `add_parameter` takes an agent-supplied `parameter_id` string.
This matches both the schema (`::parameter` requires `:id`,
`src/metabase/parameters/schema.cljc:82`) and the frontend, which mints the id client-side.

Duplicate or already-taken temp ids are a teaching error.

### Mapping targets

New namespace `src/metabase/parameters/mapping_targets.clj`:

```clojure
(valid-targets card parameter) ;; => [target ...]
```

MBQL cards enumerate via Lib `filterable-columns`; native cards via template tags of a compatible
widget type. This is the server-side equivalent of the frontend's `getParameterMappingOptions`
(`frontend/src/metabase/parameters/utils/mapping-options.ts:153`), which has no backend counterpart
today — `params/valid-filter-fields` (`api.clj:1361`) answers the adjacent but different question of
which fields can filter which.

It lives in `metabase.parameters` rather than the MCP module because it is a domain primitive, not
an MCP concern: it sits next to `chain_filter.clj`, and a future REST endpoint could expose it so
the frontend eventually drops its copy. Costs a `:uses` entry in the modules config.

`wire_parameter` validates the requested target against it. `autowire: true` applies it across every
card on the dashboard and takes same-field matches. This is deliberately *not* a faithful port of
`frontend/src/metabase/dashboard/actions/auto-wire-parameters/actions.ts` — parts of that are
toast-driven UI behavior with no server meaning.

## `validate_only`

Pure: compile the ops against freshly-read state, run every op-level check plus Malli `DashUpdates`
validation on the compiled payload, return the would-be layout. No writes, no events, no emails.

Nearly every error an agent can author lives in the ops, not in the write path, so this catches what
matters. The rejected alternative — running the real write inside a rolled-back transaction — is
fragile: `update-dashboard!` publishes `:event/dashboard-update` and sends broken-subscription
notifications *outside* its transaction (`api.clj:1104-1109`), so a dry run would fire real events
and emails unless those were suppressed.

## Error handling

- **Op-level**, all 400 teaching errors naming the op index and the offending argument: unknown
  `dashcard_id` / `tab_id` / `parameter_id`, duplicate or dangling temp id, explicit position
  collision, invalid mapping target, iframe host not allowed, `add_action` with actions disabled,
  layout keys in `patch_dashcard`.
- **Domain-level**: translate Malli and lib exceptions into teaching errors; anything already
  carrying `:status-code` passes through; unrecognized stays "Internal error" via
  `common/->mcp-error-content`.
- **Atomicity**: no partial layouts. Either `update-dashboard!` commits the whole payload or the
  call throws, so a retry cannot double-add.

## Testing

- `test/metabase/mcp/v2/dashboard_ops_test.clj` — pure, no DB, plain maps. Every op, every
  rejection, negative-id threading across ops, autoplace, `patch_dashcard` key rejection. Most
  coverage lives here and runs fast.
- `test/metabase/mcp/v2/tools/dashboard_test.clj` — through `registry/call-tool`, using the
  `call-tool!` / `tool-result` / `tool-error` helpers and the JSON `wire` round-trip established in
  `definitions_test.clj:36-63`. Covers scope enforcement, read-only user, unreadable nested card,
  create-with-ops in one call, and that `validate_only` writes nothing.
- `test/metabase/parameters/mapping_targets_test.clj` — MBQL card, native card with template tags,
  model.

Test `testing` strings reference GHY-4147.

## Also required

- Add `metabase.mcp.v2.tools.dashboard` to the registration requires in
  `src/metabase/mcp/v2/api.clj:14-17`.
- Run `./bin/mage fix-modules-config` — the new `metabase.parameters` dependency shifts module
  boundaries.
- A skill markdown under `resources/metabot/skills/` teaching the op grammar and the negative-id
  convention.
