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
   [metabase.warehouses.models.database :as warehouses.database]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  "Look up a Database by name (preferred, MBR path-form) or numeric id (legacy).

   Numeric-looking strings are treated as ids; everything else as a name. This
   means a literal database named e.g. \"42\" cannot be addressed by name —
   not a real concern since Metabase routes the database name through the UI
   anyway."
  [id-str]
  (when id-str
    (if-let [n (parse-long id-str)]
      (t2/select-one :model/Database n)
      (t2/select-one :model/Database :name id-str))))

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

(def ^:private sandbox-redacted-card-keys
  "Card MBR keys that name the underlying warehouse tables/columns. Serdes extracts them
   unfiltered (it is an admin-export pipeline), so for a user with a data sandbox on any table
   the card touches we withhold them — otherwise the MBR would leak column/table names the
   sandbox hides. See `~/dv/mb/ai-reports/mbr-read-resource-sandbox-leak.md`."
  [:dataset_query :result_metadata])

(defn redact-sandboxed
  "Strip sandbox-revealing keys from `mbr` when the current user is sandboxed on the warehouse
   data behind `instance`.

   Currently only Cards (questions / models / metrics) carry such keys inline. When the user has
   an enforced sandbox on any source table of the card's query, drop `:dataset_query` and
   `:result_metadata` (identity + FK references stay). For every other model, and for
   non-sandboxed users / superusers / OSS, `mbr` is returned unchanged.

   Fail-closed by construction: the predicate is an EE `defenterprise` that defaults to `false`
   only on OSS / no-sandbox; when a sandbox is configured but its source card's metadata is
   missing, the underlying sandbox machinery still reports the table as sandboxed, so we redact."
  [model instance mbr]
  (if (and (= model "Card")
           (perms/card-query-touches-sandboxed-table? instance))
    (apply dissoc mbr sandbox-redacted-card-keys)
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

  Without `:limit`, returns a vector of MBR maps for the readable subset.

  With `:limit n`, slices the readable subset to the first `n` instances *before*
  extracting — so we never serdes-hydrate items the caller will throw away — and
  returns a map `{:items <≤n MBRs> :total <full readable count>}`. `:total` is
  the count of readable instances before the limit, so the caller can report
  honest truncation even though only `n` were extracted.

  Maintains input order by re-correlating each instance to its extracted MBR via
  the full serdes path tuple (see the comment in the body).

  Batched: one `extract-all` call against the union of (possibly limited) readable
  ids, not one per instance. This matters for collection list endpoints where a
  single response may extract dozens of cards/dashboards — N+1 nested-hydration
  roundtrips would be a noticeable perf cliff."
  ([model instances]
   (extract-readable model instances nil))
  ([model instances {:keys [limit]}]
   (let [readable (filterv mi/can-read? instances)
         total    (count readable)
         sliced   (if limit (vec (take limit readable)) readable)
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
                                    (into {}
                                          (map (fn [m] [(:serdes/meta m) m]))
                                          (serdes/extract-all model (extract-opts model ids))))
                          extracted-by-path (if (= model "Database")
                                              (binding [warehouses.database/*include-h2-in-extract?* true]
                                                (extract))
                                              (extract))]
                      (into [] (keep (fn [inst]
                                       (some->> (get extracted-by-path (serdes/generate-path model inst))
                                                (redact-sandboxed model inst))))
                            sliced)))]
     (if limit
       {:items mbrs :total total}
       mbrs))))

(defn with-uri
  "Attach a navigation URI to an MBR map. Non-spec metadata, keyed `_uri`."
  [mbr uri]
  (assoc mbr :_uri uri))

(defn- canonical-fields
  "Pull the fields we need to build sync-metadata URIs out of a Toucan instance."
  [{:keys [name schema] :as _table} db-name]
  {:db-name    db-name
   :schema     schema
   :table-name name})

(defn table-uri-from
  "URI builder for a Table instance + its hydrated database name."
  [table db-name]
  (let [{:keys [db-name schema table-name]} (canonical-fields table db-name)]
    (table-uri db-name schema table-name)))

(def max-list-items
  "Cap on items in a single list response. When exceeded the response includes
   `:truncated true` and `:total` so the agent knows there are more items it
   can drill into (via search or by paginating, once that's wired).

   Callers pass this as `:limit` to [[extract-readable]] so only this many items
   are serdes-hydrated, never the full readable set."
  25)

(defn list-result
  "Wrap a sequence of MBR items in the list envelope used by `read_resource`.

   The shape matches `metabase.metabot.tools.resources` dispatch contract:
   the outer map has `:structured-output` whose `:result-type` tells
   [[metabase.metabot.tools.resources/format-content]] how to render.

   `items` is already capped upstream (callers slice via [[extract-readable]]'s
   `:limit`). Pass the true pre-cap count as `:total` in `opts` so `:truncated`
   reports honestly; when `:total` is omitted it falls back to `(count items)`
   (correct only when no upstream cap was applied)."
  [list-type items {:keys [total]}]
  (let [items  (vec items)
        total  (or total (count items))
        capped (vec (take max-list-items items))]
    {:structured-output
     {:result-type :mbr-list
      :list-type   list-type
      :items       capped
      :total       total
      :truncated   (> total max-list-items)}}))

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
