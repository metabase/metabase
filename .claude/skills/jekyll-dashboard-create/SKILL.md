---
name: jekyll-dashboard-create
description: Author a new Metabase Dashboard from scratch as serdes-format YAML and load it into the running dev instance via jekyll-mode's single-file pipeline. Use when the user asks to create/build/generate a dashboard in this repo's local jekyll-mode dev workflow (writing into local/jekyll, not the Metabase UI or the CLI export/import flow).
---

# Jekyll-mode Dashboard Creation

Generates a brand-new Dashboard by hand-writing its serdes YAML representation and loading it straight
into the appdb through `metabase.jekyll-mode.load`, instead of using the UI or a full `clojure -M:run:ee
import`. See the **serdes-yaml-edit** skill for general portable-reference conventions (field/table refs,
etc.) — this skill only covers what's specific to authoring a Dashboard file from nothing.

@./../_shared/sample-database.md

## Authoritative format reference

`/Users/camsaul/representations` is the canonical spec/schema repo for this format (npm package
`@metabase/representations`) — prefer it over reverse-engineering from Clojure source or scattered test
fixtures:

- `core-spec/v1/schemas/dashboard.yaml` — the actual JSON Schema for a Dashboard file (required/optional
  fields, enums, defaults). Treat this as ground truth over anything summarized below.
- `core-spec/v1/spec.md` — full written spec: Entity Keys, Folder Structure, MBQL Query, Parameter, etc.
- `examples/v1/collections/main/dashboards/*.yaml` — real examples: tabs (`tabbed_dashboard.yaml`), virtual
  cards/text-heading-link (`virtual_cards.yaml`), overlay series (`series_and_mappings.yaml`), click
  behaviors (`click_behaviors.yaml`), every parameter type (`all_parameter_types.yaml`), dashcard-scoped
  filters (`inline_parameters.yaml`).
- CLI (`npx @metabase/representations <cmd>`, or `cd /Users/camsaul/representations && bun run bin/cli.ts
  <cmd>` if npx isn't set up): `generate-entity-id [--count N]`, `generate-uuid`, and `validate-schema
  --folder <dir>` — a fast, JVM-free structural check (shape/required-fields/enums only; it does **not**
  validate that queries resolve against real synced metadata — for that you still need the Clojure `cards`
  checker in step 6).

## 0. Prerequisites

- A running dev instance with an nREPL you can reach (`clj-nrepl-eval` / `clj-nrepl-eval --discover-ports`,
  or a direct nREPL client). Jekyll mode's root export dir is `(metabase.jekyll-mode.files/directory-prefix)`
  — currently `"local/jekyll"`.
- The target Collection must already have an exported file under `local/jekyll/collections/...` (so you
  know its `entity_id` and directory), and every Card the dashboard will reference must already exist as a
  file there too. This skill does not create Cards or Collections.

## 1. Look up entity_ids you'll reference

```bash
grep -l "entity_id:" local/jekyll/collections/**/*.yaml   # candidates
grep -A1 "^name: <the collection or card name>" local/jekyll/collections/**/*.yaml
```
Or via nREPL, which is more reliable than guessing from filenames:
```clojure
(toucan2.core/select-one [:model/Collection :entity_id :name] :name "My Collection")
(toucan2.core/select-one [:model/Card :entity_id :name] :name "My Card")
```

## 2. Generate entity_ids

Every row (the Dashboard itself, each DashboardTab, each DashboardCard) needs its own fresh entity_id.
Generate real ones — don't hand-type plausible-looking strings. Prefer the representations CLI (no JVM
needed, and it's the format's own generator):
```bash
npx @metabase/representations generate-entity-id --count 5
```
Equivalent from Clojure if the CLI isn't available:
```clojure
(metabase.util/generate-nano-id)   ; call once per row you're creating
```

## 3. `:serdes/meta` is NOT optional on a hand-authored file

Unlike editing an already-exported file, a from-scratch file has no prior export to derive its path from.
Both the full-tree ingester and jekyll-mode's single-file loader (`metabase.jekyll-mode.load/file->serdes-path`)
read `:serdes/meta` **directly off the file** to know what entity it is — nothing regenerates it for you.
Get this right or the load will fail to resolve the entity's identity.

- Top-level Dashboard: `[{model: Dashboard, id: <dash-eid>, label: <slug>}]`
- A DashboardTab nested inside it: `[{model: Dashboard, id: <dash-eid>}, {model: DashboardTab, id: <tab-eid>}]`
- A DashboardCard nested inside it (untabbed): `[{model: Dashboard, id: <dash-eid>}, {model: DashboardCard, id: <dc-eid>}]`
- A DashboardCard inside a tab: `[{model: Dashboard, id: <dash-eid>}, {model: DashboardTab, id: <tab-eid>}, {model: DashboardCard, id: <dc-eid>}]`

## 4. File shape

`dashcards` and `tabs` are inline vectors in the *one* Dashboard file — there are no separate files for
them. Template (tabbed example; drop `tabs` and each dashcard's `dashboard_tab_id` for an untabbed
dashboard):

```yaml
name: <Dashboard Name>
entity_id: <dash-eid>
collection_id: <target collection's entity_id>
parameters: []
serdes/meta:
- id: <dash-eid>
  label: <slug_of_name>
  model: Dashboard
dashcards:
- entity_id: <dc-eid>
  card_id: <referenced Card's entity_id>   # Card entity_id string, NOT its numeric id
  row: 0
  col: 0
  size_x: 12
  size_y: 6
  dashboard_tab_id: [<dash-eid>, <tab-eid>]   # omit entirely if untabbed
  parameter_mappings: []
  series: []
  visualization_settings: {}
  serdes/meta:
  - {id: <dash-eid>, model: Dashboard}
  - {id: <tab-eid>, model: DashboardTab}       # omit this hop if untabbed
  - {id: <dc-eid>, model: DashboardCard}
tabs:
- entity_id: <tab-eid>
  name: <Tab Name>
  position: 0
  serdes/meta:
  - {id: <dash-eid>, model: Dashboard}
  - {id: <tab-eid>, model: DashboardTab}
width: fixed   # or "full"; "fixed" is the schema default — set explicitly if you want full-width
```

Do not write `dashboard_id` anywhere inside the nested rows — it's a parent-ref, reinjected from context on
load.

If a dashcard's parameter needs to filter a field, use the portable field form from serdes-yaml-edit:
`target: [dimension, [field, [<Database>, <Schema>, <Table>, <FIELD>], null]]`.

A dashcard's `card_id` normally points at an ordinary, independently-reusable Card (created via
**jekyll-card-create**) living in its own collection. If instead you want a card that only ever makes sense
on this one dashboard ("dashboard question"), give that Card's own file `dashboard_id: <dash-eid>` and set
its `collection_id` to **match this dashboard's `collection_id`** (not just any collection) — per
`spec.md`'s Entity Ownership section, `collection_id` is what places an entity, `dashboard_id` only marks
ownership/lifecycle. On disk the convention (non-load-bearing) is to put such a card in a subfolder named
after the dashboard's slug, e.g. `my_dashboard/card.yaml` beside `my_dashboard.yaml`.

## 5. Where to write the file

**Only `collection_id` determines where the Dashboard actually lives — directory placement on disk is
purely cosmetic and ignored on import.** Still, for human readability, mirror the directory an existing
entity in the *same target Collection* already lives under (find one with the lookups from step 1); Metabase
only scans `collections/`, `databases/{segments,measures}`, `python_libraries/`, and `transforms/` on
import, so keep the file somewhere under `local/jekyll/collections/...`. Filename itself is not load-bearing
either — identity comes from `entity_id`/`:serdes/meta` — but name it `<slug>.yaml` to match convention.

## 6. Validate before loading (recommended)

Fast structural check (no JVM, catches shape/required-field/enum mistakes):
```bash
npx @metabase/representations validate-schema --folder local/jekyll
```
Deeper check that the dashboard's parameter mappings/field refs actually resolve against real synced
metadata (needs the `:ee` alias):
```bash
clojure -M:run:ee --mode checker --checker structural --export local/jekyll
clojure -M:run:ee --mode checker --checker cards --export local/jekyll
```

## 7. Load it

Either wait for the file watcher (if running), or load immediately via nREPL:
```clojure
(metabase.jekyll-mode.load/load-instance-from-file! "local/jekyll/collections/<path>/<slug>.yaml")
```
Confirm it landed:
```clojure
(toucan2.core/select-one [:model/Dashboard :id :name] :entity_id "<dash-eid>")
```
