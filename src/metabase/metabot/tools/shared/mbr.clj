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
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def max-list-items
  "Page size for list responses. [[extract-readable]] hydrates at most this many
   items per page (the rest are reachable via `?page=N`), so we never serdes-hydrate
   more than one page worth."
  25)

(defn- enc [s]
  (codec/url-encode (cond
                      (keyword? s) (name s)
                      (nil? s)     ""
                      :else        (str s))))

(defn entity-uri
  "URI for a user-content entity keyed by entity_id."
  [type entity-id]
  (str "metabase://" (enc type) "/" (enc entity-id)))

(defn- nano-id?
  "Cheap shape check: NanoID is 21 chars from the alphabet `A-Za-z0-9_-`.

   Used to discriminate `metabase://card/<entity_id>` (new MBR-style URI) from
   `metabase://card/<numeric_id>` (legacy backcompat) without a DB hit. False
   positives on weird numeric strings are fine — the resolver downstream will
   still hit the DB and 404 cleanly."
  [s]
  (boolean (and (string? s)
                (= 21 (count s))
                (re-matches #"[A-Za-z0-9_-]{21}" s))))

(defn resolve-user-entity
  "Look up a user-content entity by either entity_id (preferred) or numeric id (legacy).

   `toucan-model` is the Toucan 2 model keyword (`:model/Card`, `:model/Dashboard`,
   etc.). `id-str` is the raw URI segment.

   Returns the Toucan instance or nil if no row matches."
  [toucan-model id-str]
  (when id-str
    (if (nano-id? id-str)
      (t2/select-one toucan-model :entity_id id-str)
      (when-let [n (parse-long id-str)]
        (t2/select-one toucan-model n)))))

(defn resolve-database
  "Look up a Database for a `metabase://database/{seg}` URI segment.

   Name is the canonical, unambiguous form ([[database-uri]] always emits it), so we resolve
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
   We treat empty string as nil for the SQL filter."
  [db-name schema table-name]
  (when (and db-name table-name)
    (let [db-id  (t2/select-one-fn :id :model/Database :name db-name)
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

(defn database-uri
  "URI for a Database addressed by its name (path-form natural key)."
  [db-name]
  (str "metabase://database/" (enc db-name)))

(defn table-uri
  "URI for a Table addressed by `[db-name schema table-name]`. `schema` may be nil
   for schemaless databases — the empty segment encodes faithfully."
  [db-name schema table-name]
  (str "metabase://database/" (enc db-name)
       "/schema/" (enc schema)
       "/table/" (enc table-name)))

(defn field-uri
  "URI for a Field addressed by `[db-name schema table-name field-name]`."
  [db-name schema table-name field-name]
  (str (table-uri db-name schema table-name)
       "/field/" (enc field-name)))

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
   - `:_uri`            — MBR navigation annotation added by [[with-uri]]. Not a spec key; no field ref.
   - `:_recently_viewed_at` — MBR annotation added by the recents list path. Not a spec key; no field ref.

   Deliberately EXCLUDED even though a reviewer might miss them, because they can each embed a field ref:
   `:dataset_query`, `:result_metadata`, `:visualization_settings`, `:parameters`, `:parameter_mappings`.
   Also excluded (not identity/display, no reason to surface, and cheaper to keep the allowlist tight):
   `:embedding_params`, `:enable_embedding`, `:embedding_type`, `:public_uuid`, `:metabase_version`,
   `:card_schema`, `:collection_position`, `:collection_preview`, `:dashboard_id`. If a reviewer wants
   any of these back, they are safe to add (none carry a warehouse ref) — they were left out to keep the
   surface minimal, not for safety."
  [:serdes/meta :name :description :display :type :entity_id :archived :created_at
   :collection_id :database_id :_uri :_recently_viewed_at])

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

(defn redact-sandboxed
  "Strip sandbox-revealing content from `mbr` when the current user is sandboxed on the warehouse
   data behind `instance`. Uses an ALLOWLIST (default-deny) so a future serdes key that embeds a
   field ref is withheld by default rather than leaking.

   - Card (questions / models / metrics — a metric is a `:type :metric` Card and flows through this
     branch): gated by `card-query-touches-sandboxed-table?`, which is precise (checks the card's own
     source tables). When it fires, project the MBR to [[sandbox-safe-card-keys]].

   - Dashboard: a dashboard has no single query to gate on and its leaky content lives in NESTED
     dashcards (`:visualization_settings`, `:parameter_mappings`) plus the dashboard's own
     `:parameters`. We take a simple, over-approximating fail-safe: if the current user has ANY
     enforced sandbox in scope (`sandboxed-user?`), scrub every dashcard to
     [[sandbox-safe-dashcard-keys]] and drop the dashboard's `:parameters`. Over-redaction here is
     acceptable and safe. A top-level `select-keys` would NOT reach the nested dashcards, so we walk
     `:dashcards` explicitly.

   - Every other model, and non-sandboxed users / superusers / OSS: `mbr` is returned unchanged.

   Both predicates fail CLOSED: they read the per-request `*sandboxes-for-user*` cache (bound by
   `bind-current-user` middleware on the metabot/agent endpoints) and throw a 403 if called without a
   `*current-user-id*` binding (e.g. a bare `(binding [...] ...)` that forgets it, or future
   parallelization that loses dynamic bindings on worker threads) rather than silently exposing data.

   Native card queries are covered by `card-query-touches-sandboxed-table?`: `lib/all-source-table-ids`
   only sees `:source-table` refs, so it falls back to a database-level sandbox check when a query has
   no structural source tables — any enforced sandbox on the card's database withholds the keys, since
   the raw SQL's referenced tables can't be enumerated."
  [model instance mbr]
  (cond
    (and (= model "Card")
         (perms/card-query-touches-sandboxed-table? instance))
    (select-keys mbr sandbox-safe-card-keys)

    (and (= model "Dashboard")
         (perms/sandboxed-user?))
    (-> mbr
        (dissoc :parameters)
        (cond-> (contains? mbr :dashcards)
          (update :dashcards #(mapv scrub-dashcard %))))

    :else
    mbr))

(defn ->mbr
  "Run serdes/extract-all for a single instance, producing an MBR map.

  Goes through the same hydrate-then-transform pipeline serdes uses on export
  ([[serdes/extract-query]] hydrates nested fields, [[serdes/log-and-extract-one]]
  applies the model spec), so models with `serdes/nested` transforms
  (Dashboard `:tabs`/`:dashcards`, Card aliases, etc.) get their nested entities
  rendered into MBR.

  For `Database`, the export pipeline normally excludes H2 instances and any
  database-router children (gating on the `*include-h2-in-extract?*` var). For
  read_resource we want to surface every reachable database, so we bind that
  var true here. (`router_database_id IS NULL` is enforced at the Database
  model's extract-query and not bypassable from outside, but the typical
  read_resource use case won't be hitting router-children databases.)

  Caller is responsible for any permission check on `instance`. See
  [[extract-as-user]] for a perm-gated entry point."
  [model instance]
  (let [pipeline (if (= model "Database")
                   (binding [warehouses.database/*include-h2-in-extract?* true]
                     (into [] (serdes/extract-all model {:where [:= :id (:id instance)]})))
                   (into [] (serdes/extract-all model {:where [:= :id (:id instance)]})))]
    (redact-sandboxed model instance (first pipeline))))

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
                    (let [extract (fn []
                                    (u/index-by :serdes/meta (serdes/extract-all model (extract-opts model ids))))
                          extracted-by-path (if (= model "Database")
                                              (binding [warehouses.database/*include-h2-in-extract?* true]
                                                (extract))
                                              (extract))]
                      (into [] (keep (fn [inst]
                                       (some->> (serdes/generate-path model inst)
                                                (get extracted-by-path)
                                                (redact-sandboxed model inst))))
                            sliced)))]
     (if paged?
       {:items mbrs :total total :page page :pages pages}
       mbrs))))

(defn with-uri
  "Attach a navigation URI to an MBR map. Non-spec metadata, keyed `_uri`."
  [mbr uri]
  (assoc mbr :_uri uri))

(defn table-uri-from
  "URI builder for a Table instance + its hydrated database name."
  [table db-name]
  (table-uri db-name (:schema table) (:name table)))

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

(defn segments->uri
  "Reverse of URI parsing: a vector of path segments back into a URI string.
   Used by tests / docs to confirm round-trip."
  [segments]
  (str "metabase://" (str/join "/" (map enc segments))))
