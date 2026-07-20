(ns metabase.mcp.v2.tools.browse
  "The v2 MCP browse tools.

   `browse_data`: one tool for the data hierarchy, dispatched on an explicit `action` enum.
   The `list_*` actions page server-side over the full permission-filtered sets (the backing
   endpoints have no paging); `get_fields` rides the batched, sandbox-aware table-metadata
   fetch and applies a byte budget — whole tables in request order, the rest named under
   `omitted`, never a silently truncated table.

   `browse_collection`: structural navigation over every collection partition — items mode
   over any id form (numeric | entity_id | \"root\" | \"trash\") and namespace, tree mode
   composing the shallow tree fetch per expandable node under a depth, per-node child cap,
   and total node budget."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.children :as collections.children]
   [metabase.collections.models.collection :as collection]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.table :as schema.table]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Projections ---------------------------------------------------

(def ^:private database-concise-keys
  [:id :name :engine :description])

(def ^:private database-detailed-keys
  (into database-concise-keys
        [:timezone :dbms_version :is_sample :is_on_demand :uploads_enabled :auto_run_queries
         :initial_sync_status :created_at :updated_at]))

(projections/register-projection!
 :database
 {:concise  #(select-keys % database-concise-keys)
  :detailed #(select-keys % database-detailed-keys)
  :sample   (zipmap database-detailed-keys (repeat "x"))})

(def ^:private field-concise-keys
  [:id :name :display_name :base_type :semantic_type :fk_target_field_id :description])

(def ^:private field-detailed-keys
  (into field-concise-keys
        [:effective_type :coercion_strategy :database_type :fingerprint :has_field_values
         :values :position]))

(def ^:private table-metadata-sample
  {:id             1
   :name           "x"
   :display_name   "x"
   :schema         "x"
   :db_id          1
   :description    "x"
   :fields         [(-> (zipmap field-detailed-keys (repeat "x"))
                        (assoc :fingerprint {:global {:distinct-count 1}}
                               :values [["x" "x"]]))]
   :measures       [{:id 1 :name "x" :description "x"}]
   :segments       [{:id 1 :name "x" :description "x"}]
   :metrics        [{:id 1 :name "x" :description "x"}]
   :related_tables [{:id 1 :name "x" :display_name "x" :schema "x" :fields ["x"]}]})

;; Registered for the `fields` dot-path catalog; the row itself is built by
;; [[table-metadata-row]] (the projection needs the batch-fetched hydrations, not a plain row).
(projections/register-projection!
 :table-metadata
 {:concise  identity
  :detailed identity
  :sample   table-metadata-sample})

;;; -------------------------------------------- Per-action validation ---------------------------------------------

(def ^:private action->arg-spec
  {"list_databases" {:allowed #{:limit :offset :response_format :fields}}
   "list_schemas"   {:required [:database_id]
                     :allowed  #{:database_id :include_hidden :limit :offset}}
   "list_tables"    {:required [:database_id]
                     :allowed  #{:database_id :schema :search :include_hidden :limit :offset
                                 :response_format :fields}}
   "list_models"    {:required [:database_id]
                     :allowed  #{:database_id :limit :offset :response_format :fields}}
   "get_fields"     {:required [:table_ids]
                     :allowed  #{:table_ids :include_hidden :offset :response_format :fields}}})

(defn- validate-args-for-action!
  [{:keys [action] :as args}]
  (let [{:keys [required allowed]} (action->arg-spec action)]
    (doseq [k required]
      (when-not (contains? args k)
        (common/throw-teaching-error (format "`%s` is required for action %s." (name k) action))))
    (when-let [bad (seq (sort (map name (remove (conj allowed :action) (keys args)))))]
      (common/throw-teaching-error
       (format "%s not apply to action %s — remove %s."
               (if (next bad) (str "`" (str/join "`, `" bad) "` do") (str "`" (first bad) "` does"))
               action
               (if (next bad) "them" "it"))))))

(defn- check-database!
  "Read-check `database-id` and confirm it is browsable, collapsing \"doesn't exist\", \"not
   readable\", and \"not browsable\" (a stub, or a router-destination database — a multi-tenant
   boundary a raw id must not cross) into the shared not-found teaching error. Selecting through
   the same filter [[list-databases]] pages means the tool never serves a database it would not
   list, independent of what the schema/table helpers happen to filter."
  [database-id]
  (try
    (api/read-check (t2/select-one :model/Database
                                   :id database-id
                                   {:where (schema.table/browsable-databases-honeysql-filter)}))
    (catch clojure.lang.ExceptionInfo e
      (if (contains? #{403 404} (:status-code (ex-data e)))
        (common/throw-not-found :database database-id)
        (throw e)))))

;;; ------------------------------------------------ List plumbing -------------------------------------------------

(def ^:private default-limit 50)

(defn- page-args
  [args]
  {:limit  (or (:limit args) default-limit)
   :offset (or (:offset args) 0)})

(defn- paged-list-content
  "Slice `rows` (the full filtered set) per `limit`/`offset` and build the envelope content.
   `project-fn` runs on the page only; `opts` pass through to [[common/list-content]]."
  [args rows opts project-fn]
  (let [{:keys [limit offset]} (page-args args)
        page (into [] (comp (drop offset) (take limit)) rows)]
    (common/list-content (project-fn page) (count rows)
                         (assoc opts :offset offset :limit limit))))

(defn- project-rows
  [type args rows]
  (if-let [fields (:fields args)]
    (common/select-fields type
                          (mapv #(projections/project type :detailed %) rows)
                          fields
                          {:response-format (:response_format args)})
    (let [fmt (common/response-format args)]
      (mapv #(projections/project type fmt %) rows))))

;;; ------------------------------------------------ list_* actions ------------------------------------------------

(def ^:private database-select-columns
  "Columns `list_databases` selects for the `:database` projection."
  ;; Naming the columns keeps `t2/select` from decrypting the `details`/`settings` blobs on every
  ;; row — nothing projected reads them, and `mi/can-read?` needs only `:id`.
  (into [:model/Database] database-detailed-keys))

(def ^:private no-databases-hint
  "Steering for an empty list_databases: without it an empty envelope reads as `this instance has
   no data`, and the caller stops instead of reporting the permission gap."
  ;; Deliberately does not distinguish \"none exist\" from \"none readable\" — same collapse as
  ;; [[common/throw-not-found]], and true either way.
  "No databases are visible to you — browsing data needs query-builder or table-metadata permission on at least one database.")

(defn- list-databases
  [args]
  (let [dbs (->> (t2/select database-select-columns
                            {:where    (schema.table/browsable-databases-honeysql-filter)
                             :order-by [[:%lower.name :asc]]})
                 (filterv mi/can-read?))]
    (paged-list-content args dbs {:empty-hint no-databases-hint}
                        #(project-rows :database args %))))

(defn- list-schemas
  [{:keys [database_id include_hidden] :as args}]
  (check-database! database_id)
  (let [schemas (vec (schema.table/database-schemas database_id {:include-hidden? include_hidden}))]
    (paged-list-content args schemas {} identity)))

(defn- named-schema-tables
  [database-id schema include-hidden?]
  (try
    (schema.table/schema-tables-list database-id schema {:include-hidden? include-hidden?})
    (catch clojure.lang.ExceptionInfo e
      ;; The schema-level permission check collapses with "no such schema": both answers must
      ;; be indistinguishable, so listings never form an existence oracle.
      (if (= 403 (:status-code (ex-data e)))
        (common/throw-teaching-error
         (format "Schema %s not found in database %s — it may not exist, or you may not have access to it."
                 (pr-str schema) database-id)
         {:status-code 404})
        (throw e)))))

(defn- blank-schema-tables
  "Tables whose schema is nil or the empty string — the blank-schema path for databases without
   schemas. An unreadable/absent blank schema is an empty list, not an error, so omitting
   `schema` on a schema-ful database degrades gracefully."
  [database-id include-hidden?]
  (into []
        (mapcat (fn [schema]
                  (try
                    (schema.table/schema-tables-list database-id schema {:include-hidden? include-hidden?})
                    (catch clojure.lang.ExceptionInfo e
                      (when-not (= 403 (:status-code (ex-data e)))
                        (throw e))))))
        [nil ""]))

(defn- matches-search?
  "Case-insensitive substring match on either name the row exposes. `display_name` is nullable and
   is what an admin edits when renaming a table, so it is the name the caller was most likely
   shown — matching only `name` loses renamed tables."
  [needle table]
  (boolean (some #(and % (str/includes? (u/lower-case-en %) needle))
                 [(:name table) (:display_name table)])))

(defn- list-tables
  [{:keys [database_id schema search include_hidden] :as args}]
  (check-database! database_id)
  (let [tables   (if (str/blank? schema)
                   (blank-schema-tables database_id include_hidden)
                   (named-schema-tables database_id schema include_hidden))
        filtered (if search
                   (let [needle (u/lower-case-en search)]
                     (filterv (partial matches-search? needle) tables))
                   (vec tables))]
    ;; Once search was supplied there is nothing left to narrow by, so drop the `:search` steering.
    (paged-list-content args filtered (if search {} {:param :search}) #(project-rows :table args %))))

(def ^:private question-select-columns
  "Columns `list_models` selects for the `:question` projection."
  ;; Naming the columns keeps `t2/select` from running the `dataset_query` and `result_metadata`
  ;; transforms on every model — the expensive part of listing a database with thousands of cards.
  ;; `:card_schema` is never projected, but Card's after-select hook throws without it once the
  ;; row carries `:id` plus any of `:dataset_query`/`:result_metadata`/`:database_id`/`:type`.
  (into [:model/Card :card_schema] projections/question-detailed-keys))

(defn- list-models
  [{:keys [database_id] :as args}]
  (check-database! database_id)
  (let [models (->> (t2/select question-select-columns
                               :type :model
                               :database_id database_id
                               :archived false
                               {:order-by [[:%lower.name :asc]]})
                    (filterv mi/can-read?))]
    (paged-list-content args models {} #(project-rows :question args %))))

;;; ------------------------------------------------- get_fields ---------------------------------------------------

(def ^:private max-table-ids 20)

(def ^:private get-fields-byte-budget
  "Response budget for one get_fields call, in actual serialized bytes. Whole tables are
   included in request order until it runs out; the exact value is not spec-bound."
  (* 100 1024))

(def ^:private max-related-tables
  "Ceiling on related tables surfaced per requested table; see v1's identically-motivated cap
   (heap blowups on highly-connected schemas, metabase#76493)."
  50)

(def ^:private max-related-tables-with-fields
  "Of the related tables surfaced, only this many carry their column names."
  10)

(defn- fetch-table-metadata-rows
  "Fetch query-metadata rows for `table-ids` in request order. Always goes through the
   defenterprise fetchers so EE column-level sandboxing applies; `include-hidden?` forces the
   per-table path (the batch helper cannot include hidden fields). Ids that don't resolve to a
   readable table land in `:missing` — indistinguishable between absent and unreadable.
   Returns `{:rows [...] :missing [ids]}`."
  [table-ids include-hidden?]
  (let [rows  (if include-hidden?
                (keep (fn [id]
                        (try
                          (schema.table/fetch-table-query-metadata id {:include-hidden-fields? true})
                          (catch clojure.lang.ExceptionInfo e
                            (when-not (contains? #{403 404} (:status-code (ex-data e)))
                              (throw e)))))
                      table-ids)
                (schema.table/batch-fetch-table-query-metadatas table-ids nil))
        by-id (m/index-by :id rows)]
    {:rows    (into [] (keep by-id) table-ids)
     :missing (into [] (remove by-id) table-ids)}))

(defn- related-tables-by-requested-table
  "Map of requested table id → vector of its FK-target tables (readable ones only, capped at
   [[max-related-tables]]), the first [[max-related-tables-with-fields]] of which carry their
   visible column names — sandbox-filtered, so a sandboxed caller never sees hidden columns of
   a neighboring table."
  [metadata-rows]
  (let [targets-by-table (into {}
                               (map (fn [{:keys [id fields]}]
                                      [id (into []
                                                (comp (keep #(get-in % [:target :table_id]))
                                                      (remove #{id})
                                                      (distinct))
                                                fields)]))
                               metadata-rows)
        related-ids      (into #{} (mapcat val) targets-by-table)
        related          (when (seq related-ids)
                           (->> (t2/select :model/Table :id [:in related-ids] :active true)
                                (filter mi/can-read?)
                                (m/index-by :id)))
        expand-ids       (into #{}
                               (mapcat (fn [[_ target-ids]]
                                         (->> target-ids
                                              (filter related)
                                              (take max-related-tables-with-fields))))
                               targets-by-table)
        columns          (when (seq expand-ids)
                           (-> (group-by :table_id
                                         (t2/select [:model/Field :id :name :table_id :position]
                                                    :table_id [:in expand-ids]
                                                    :active true
                                                    :visibility_type [:not-in ["hidden" "sensitive" "retired"]]
                                                    {:order-by [[:position :asc] [:id :asc]]}))
                               schema.table/batch-filter-sandboxed-fields))]
    (update-vals targets-by-table
                 (fn [target-ids]
                   (into []
                         (comp (keep related)
                               (take max-related-tables)
                               (map-indexed
                                (fn [i {:keys [id name display_name schema]}]
                                  (cond-> {:id id :name name :display_name display_name :schema schema}
                                    (and (< i max-related-tables-with-fields) (get columns id))
                                    (assoc :fields (mapv :name (get columns id)))))))
                         target-ids)))))

(defn- list-type-field?
  [field]
  (contains? #{:list :auto-list} (keyword (:has_field_values field))))

(defn- attach-inline-values
  "Inline cached sample `:values` (as `[value human-readable?]` pairs, the REST field/values
   shape) onto list-type fields, for the detailed projection. One current-user-aware batched
   FieldValues fetch across all `tables` — sandboxed/impersonated fields resolve through their
   per-user cache, never the shared one."
  [tables]
  (let [field-ids  (into []
                         (comp (mapcat :fields)
                               (filter list-type-field?)
                               (keep :id))
                         tables)
        id->values (when (seq field-ids)
                     (params.field-values/field-id->field-values-for-current-user field-ids))]
    (if (empty? id->values)
      tables
      (mapv (fn [table]
              (update table :fields
                      (partial mapv
                               (fn [field]
                                 (if-let [fv (and (list-type-field? field)
                                                  (get id->values (:id field)))]
                                   (assoc field :values (field-values/field-values->pairs fv))
                                   field)))))
            tables))))

(defn- compact
  [m]
  (into {} (remove (comp nil? val)) m))

(defn- brief-row
  [row]
  (compact (select-keys row [:id :name :description])))

(defn- table-metadata-row
  "Build the get_fields response row for one batch-fetched `table`, at detail level `fmt`.
   Fields come out in `position` order — the order the single-table slice pages through."
  [fmt related table]
  (let [field-keys (case fmt
                     :concise  field-concise-keys
                     :detailed field-detailed-keys)]
    (-> (compact (select-keys table [:id :name :display_name :schema :db_id :description]))
        (assoc :fields         (into []
                                     (map #(compact (select-keys % field-keys)))
                                     (sort-by #(or (:position %) 0) (:fields table)))
               :measures       (mapv brief-row (:measures table))
               :segments       (mapv brief-row (:segments table))
               :metrics        (mapv brief-row (:metrics table))
               :related_tables (get related (:id table) [])))))

(defn- project-table
  [args related table]
  (if-let [fields (:fields args)]
    (common/select-fields :table-metadata
                          (table-metadata-row :detailed related table)
                          fields
                          {:response-format (:response_format args)})
    (table-metadata-row (common/response-format args) related table)))

(defn- byte-size
  ^long [x]
  (alength (.getBytes ^String (json/encode x) "UTF-8")))

(defn- budget-omitted
  [payload]
  {:id     (:id payload)
   :name   (:name payload)
   :reason "response budget — request in a separate call"})

(defn- slice-table-payload
  "The explicit single-table slice: fields in position order from `offset`, as many as fit the
   budget (never fewer than one, so paging always advances), plus counts and — when fields
   remain — the continuation message naming the next offset."
  [payload offset]
  (let [all-fields (vec (:fields payload))
        total      (count all-fields)
        base       (assoc payload :fields [] :total_fields total :offset offset)
        [included] (reduce (fn [[fields used] field]
                             (let [used' (+ used (byte-size field) 1)]
                               (if (and (seq fields) (> used' get-fields-byte-budget))
                                 (reduced [fields used])
                                 [(conj fields field) used'])))
                           [[] (byte-size base)]
                           (drop offset all-fields))
        next-offset (+ offset (count included))
        message     (when (< next-offset total)
                      (format "%s: %d of %d fields, continue with `offset: %d`."
                              (or (:name payload) (:id payload)) (count included) total next-offset))]
    {:payload (assoc base :fields included)
     :message message}))

(defn- assemble-tables
  "Apply the byte budget to `payloads` (in request order): whole tables until the budget runs
   out, then the rest under `:omitted`. When the first table alone exceeds the budget — or the
   caller passed an explicit `offset` — it is returned as a single-table slice instead."
  [payloads offset]
  (if (and (seq payloads)
           (or (some? offset)
               (> (byte-size (first payloads)) get-fields-byte-budget)))
    (let [{:keys [payload message]} (slice-table-payload (first payloads) (or offset 0))]
      {:tables  [payload]
       :omitted (mapv budget-omitted (rest payloads))
       :message message})
    (loop [[payload & more :as remaining] payloads
           used   0
           tables []]
      (if (empty? remaining)
        {:tables tables :omitted []}
        (let [size (byte-size payload)]
          (if (<= (+ used size) get-fields-byte-budget)
            (recur more (+ used size) (conj tables payload))
            {:tables tables :omitted (mapv budget-omitted remaining)}))))))

(defn- get-fields
  [{:keys [table_ids include_hidden offset] :as args}]
  ;; Dedup before the guards: the cap and the single-table `offset` rule are about distinct tables,
  ;; so `[1 1]` is one table (a valid `offset` target), not two, and repeated ids don't inflate the
  ;; count toward the cap.
  (let [table-ids (into [] (distinct) table_ids)]
    (when (empty? table-ids)
      (common/throw-teaching-error "`table_ids` must name at least one table."))
    (when (> (count table-ids) max-table-ids)
      (common/throw-teaching-error
       (format "`table_ids` accepts at most %d ids per call — you passed %d; split the request."
               max-table-ids (count table-ids))))
    (when (and offset (> (count table-ids) 1))
      (common/throw-teaching-error
       "`offset` with get_fields pages the fields of one large table — request that table alone."))
    (let [{fetched :rows missing :missing} (fetch-table-metadata-rows table-ids (true? include_hidden))
          ;; A table whose database isn't browsable (a stub or router-destination database) is
          ;; collapsed into `missing` exactly like an unreadable one — enforced here against the same
          ;; filter [[list-databases]] uses, so a change to the metadata fetch can't reopen a leak.
          browsable-db-ids (let [db-ids (into #{} (map :db_id) fetched)]
                             (when (seq db-ids)
                               (t2/select-pks-set :model/Database
                                                  {:where [:and
                                                           [:in :id db-ids]
                                                           (schema.table/browsable-databases-honeysql-filter)]})))
          browsable? (fn [row] (contains? browsable-db-ids (:db_id row)))
          rows      (filterv browsable? fetched)
          missing   (into (vec missing) (comp (remove browsable?) (map :id)) fetched)
          detailed? (or (contains? args :fields)
                        (= :detailed (common/response-format args)))
          rows      (cond-> rows detailed? attach-inline-values)
          related   (related-tables-by-requested-table rows)
          payloads  (mapv #(project-table args related %) rows)
          {:keys [tables omitted message]} (assemble-tables payloads offset)
          omitted   (into (mapv (fn [id]
                                  {:id     id
                                   :reason "not found — it may not exist, or you may not have access to it"})
                                missing)
                          omitted)
          body      (cond-> {:tables tables}
                      (seq omitted) (assoc :omitted omitted))]
      (common/success-content (cond-> (json/encode body)
                                message (str "\n" message))))))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private browse-args-schema
  [:map {:closed true}
   [:action (into [:enum {:description "What to browse. list_databases → list_schemas → list_tables → get_fields walks the hierarchy; list_models lists the models built on a database."}]
                  ["list_databases" "list_schemas" "list_tables" "list_models" "get_fields"])]
   [:database_id {:optional true}
    [:maybe [:int {:description "Numeric database id (databases have no entity_id). Required for list_schemas, list_tables, and list_models."}]]]
   [:schema {:optional true}
    [:maybe [:string {:description "list_tables only: the schema to list. Omit (or pass \"\") for databases without schemas."}]]]
   [:search {:optional true}
    [:maybe [:string {:min 1 :description "list_tables only: case-insensitive substring filter on table name or display name, applied before paging."}]]]
   [:table_ids {:optional true}
    [:maybe [:sequential {:description "get_fields only: numeric table ids (tables have no entity_id), at most 20 per call."}
             [:int {:min 1}]]]]
   [:include_hidden {:optional true}
    [:maybe [:boolean {:description "Include hidden schemas/tables (list_schemas, list_tables) or hidden fields (get_fields). Sensitive fields are always excluded. Default false."}]]]
   [:limit {:optional true}
    [:maybe [:int {:min 1 :max 500 :description "list_* actions: maximum rows to return (default 50)."}]]]
   [:offset {:optional true}
    [:maybe [:int {:min 0 :description "list_* actions: rows to skip, for paging. For get_fields it pages the fields of a single oversized table, as directed by the continuation message."}]]]
   [:response_format {:optional true}
    [:maybe [:enum {:description "concise (default) returns the essential columns; detailed adds the full projection (for get_fields: effective_type, coercion_strategy, database_type, fingerprint, has_field_values, and inline values for list-type fields)."}
             "concise" "detailed"]]]
   [:fields {:optional true}
    [:maybe [:sequential [:string {:min 1 :description "Dot-paths picked from the detailed row shape, item-relative (e.g. \"fields.name\"). Mutually exclusive with response_format. Not supported for list_schemas."}]]]]])

(registry/deftool browse-data
  "Browse the data hierarchy: databases → schemas → tables → fields. Actions: list_databases — databases you can see; list_schemas — schema names in a database; list_tables — tables in a database, scoped to `schema` (omit it for databases without schemas) and optionally narrowed with `search`; list_models — models built on a database; get_fields — field metadata for up to 20 tables in one call, each table carrying its measures, segments, metrics, and related tables (FK targets with column names) for query construction. list_* actions return the {data, returned, total} envelope paged with limit/offset. get_fields returns whole tables within a response byte budget and names any tables it had to omit; a single table too large for the budget comes back as a position-ordered field slice with a continuation offset."
  {:name        "browse_data"
   :scope       metabot.scope/agent-resource-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        browse-args-schema}
  [{:keys [action] :as args} _context]
  (validate-args-for-action! args)
  (case action
    "list_databases" (list-databases args)
    "list_schemas"   (list-schemas args)
    "list_tables"    (list-tables args)
    "list_models"    (list-models args)
    "get_fields"     (get-fields args)))

;;; --------------------------------------------- browse_collection ------------------------------------------------

(def ^:private collection-item-concise-keys
  [:id :name :model :description :collection_position])

(def ^:private collection-item-detailed-keys
  (into collection-item-concise-keys
        [:entity_id :collection_id :database_id :display :archived :authority_level
         :moderated_status :last_used_at :location :here :below :last-edit-info]))

(projections/register-projection!
 :collection-item
 {:concise  #(compact (select-keys % collection-item-concise-keys))
  :detailed #(compact (select-keys % collection-item-detailed-keys))
  :sample   (-> (zipmap collection-item-detailed-keys (repeat "x"))
                (assoc :last-edit-info {:id 1 :email "x" :first_name "x" :last_name "x" :timestamp "x"}
                       :here ["card"]
                       :below ["card"]))})

;;; ------------------------------------------ browse_collection validation ----------------------------------------

(def ^:private collection-items-mode-args
  #{:id :mode :namespace :type :created_by :pinned_state :sort_column :sort_direction :limit :offset
    :response_format :fields})

(def ^:private collection-tree-mode-args
  #{:id :mode :namespace :depth})

(defn- validate-browse-collection-args!
  [{:keys [mode] :as args}]
  (if (= mode "tree")
    (when-let [bad (seq (sort (map name (remove collection-tree-mode-args (keys args)))))]
      (common/throw-teaching-error
       (format "`%s` do%s not apply to tree mode — trees have no pagination or item filters; re-root with browse_collection(id: <subcollection>, mode: \"tree\"), raise `depth`, or use mode: \"items\"."
               (str/join "`, `" bad) (if (next bad) "" "es"))))
    (when-let [bad (seq (sort (map name (remove collection-items-mode-args (keys args)))))]
      (common/throw-teaching-error
       (format "`%s` do%s not apply to items mode — `depth` shapes the tree; pass mode: \"tree\" to get one."
               (str/join "`, `" bad) (if (next bad) "" "es"))))))

(defn- namespace-arg
  "The requested namespace as collection rows carry it: nil for content."
  [{:keys [namespace]}]
  (when-not (contains? #{nil "content"} namespace)
    namespace))

(defn- check-collection-namespace!
  "A real collection id already carries its namespace; an explicit `namespace` argument that
   contradicts it is a teaching error."
  [{:keys [id] :as args} target-collection]
  (when (contains? args :namespace)
    (let [wanted (namespace-arg args)
          actual (some-> (:namespace target-collection) u/qualified-name)]
      (when (not= wanted actual)
        (common/throw-teaching-error
         (format "Collection %s is in the %s namespace — a real collection id already carries its namespace, so drop `namespace` or pass %s."
                 id (or actual "content") (pr-str (or actual "content"))))))))

(defn- read-checked-collection
  [id-or-eid]
  (common/resolve-and-read :model/Collection id-or-eid
                           (fn [id] (api/read-check :model/Collection id))))

(defn- read-checked-trash
  []
  (try
    (api/read-check (collection/trash-collection))
    (catch clojure.lang.ExceptionInfo e
      (if (contains? #{403 404} (:status-code (ex-data e)))
        (common/throw-not-found :collection "trash")
        (throw e)))))

(defn- resolve-browse-target
  "Resolve the `id` argument to `{:root? <bool> :collection <row-or-root-placeholder>}`. Real
   collections come back read-checked, with \"doesn't exist\" and \"not readable\" collapsed."
  [{:keys [id] :as args}]
  (cond
    (= id "root")
    {:root?      true
     :collection (assoc collection/root-collection :namespace (namespace-arg args))}

    (= id "trash")
    (let [trash (read-checked-trash)]
      (check-collection-namespace! args trash)
      {:collection trash})

    :else
    (let [coll (read-checked-collection id)]
      (check-collection-namespace! args coll)
      {:collection coll})))

;;; --------------------------------------------- browse_collection items ------------------------------------------

(def ^:private type->rest-model
  {"question"   :card
   "model"      :dataset
   "metric"     :metric
   "dashboard"  :dashboard
   "collection" :collection
   "document"   :document})

(defn- root-namespace-models
  "Model set for a root listing: each namespace's own model plus subfolders; content follows
   `type` (empty set = every type)."
  [ns-str type]
  (case ns-str
    nil          (into #{} (map type->rest-model) type)
    "snippets"   #{:snippet :collection}
    "transforms" #{:transform :collection}
    "analytics"  #{:collection}))

(defn- collection-items-content
  [{:keys [type created_by pinned_state sort_column sort_direction] :as args} {:keys [root? collection]}]
  (let [{:keys [limit offset]} (page-args args)
        ns-str        (some-> (:namespace collection) u/qualified-name)
        _             (when (and (seq type) (some? ns-str))
                        (common/throw-teaching-error
                         (format "`type` applies to the content namespace only — the %s namespace returns its own model plus subfolders; drop `type`."
                                 ns-str)))
        created-by-id (when (= created_by "me") api/*current-user-id*)
        models        (if root?
                        (collections.children/visible-model-kwds collection (root-namespace-models ns-str type))
                        (into #{} (map type->rest-model) type))
        trash?        (collection/is-trash? collection)
        options   {:show-dashboard-questions? false
                   :include-library?          (not root?)
                   :archived?                 (boolean (or (:archived collection) trash?))
                   :models                    models
                   :created-by-id             created-by-id
                   :pinned-state              (keyword (or pinned_state "all"))
                   :sort-info                 {:sort-column                 (keyword (str/replace (or sort_column "name") "_" "-"))
                                               :sort-direction              (keyword (or sort_direction "asc"))
                                               :official-collections-first? (not trash?)}}
        res       (request/with-limit-and-offset limit offset
                    (collections.children/collection-children collection options))
        total     (or (:total res) 0)
        ;; the snippets-namespace root path ignores the limit/offset binding (no :limit key on
        ;; the result) and returns every row, so the page is sliced here
        rows      (if (contains? res :limit)
                    (vec (:data res))
                    (into [] (comp (drop offset) (take limit)) (:data res)))
        projected (project-rows :collection-item args rows)
        line      (when (< (+ offset (count rows)) total)
                    (if (nil? ns-str)
                      (common/truncation-line {:param :type :offset offset :limit limit :total total})
                      (format "Returned %d of %d — continue with `offset: %d`."
                              (count rows) total (+ offset limit))))]
    (common/success-content (cond-> (json/encode (common/list-envelope projected total))
                              line (str "\n" line)))))

;;; --------------------------------------------- browse_collection tree -------------------------------------------

(def ^:private tree-default-depth 2)

(def ^:private tree-child-cap
  "Children surfaced per node in tree mode; the rest are named in the truncation marker."
  50)

(def ^:private tree-node-budget
  "Total nodes one tree response may contain, bounding the shallow-fetch composition."
  250)

(defn- pr-id
  [id]
  (if (number? id) id (pr-str id)))

(defn- tree-marker
  "Marker for a node re-rooting recovers: re-rooting resets the depth and node budget, so a
   fresh `mode: \"tree\"` call at this node reveals what depth or budget cut off here."
  [more-count parent-name parent-id]
  (format "… %s under %s — browse_collection(id: %s, mode: \"tree\")"
          (if more-count (str more-count " more") "more")
          (pr-str parent-name)
          (pr-id parent-id)))

(defn- cap-marker
  "Marker for a node the per-node child cap trimmed. Re-rooting in tree mode re-applies the same
   cap and returns the identical page, so this steers to items-mode pagination — the only way to
   reach the children past the cap."
  [more parent-name parent-id offset]
  (format "… %d more under %s — browse_collection(id: %s, mode: \"items\", type: [\"collection\"], offset: %d)"
          more (pr-str parent-name) (pr-id parent-id) offset))

(defn- expand-tree-node
  "Build the output node for `node` (`{:id :name :children <expandable?>}`), expanding up to
   `depth` more levels through `fetch` while the shared node `budget` (an atom) lasts. A node
   left unexpanded carries a truncation marker: depth/budget exhaustion recovers by re-rooting
   in tree mode, but a node trimmed by the per-node cap steers to items-mode pagination, which
   is the only call that reaches the trimmed children."
  [fetch {:keys [id name] :as node} depth budget]
  (cond
    (not (:children node))
    {:id id :name name :children []}

    (or (zero? depth) (not (pos? @budget)))
    {:id id :name name :children [] :truncated (tree-marker nil name id)}

    :else
    (let [children (fetch id)
          allowed  (min tree-child-cap @budget)
          included (vec (take allowed children))
          _        (swap! budget - (count included))
          expanded (mapv #(expand-tree-node fetch % (dec depth) budget) included)
          more     (- (count children) (count included))]
      (cond-> {:id id :name name :children expanded}
        (pos? more) (assoc :truncated
                           ;; cap-bound (budget left room) → items pagination; budget-bound → tree
                           (if (<= tree-child-cap allowed)
                             (cap-marker more name id (count included))
                             (tree-marker more name id)))))))

(defn- tree-child-fetch
  "A `fetch` for [[expand-tree-node]] backed by a single query: the visible, non-archived
   collections of `namespaces` grouped by direct-parent id (root-level under `::root`), each an
   expandable tree node in `select-collections` order. Replaces the former per-node fetch — one
   permission-filtered query for the whole tree instead of one per expanded node."
  [namespaces]
  (let [colls   (collections.children/select-collections
                 {:archived                       false
                  :exclude-other-user-collections false
                  :namespaces                     namespaces
                  :shallow                        false
                  :include-library?               false})
        grouped (group-by #(or (last (collection/location-path->ids (:location %))) ::root) colls)]
    (fn [id]
      (mapv (fn [c] {:id (:id c) :name (:name c) :children (contains? grouped (:id c))})
            (grouped (if (number? id) id ::root))))))

(defn- collection-tree-content
  [args {:keys [root? collection]}]
  (when (collection/is-trash? collection)
    (common/throw-teaching-error
     "The trash never appears in tree mode — use mode: \"items\" to list trashed items."))
  (when (:archived collection)
    (common/throw-teaching-error
     (format "Collection %s is archived — archived subtrees never appear in tree mode; browse its items instead."
             (:id collection))))
  (let [depth      (or (:depth args) tree-default-depth)
        ns-str     (some-> (:namespace collection) u/qualified-name)
        fetch      (tree-child-fetch #{ns-str})
        budget     (atom tree-node-budget)
        root-node  {:id       (if root? "root" (:id collection))
                    :name     (if root?
                                (:name (collection/root-collection-with-ui-details ns-str))
                                (:name collection))
                    :children true}]
    (common/success-content (json/encode (expand-tree-node fetch root-node depth budget)))))

;;; --------------------------------------------- browse_collection tool -------------------------------------------

(def ^:private browse-collection-args-schema
  [:map {:closed true}
   [:id [:or
         [:int {:description "Numeric collection id."}]
         [:string {:min 1 :description "A 21-character entity_id, \"root\" (the per-namespace root), or \"trash\" (items mode only — archived content, making restore discoverable)."}]]]
   [:mode {:optional true}
    [:maybe [:enum {:description "items (default) lists the collection's contents; tree returns the nested subcollection structure (collections only, no items, no pagination)."}
             "items" "tree"]]]
   [:namespace {:optional true}
    [:maybe [:enum {:description "Which collection partition to browse; only meaningful with id: \"root\" (a real collection id already carries its namespace). content (default) holds questions/dashboards/etc.; snippets holds snippet folders and snippets; transforms holds transform folders and transforms; analytics is the read-only usage-analytics tree."}
             "content" "snippets" "transforms" "analytics"]]]
   [:type {:optional true}
    [:maybe [:sequential [:enum {:description "items mode, content namespace only: return only these item types."}
                          "question" "model" "metric" "dashboard" "collection" "document"]]]]
   [:created_by {:optional true}
    [:maybe [:enum {:description "items mode: me restricts results to items the current user created (questions, models, metrics, dashboards, documents — other types return nothing under this filter). Composes with type."}
             "me"]]]
   [:pinned_state {:optional true}
    [:maybe [:enum {:description "items mode: all (default) interleaves pinned and unpinned rows. Pinned-first as in the product is two calls — is_pinned, then is_not_pinned — each paging independently."}
             "all" "is_pinned" "is_not_pinned"]]]
   [:sort_column {:optional true}
    [:maybe [:enum {:description "items mode: sort key (default name)."} "name" "last_edited_at" "model"]]]
   [:sort_direction {:optional true}
    [:maybe [:enum {:description "items mode: sort direction (default asc)."} "asc" "desc"]]]
   [:limit {:optional true}
    [:maybe [:int {:min 1 :max 500 :description "items mode: maximum rows to return (default 50)."}]]]
   [:offset {:optional true}
    [:maybe [:int {:min 0 :description "items mode: rows to skip, for paging."}]]]
   [:depth {:optional true}
    [:maybe [:int {:min 1 :max 10 :description "tree mode: subcollection levels to expand (default 2). Deeper or trimmed nodes carry a truncation marker naming the re-rooting call."}]]]
   [:response_format {:optional true}
    [:maybe [:enum {:description "items mode: concise (default) returns {id, name, model, description, collection_position} rows; detailed adds entity_id, collection_id, archived, location, and last-edit info."}
             "concise" "detailed"]]]
   [:fields {:optional true}
    [:maybe [:sequential [:string {:min 1 :description "items mode: dot-paths picked from the detailed row shape, item-relative (e.g. \"last-edit-info.email\"). Mutually exclusive with response_format."}]]]]])

(registry/deftool browse-collection
  "Browse collections structurally — one uniform id over every partition: a numeric id, a 21-char entity_id, \"root\" (re-rooted per namespace), or \"trash\" (archived content, items mode only). items mode (default) lists one collection's contents with type/created_by/pinned_state/sort_column/sort_direction and limit/offset paging in the {data, returned, total} envelope; browsing the trash or an archived collection returns archived children. tree mode returns the nested subcollection structure (collections only, no items, no pagination) down to depth (default 2) under a per-node child cap and total node budget; trimmed or deeper nodes carry a marker naming the expansion call, e.g. … 14 more under \"Finance\" — browse_collection(id: 45, mode: \"tree\"); archived subtrees and the trash never appear in trees. For content search or recents use the search tool."
  {:name        "browse_collection"
   :scope       metabot.scope/agent-resource-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        browse-collection-args-schema}
  [{:keys [mode] :as args} _context]
  (validate-browse-collection-args! args)
  (let [target (resolve-browse-target args)]
    (if (= mode "tree")
      (collection-tree-content args target)
      (collection-items-content args target))))
