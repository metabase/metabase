(ns metabase.mcp.v2.tools.browse
  "The v2 MCP `browse_data` tool: one tool for the data hierarchy, dispatched on an explicit
   `action` enum. The `list_*` actions page server-side over the full permission-filtered sets
   (the backing endpoints have no paging); `get_fields` rides the batched, sandbox-aware
   table-metadata fetch and applies a byte budget — whole tables in request order, the rest
   named under `omitted`, never a silently truncated table."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.parameters.field-values :as params.field-values]
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
  "Read-check `database-id`, collapsing \"doesn't exist\" and \"not readable\" into the shared
   not-found teaching error."
  [database-id]
  (try
    (api/read-check (t2/select-one :model/Database :id database-id))
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
  "Slice `rows` (the full filtered set) per `limit`/`offset` and build the envelope content,
   with a truncation line naming `param` when one narrows this action (and a bare
   continuation offset otherwise). `project-fn` runs on the page only."
  [args rows param project-fn]
  (let [{:keys [limit offset]} (page-args args)
        total    (count rows)
        page     (into [] (comp (drop offset) (take limit)) rows)
        envelope (common/list-envelope (project-fn page) total)
        line     (when (< (+ offset (count page)) total)
                   (if param
                     (common/truncation-line {:param param :offset offset :limit limit :total total})
                     (format "Returned %d of %d — continue with `offset: %d`."
                             (count page) total (+ offset limit))))]
    (common/success-content (cond-> (json/encode envelope)
                              line (str "\n" line)))))

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

(defn- list-databases
  [args]
  (let [dbs (->> (t2/select database-select-columns :is_audit false {:order-by [[:%lower.name :asc]]})
                 (filterv mi/can-read?))]
    (paged-list-content args dbs nil #(project-rows :database args %))))

(defn- list-schemas
  [{:keys [database_id include_hidden] :as args}]
  (check-database! database_id)
  (let [schemas (vec (schema.table/database-schemas database_id {:include-hidden? include_hidden}))]
    (paged-list-content args schemas nil identity)))

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
    (paged-list-content args filtered :search #(project-rows :table args %))))

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
    (paged-list-content args models nil #(project-rows :question args %))))

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
  (when (empty? table_ids)
    (common/throw-teaching-error "`table_ids` must name at least one table."))
  (when (> (count table_ids) max-table-ids)
    (common/throw-teaching-error
     (format "`table_ids` accepts at most %d ids per call — you passed %d; split the request."
             max-table-ids (count table_ids))))
  (when (and offset (> (count table_ids) 1))
    (common/throw-teaching-error
     "`offset` with get_fields pages the fields of one large table — request that table alone."))
  (let [table-ids (into [] (distinct) table_ids)
        {:keys [rows missing]} (fetch-table-metadata-rows table-ids (true? include_hidden))
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
                              message (str "\n" message)))))

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
