(ns metabase.metabot.tools.shared.mbr
  "Build Metabase Representation (MBR) maps for `read_resource` output.

  MBR is the YAML/JSON shape defined by
  https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md

  Two-tier identifier scheme:

  - User content (Card, Dashboard, Collection, Metric, Transform, Snippet,
    Document, Measure, Segment) -> `entity_id` (NanoID). URI form:
    `metabase://{type}/{entity_id}`.

  - Sync metadata (Database, Table, Field) has no `entity_id` and is identified
    by natural-key paths matching MBR FK tuples. URI form:
    - `metabase://database/{db_name}`
    - `metabase://database/{db_name}/schema/{schema}/table/{table_name}`
    - `metabase://database/{db_name}/schema/{schema}/table/{table_name}/field/{field_name}`

  Each segment is URL-encoded. JSON-unfolded / nested fields are out of scope
  for v1."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.warehouses.models.database :as warehouses.database]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def max-list-items
  "Page size for list responses. [[extract-readable]] hydrates at most this many
   items per page (the rest are reachable via `?page=N`), so we never serdes-hydrate
   more than one page worth."
  25)

(defn resolve-user-entity
  "Look up a user-content entity by either entity_id (preferred) or numeric id (legacy).

   `toucan-model` is the Toucan 2 model keyword (`:model/Card`, `:model/Dashboard`,
   etc.). `id-str` is the raw URI segment. Discriminates
   `metabase://card/<entity_id>` (new MBR-style URI) from
   `metabase://card/<numeric_id>` (legacy backcompat) by NanoID shape
   ([[serdes/entity-id?]]) — no DB hit; a shape false-positive still 404s cleanly.

   Returns the Toucan instance or nil if no row matches."
  [toucan-model id-str]
  (when id-str
    (if (serdes/entity-id? id-str)
      (t2/select-one toucan-model :entity_id id-str)
      (when-let [n (parse-long id-str)]
        (t2/select-one toucan-model n)))))

(defn resolve-database
  "Look up a Database for a `metabase://database/{seg}` URI segment.

   Name is the canonical, unambiguous form (all emitted URIs use it), so we resolve
   **by name first** and fall back to numeric id only when no database has that name. This keeps
   an all-numeric database name (e.g. `\"42\"`) reachable — the previous numeric-first order
   silently shadowed it with the id lookup. Numeric id remains a best-effort legacy fallback; in
   the (astronomically rare) case where both a database *named* `\"42\"` and a database with *id*
   42 exist, the name wins, matching the canonical scheme."
  [id-str]
  (when id-str
    (or (t2/select-one :model/Database :name id-str)
        (when-let [n (parse-long id-str)]
          (t2/select-one :model/Database n)))))

(defn resolve-table
  "Look up a Table by `[db-name schema table-name]` (MBR path-form). Schemaless
   databases pass an empty `schema` segment, which decodes to `nil` or `\"\"`.
   We treat empty string as nil for the SQL filter.

   The db segment goes through [[resolve-database]], so the same segment resolves
   identically in every route — a legacy numeric db id that works in
   `database/{id}/tables` also works in the path-form table/field URIs."
  [db-name schema table-name]
  (when (and db-name table-name)
    (let [db-id  (:id (resolve-database db-name))
          schema (when (and schema (not (str/blank? schema))) schema)]
      (when db-id
        (t2/select-one :model/Table
                       :db_id db-id
                       :schema schema
                       :name table-name
                       :active true)))))

(defn resolve-table-legacy
  "Look up a Table by legacy numeric id (URI form `metabase://table/{id}`)."
  [id-str]
  (when-let [n (parse-long id-str)]
    (t2/select-one :model/Table n)))

(defn resolve-field
  "Look up a Field by `[db-name schema table-name field-name]` (MBR path-form)."
  [db-name schema table-name field-name]
  (when-let [table (resolve-table db-name schema table-name)]
    (t2/select-one :model/Field
                   :table_id (:id table)
                   :name field-name
                   :active true)))

(def ^:private sandbox-safe-card-keys
  "ALLOWLIST (default-deny) of Card MBR keys that are safe to emit to a user who is sandboxed on the
   card's data. Serdes extracts a Card unfiltered (it is an admin-export pipeline) and several of its
   keys carry *portable* `[db schema table field]` NAMES — `:dataset_query`, `:result_metadata`,
   `:visualization_settings` (column_settings `[\"ref\" [\"field\" id]]` keys, click_behavior targets,
   series settings), `:parameters`, and `:parameter_mappings` all round-trip field refs by name. Any one
   of those would leak the sandboxed table/column names the sandbox is meant to hide.

   Rather than denylist the currently-known leaky keys (which rots the moment serdes adds a new
   field-ref-bearing key — the leak would be reintroduced silently), we project the MBR down to ONLY
   the keys below. A future spec addition is therefore safe-by-default: it is withheld unless someone
   explicitly adds it here after confirming it carries no field ref.

   Justification per key (all sourced from the Card serdes make-spec, `queries.models.card`):
   - `serdes/meta`      — the serdes path `[{:model \"Card\" :id <entity_id>}]`; pure identity, no field ref.
   - `:name`            — display label. Copy key. No field ref.
   - `:description`     — free-text description. Copy key. No field ref.
   - `:display`         — chart type keyword (`:table`, `:bar`, …). Copy key. No field ref.
   - `:type`            — card type (`:question`/`:model`/`:metric`). Copy key. No field ref.
   - `:entity_id`       — the NanoID identity. Copy key. No field ref.
   - `:archived`        — boolean lifecycle flag. Copy key. No field ref.
   - `:created_at`      — timestamp. Transform (date). No field ref.
   - `:collection_id`   — Collection FK, exported as a collection-name path — never a warehouse ref.
   - `:database_id`     — Database FK, exported as the *database name* only (no schema/table/field),
                          which the sandboxed user can already see (they query that database).
   - `:_recently_viewed_at` — MBR annotation added by the recents list path. Not a spec key; no field ref.

   Deliberately EXCLUDED even though a reviewer might miss them, because they can each embed a field ref:
   `:dataset_query`, `:result_metadata`, `:visualization_settings`, `:parameters`, `:parameter_mappings`.
   Also excluded (not identity/display, no reason to surface, and cheaper to keep the allowlist tight):
   `:embedding_params`, `:enable_embedding`, `:embedding_type`, `:public_uuid`, `:metabase_version`,
   `:card_schema`, `:collection_position`, `:collection_preview`, `:dashboard_id`. If a reviewer wants
   any of these back, they are safe to add (none carry a warehouse ref) — they were left out to keep the
   surface minimal, not for safety."
  [:serdes/meta :name :description :display :type :entity_id :archived :created_at
   :collection_id :database_id :_recently_viewed_at])

(def ^:private sandbox-safe-dashcard-keys
  "ALLOWLIST (default-deny) of DashboardCard keys kept when scrubbing a sandboxed Dashboard MBR. A
   DashboardCard nests inside `:dashcards`; serdes exports its `:visualization_settings` and
   `:parameter_mappings` with portable field-ref NAMES (same leak as on a Card). We keep only the
   card FK reference and the layout/identity fields, dropping everything field-ref-bearing.

   Justification per key (from the DashboardCard serdes make-spec, `dashboards.models.dashboard-card`):
   - `serdes/meta`        — serdes path; identity only.
   - `:entity_id`         — DashboardCard identity. Copy key.
   - `:card_id`           — Card FK (exported as the card's serdes path/entity-id, not a warehouse ref).
   - `:col` `:row`        — grid position. Copy keys. No field ref.
   - `:size_x` `:size_y`  — grid size. Copy keys. No field ref.
   Excluded (carry field refs): `:visualization_settings`, `:parameter_mappings`, `:inline_parameters`
   (parameters can target fields), and `:series` (nested cards' viz settings)."
  [:serdes/meta :entity_id :card_id :col :row :size_x :size_y])

(defn- scrub-dashcard
  "Project one nested dashcard map down to [[sandbox-safe-dashcard-keys]] (default-deny)."
  [dashcard]
  (select-keys dashcard sandbox-safe-dashcard-keys))

(def ^:private sandbox-safe-dashboard-keys
  "ALLOWLIST (default-deny) of top-level Dashboard MBR keys kept for a sandboxed user. Mirrors
   [[sandbox-safe-card-keys]]: rather than denylist the known-leaky keys (which rots when serdes
   adds a new one), project down to keys confirmed to carry no warehouse ref.

   Justification per key (from the Dashboard serdes make-spec, `dashboards.models.dashboard`):
   - `serdes/meta` `:entity_id` — identity.
   - `:name` `:description` `:caveats` `:points_of_interest` — free text. Copy keys.
   - `:archived` `:auto_apply_filters` — booleans. Copy keys.
   - `:created_at` — timestamp transform.
   - `:collection_id` — Collection FK, exported as a collection-name path — never a warehouse ref.
   - `:width` `:position` — layout. Copy keys.
   - `:tabs` — nested DashboardTabs: name/position only, no field refs.
   - `:dashcards` — nested dashcards, each already scrubbed to [[sandbox-safe-dashcard-keys]].
   - `:_recently_viewed_at` — MBR annotation, not a spec key.

   Deliberately EXCLUDED because they can carry warehouse-derived names:
   `:parameters` (field-ref targets) and `:embedding_params` (its keys are parameter slugs, which
   for field-filter params commonly mirror column names). Also excluded to keep the surface tight
   (safe but pointless for the agent): `:enable_embedding`, `:embedding_type`, `:public_uuid`,
   `:collection_position`, `:show_in_getting_started`, `:archived_directly`, `:creator_id`,
   `:made_public_by_id`, `:initially_published_at`."
  [:serdes/meta :entity_id :name :description :caveats :points_of_interest :archived
   :auto_apply_filters :created_at :collection_id :width :position :tabs :dashcards
   :_recently_viewed_at])

(defn- scrub-unreadable-dashcards
  "Scrub every nested dashcard whose Card the current user cannot read (collection perms) down to
   [[sandbox-safe-dashcard-keys]]. Dashboard `read-check` covers only the dashboard's own collection;
   a dashcard may reference a card in a collection the user cannot read, and its
   `:visualization_settings`/`:parameter_mappings` carry portable field-ref NAMES the REST API would
   only expose as numeric ids. Applies to all users (OSS collection perms, not just sandboxing);
   superusers skip the lookup. Text/virtual dashcards (nil `:card_id`) pass through."
  [instance mbr]
  (if (or (not (contains? mbr :dashcards))
          api/*is-superuser?*)
    mbr
    (let [card-ids   (into [] (remove nil?)
                           (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id (:id instance)))
          unreadable (when (seq card-ids)
                       (into #{}
                             (comp (remove mi/can-read?) (keep :entity_id))
                             (t2/select :model/Card :id [:in card-ids])))]
      (cond-> mbr
        (seq unreadable)
        (update :dashcards (fn [dashcards]
                             (mapv #(if (contains? unreadable (:card_id %))
                                      (scrub-dashcard %)
                                      %)
                                   dashcards)))))))

(defn redact-mbr
  "Per-model redaction choke point for MBR output, applied on both the single-entity path ([[->mbr]])
   and the list path ([[extract-readable]]). Serdes is an admin-oriented export pipeline: it applies
   no data sandboxing, no settings visibility filtering, and no per-nested-entity permission checks,
   so anything the current user must not see is stripped here. Uses ALLOWLISTS (default-deny) so a
   future serdes key that embeds a field ref is withheld by default rather than leaking.

   - Card (questions / models / metrics — a metric is a `:type :metric` Card and flows through this
     branch): gated by `card-query-touches-sandboxed-table?`, which is precise (checks the card's own
     source tables). When it fires, project the MBR to [[sandbox-safe-card-keys]].

   - Dashboard: dashcards whose Card the user cannot read are scrubbed for everyone (OSS collection
     perms — see [[scrub-unreadable-dashcards]]). Additionally, a dashboard has no single query to
     gate sandboxing on and its leaky content lives in NESTED dashcards
     (`:visualization_settings`, `:parameter_mappings`) plus the dashboard's own `:parameters` /
     `:embedding_params`, so for a sandboxed user ([[metabase.permissions.core/any-enforced-sandbox?]])
     we over-approximate: project the top level to [[sandbox-safe-dashboard-keys]] and scrub every dashcard to
     [[sandbox-safe-dashcard-keys]]. Over-redaction here is acceptable and safe. A top-level
     `select-keys` alone would NOT reach the nested dashcards, so we walk `:dashcards` explicitly.

   - Database: drop `:settings` for everyone. It is a serdes copy key, and MBR output is a plain map,
     so the `mi/to-json :model/Database` hook that filters settings by `can-read-setting?` visibility
     on every REST surface never fires here. The blob has no analytical value to the agent; dropping
     it uniformly beats re-implementing the visibility filter. (`:details` never reaches MBR — serdes
     skips it without `include-database-secrets`.)

   - Every other model (Transform / Segment / Measure / Table / Field / Collection / Snippet …) is
     returned unchanged: their safety RELIES on the caller's entity-boundary read gate
     ([[extract-as-user]]'s `read-check`, [[extract-readable]]'s `can-read?`, or a
     domain gate like `transforms/get-transform`). Transform source queries and Segment/Measure
     definitions do carry field refs through serdes, but a data-sandboxed user fails their read
     checks upstream. If a new model whose serdes spec embeds field refs becomes readable by users
     with weaker-than-data perms (like Card's collection-based `can-read?`), it needs its own branch
     here — do not rely on this fall-through.

   The sandbox predicates fail CLOSED: they read the per-request `*sandboxes-for-user*` cache (bound
   by `bind-current-user` middleware on the metabot/agent endpoints) and throw a 403 if called
   without a `*current-user-id*` binding (e.g. a bare `(binding [...] ...)` that forgets it, or
   future parallelization that loses dynamic bindings on worker threads) rather than silently
   exposing data. Both are gated `:feature :none` so a lost/expired token also fails closed.

   Native card queries are covered by `card-query-touches-sandboxed-table?`: it falls back to a
   database-level sandbox check when a query's source tables can't be fully enumerated (native SQL,
   `:source-card` / `:metric` / template-tag card refs)."
  [model instance mbr]
  (cond
    (and (= model "Card")
         (perms/card-query-touches-sandboxed-table? instance))
    (select-keys mbr sandbox-safe-card-keys)

    (= model "Dashboard")
    (let [mbr (scrub-unreadable-dashcards instance mbr)]
      (if (perms/any-enforced-sandbox?)
        (-> mbr
            (select-keys sandbox-safe-dashboard-keys)
            (cond-> (contains? mbr :dashcards)
              (update :dashcards #(mapv scrub-dashcard %))))
        mbr))

    (= model "Database")
    (dissoc mbr :settings)

    :else
    mbr))

(defn- extract-opts
  "Scope a `serdes/extract-all` call to the given numeric `ids` for `model`.

   Most models scope cleanly via `:where [:in :id ids]`. Collection is the
   exception: its `extract-query` override ANDs `[:= :personal_owner_id nil]`
   onto any `:where` (the export-policy default of dropping personal
   collections), which would silently drop readable personal collections the
   caller intends to show. Passing `:collection-set` instead takes the override's
   id-scoped branch, which has no personal-owner filter — so a `can-read?`
   personal collection survives extraction.

   `ids` must be non-empty: `[:in :id nil]`/`[:in :id []]` are invalid SQL, and
   an empty `:collection-set` would take the wrong (personal-dropping) branch."
  [model ids]
  (assert (seq ids) "extract-opts requires a non-empty id seq")
  (if (= model "Collection")
    {:collection-set (set ids)}
    {:where [:in :id ids]}))

(defn- extract-all*
  "Run `serdes/extract-all`, realized to a vector, with read_resource's Database
   policy overrides: surface H2 databases and the Sample Database, which real
   exports exclude but reads must show (otherwise those databases pass read-check
   yet extract to nothing — a successful null entity, and a list `:total` that
   counts an item the response silently omits). Realization happens inside the
   binding — extract-all is lazy, so binding around an unrealized eduction would
   be a no-op."
  [model opts]
  (if (= model "Database")
    (binding [warehouses.database/*include-h2-in-extract?*     true
              warehouses.database/*include-sample-in-extract?* true]
      (into [] (serdes/extract-all model opts)))
    (into [] (serdes/extract-all model opts))))

(defn ->mbr
  "Run serdes/extract-all for a single instance, producing an MBR map.

  Goes through the same hydrate-then-transform pipeline serdes uses on export
  ([[serdes/extract-query]] hydrates nested fields, [[serdes/log-and-extract-one]]
  applies the model spec), so models with `serdes/nested` transforms
  (Dashboard `:tabs`/`:dashcards`, Card aliases, etc.) get their nested entities
  rendered into MBR.

  Scopes extraction via [[extract-opts]], so a readable personal Collection
  survives (a raw `:where [:= :id ...]` would trip Collection's
  `[:= :personal_owner_id nil]` export filter and extract to nothing).

  For `Database`, the export pipeline normally excludes H2 instances and the
  Sample Database; [[extract-all*]] overrides both so every reachable database
  surfaces. (`router_database_id IS NULL` is enforced at the Database model's
  extract-query and not bypassable from outside, but the typical read_resource
  use case won't be hitting router-children databases.)

  Returns nil when extraction yields nothing (e.g. a model whose `extract-query`
  policy excludes `instance`); callers must nil-check.

  Caller is responsible for any permission check on `instance`. See
  [[extract-as-user]] for a perm-gated entry point."
  [model instance]
  (when-let [extracted (first (extract-all* model (extract-opts model [(:id instance)])))]
    (redact-mbr model instance extracted)))

(defn extract-as-user
  "Permission-gated MBR extraction.

  Verifies the current user can read `instance` (via [[metabase.api.common/read-check]]),
  then runs [[->mbr]].

  Throws on perm denial — caller is expected to be inside a handler that already
  surfaces errors. Use this for single-entity drill-down endpoints.

  For list endpoints, pre-filter the collection via [[metabase.models.interface/can-read?]]
  before extracting — `read-check` throws, [[mi/can-read?]] returns a boolean."
  [model instance]
  (api/read-check instance)
  (->mbr model instance))

(defn extract-readable
  "Map MBR over a sequence of `instances`, dropping any the current user cannot read.

  Without `:page`, returns a vector of MBR maps for the readable subset.

  With `:page n` (1-indexed string or int), slices the readable subset to that page
  of [[max-list-items]] instances *before* extracting — so we never serdes-hydrate
  items the caller will throw away — and returns a map
  `{:items <≤page-size MBRs> :total <full readable count> :page n :pages <total pages>}`.
  Throws on a page number outside [1, pages] rather than silently clamping, so the
  caller (the agent) learns it passed a bad value.

  Maintains input order by re-correlating each instance to its extracted MBR via
  the full serdes path tuple (see the comment in the body).

  Batched: one `extract-all` call against the union of (page-sliced) readable
  ids, not one per instance. This matters for collection list endpoints where a
  single response may extract dozens of cards/dashboards — N+1 nested-hydration
  roundtrips would be a noticeable perf cliff."
  ([model instances]
   (extract-readable model instances nil))
  ([model instances {:keys [page] :as opts}]
   (let [paged?   (contains? opts :page)
         readable (filterv mi/can-read? instances)
         total    (count readable)
         pages    (max 1 (long (Math/ceil (/ (double total) max-list-items))))
         page     (or (some-> page parse-long) 1)
         _        (when (and paged? (or (< page 1) (> page pages)))
                    (throw (ex-info (str "Invalid page " page ". This list has " pages
                                         (if (= pages 1) " page." " pages."))
                                    {:page page :pages pages})))
         ;; No `:page` -> hydrate the whole readable set (concat sites paginate the
         ;; combined vector themselves). With `:page` -> hydrate only that page.
         sliced   (if paged?
                    (->> readable (drop (* (dec page) max-list-items)) (take max-list-items) vec)
                    readable)
         ids      (mapv :id sliced)
         mbrs     (if (empty? ids)
                    []
                    ;; Run extract-all, then re-correlate each sliced instance to
                    ;; its hydrated MBR. The pipeline strips numeric :id, so we
                    ;; key by the full serdes path tuple (`serdes/meta` on the
                    ;; extracted side, `generate-path` on the instance side).
                    ;;
                    ;; Keying on the *whole* path — not its last `:id` — matters
                    ;; for name-keyed models: a Table's leaf id is its bare name,
                    ;; so two same-named tables in different schemas would collide
                    ;; on `last :id`. The full path carries the schema and keeps
                    ;; them distinct. For entity_id models the path is a single
                    ;; segment, so this is identical to the old behavior.
                    (let [extracted-by-path (u/index-by :serdes/meta (extract-all* model (extract-opts model ids)))]
                      (into [] (keep (fn [inst]
                                       (some->> (serdes/generate-path model inst)
                                                (get extracted-by-path)
                                                (redact-mbr model inst))))
                            sliced)))]
     (if paged?
       {:items mbrs :total total :page page :pages pages}
       mbrs))))

(defn extract-tagged-page
  "Page a mixed-model list *before* serdes hydration. `pairs` is a seq of
   `[model-name instance]` tuples (concatenated across models in the caller's
   fixed display order). Filters unreadable instances, slices the page window
   over the surviving instances, then extracts only the ≤page-size in-window
   instances — grouped by contiguous model runs so each run is one batched
   [[extract-all*]] call.

   Returns the same `{:items :total :page :pages}` map as [[extract-readable]]'s
   paged arity. Use this for concat sites (collection items, table-derived) so a
   500-item collection hydrates 25 rows, not 500. `:total` is the pre-extraction
   readable count, matching extract-readable."
  [pairs page-str]
  (let [readable (filterv (fn [[_ inst]] (mi/can-read? inst)) pairs)
        total    (count readable)
        pages    (max 1 (long (Math/ceil (/ (double total) max-list-items))))
        page     (or (some-> page-str parse-long) 1)
        _        (when (or (< page 1) (> page pages))
                   (throw (ex-info (str "Invalid page " page ". This list has " pages
                                        (if (= pages 1) " page." " pages."))
                                   {:page page :pages pages})))
        window   (->> readable (drop (* (dec page) max-list-items)) (take max-list-items) vec)
        ;; Each contiguous run of the same model is extracted together. `extract-readable`
        ;; re-filters can-read? (harmless double-check) and preserves order within the run.
        items    (into []
                       (mapcat (fn [run]
                                 (extract-readable (ffirst run) (mapv second run))))
                       (partition-by first window))]
    {:items items :total total :page page :pages pages}))

(defn list-result
  "Wrap a paged MBR result in the list envelope used by `read_resource`.

   `paged` is the `{:items :total :page :pages}` map returned by [[extract-readable]]
   (already page-sliced and hydrated). `:truncated` is `(< page pages)`. The
   `:structured-output` `:result-type` tells
   [[metabase.metabot.tools.resources/format-content]] how to render."
  [list-type {:keys [items total page pages]}]
  {:structured-output
   {:result-type :mbr-list
    :list-type   list-type
    :items       (vec items)
    :total       total
    :page        page
    :pages       pages
    :truncated   (< page pages)}})

(defn entity-result
  "Wrap a single MBR map in the entity envelope used by `read_resource`.
   See [[list-result]] for the shape contract."
  [mbr]
  {:structured-output
   {:result-type :mbr-entity
    :entity      mbr}})
