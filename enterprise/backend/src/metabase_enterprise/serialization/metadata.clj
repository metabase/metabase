(ns metabase-enterprise.serialization.metadata
  "Reducible queries and row formatters that produce serdes-portable warehouse metadata
  (databases, tables, and fields) for the `/api/ee/serialization/metadata/export` endpoint,
  plus the staging-table-based ingest used by `/api/ee/serialization/metadata/import`.
  All references — database, table, fk_target_field — are emitted as portable references
  (names rather than numeric IDs) so the response can be ingested by another Metabase
  instance with different surrogate keys."
  (:require
   [honey.sql :as sql]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- perm-user-info
  "Current-user info passed to `perms/visible-*-filter-select` to scope the visibility filters."
  []
  {:user-id       api/*current-user-id*
   :is-superuser? api/*is-superuser?*})

(defn- perm-mapping
  "Permission mapping required to include a database/table in the export."
  []
  {:perms/view-data      :unrestricted
   :perms/create-queries :query-builder})

(defn- visible-db-where
  "Honeysql predicate selecting non-audit, non-router databases visible to the current user.
  `d` is the table alias of the joined `metabase_database`."
  [d]
  [:and
   [:= (u/qualified-key d :is_audit) false]
   [:= (u/qualified-key d :router_database_id) nil]
   [:in (u/qualified-key d :id) (perms/visible-database-filter-select (perm-user-info) (perm-mapping))]])

(defn- visible-table-where
  "Honeysql predicate selecting active, non-hidden tables visible to the current user.
  `t` is the table alias of the joined `metabase_table`."
  [t]
  [:and
   [:= (u/qualified-key t :active) true]
   [:= (u/qualified-key t :visibility_type) nil]
   [:in (u/qualified-key t :id) (perms/visible-table-filter-select :id (perm-user-info) (perm-mapping))]])

(defn- visible-field-where
  "Honeysql predicate selecting active, non-sensitive fields. `f` is the table alias of the
  joined `metabase_field`."
  [f]
  [:and
   [:= (u/qualified-key f :active) true]
   [:<> (u/qualified-key f :visibility_type) "sensitive"]])

(defn- reducible-databases-query
  "Raw reducible-query streaming visible-database rows for [[reducible-databases]]."
  []
  (t2/reducible-query {:select [[:db.name :name] [:db.engine :engine]]
                       :from   [[:metabase_database :db]]
                       :where  (visible-db-where :db)}))

(defn- reducible-tables-query
  "Raw reducible-query streaming visible-table rows for [[reducible-tables]]."
  []
  (t2/reducible-query {:select [[:db.name :db_name]
                                [:table.schema :schema]
                                [:table.name :table_name]
                                [:table.description :description]]
                       :from   [[:metabase_table :table]]
                       :join   [[:metabase_database :db] [:= :table.db_id :db.id]]
                       :where  [:and (visible-db-where :db) (visible-table-where :table)]}))

(defn- reducible-fields-query
  "Raw reducible-query streaming visible-field rows for [[reducible-fields]]. Visibility
  filters on the FK target chain are folded into the LEFT JOIN ON clauses (rather than the
  WHERE) so that an inaccessible target fails the join and the `fk_*` columns come back as
  NULL — [[format-field-row]] then drops the `:fk_target_field_id` for that row."
  []
  (t2/reducible-query
   {:select    [[:db.name :db_name]
                [:table.schema :table_schema]
                [:table.name :table_name]
                [:field.name :field_name]
                [:field.description :description]
                [:field.base_type :base_type]
                [:field.database_type :database_type]
                [:field.effective_type :effective_type]
                [:field.semantic_type :semantic_type]
                [:field.coercion_strategy :coercion_strategy]
                [:field.nfc_path :nfc_path]
                [:fk_db.name :fk_db_name]
                [:fk_table.schema :fk_table_schema]
                [:fk_table.name :fk_table_name]
                [:fk_field.name :fk_field_name]
                [:fk_field.nfc_path :fk_field_nfc_path]]
    :from      [[:metabase_field :field]]
    :join      [[:metabase_table :table]    [:= :field.table_id :table.id]
                [:metabase_database :db]    [:= :table.db_id :db.id]]
    :left-join [[:metabase_field :fk_field]    [:and [:= :field.fk_target_field_id :fk_field.id] (visible-field-where :fk_field)]
                [:metabase_table :fk_table]    [:and [:= :fk_field.table_id :fk_table.id]        (visible-table-where :fk_table)]
                [:metabase_database :fk_db]    [:and [:= :fk_table.db_id :fk_db.id]              (visible-db-where :fk_db)]]
    :where     [:and (visible-db-where :db) (visible-table-where :table) (visible-field-where :field)]}))

(defn- decode-nfc-path
  "JSON-decode an `nfc_path` value pulled via raw query (no model transform). Returns nil for
  null/empty, the original value when it's already a sequential collection, or the decoded
  vector when it's a JSON string."
  [nfc-path]
  (cond
    (nil? nfc-path)        nil
    (sequential? nfc-path) (seq nfc-path)
    (string? nfc-path)     (seq (json/decode nfc-path))))

(defn- external-database-id
  "Portable id for a database — its name."
  [db-name]
  db-name)

(defn- external-table-id
  "Portable id for a table — `[db-name schema table-name]` (schema may be nil)."
  [db-name schema table-name]
  [db-name schema table-name])

(defn- external-field-id
  "Portable id for a field. When `nfc-path` is set (JSON-nested column), the path replaces
  the field's display name; the field's own name is the leaf of `nfc-path` joined with
  arrows, so the path is the canonical structural representation."
  [db-name schema table-name field-name nfc-path]
  (if (seq nfc-path)
    (into [db-name schema table-name] nfc-path)
    [db-name schema table-name field-name]))

(defn format-database-row
  "JSON shape for one database row, identifying the database by its portable id."
  [{:keys [name engine]}]
  {:id (external-database-id name) :name name :engine engine})

(defn format-table-row
  "JSON shape for one table row, with portable references for `:id` and `:db_id`. Optional
  fields are omitted when nil."
  [{:keys [db_name schema table_name description]}]
  (m/assoc-some {:id    (external-table-id db_name schema table_name)
                 :db_id (external-database-id db_name)
                 :name  table_name}
                :schema schema
                :description description))

(defn format-field-row
  "JSON shape for one field row, with portable references for `:id`, `:table_id`, `:parent_id`,
  and `:fk_target_field_id`. `:parent_id` is derived from `nfc_path` (the portable id with the
  last path element dropped) and is only emitted when `nfc_path` has at least two elements.
  Optional fields are omitted when nil."
  [{:keys [db_name table_schema table_name field_name description base_type database_type
           effective_type semantic_type coercion_strategy nfc_path
           fk_db_name fk_table_schema fk_table_name fk_field_name fk_field_nfc_path]}]
  (let [nfc-path     (decode-nfc-path nfc_path)
        parent-id    (when-some [parent-nfc (seq (butlast nfc-path))]
                       (external-field-id db_name table_schema table_name nil parent-nfc))
        fk-field-nfc (decode-nfc-path fk_field_nfc_path)
        fk-target-id (when (and fk_db_name fk_table_name fk_field_name)
                       (external-field-id fk_db_name fk_table_schema fk_table_name
                                          fk_field_name fk-field-nfc))]
    (m/assoc-some {:id       (external-field-id db_name table_schema table_name field_name nfc-path)
                   :table_id (external-table-id db_name table_schema table_name)
                   :name     field_name}
                  :description description
                  :base_type base_type
                  :database_type database_type
                  :effective_type (when (and effective_type (not= base_type effective_type)) effective_type)
                  :semantic_type semantic_type
                  :coercion_strategy coercion_strategy
                  :nfc_path nfc-path
                  :parent_id parent-id
                  :fk_target_field_id fk-target-id)))

(defn reducible-databases
  "Eduction streaming visible databases as already-formatted JSON-shaped rows."
  []
  (eduction (map format-database-row) (reducible-databases-query)))

(defn reducible-tables
  "Eduction streaming visible tables as already-formatted JSON-shaped rows."
  []
  (eduction (map format-table-row) (reducible-tables-query)))

(defn reducible-fields
  "Eduction streaming visible fields as already-formatted JSON-shaped rows."
  []
  (eduction (map format-field-row) (reducible-fields-query)))

;;; ============================ /api/ee/serialization/metadata/import ============================
;;;
;;; Streaming-friendly ingest. The import endpoint hands each section's JSON-array
;;; row stream to one of the `ingest-*!` fns below, which write rows into per-section
;;; TEMPORARY staging tables in batched INSERTs. Once all sections are drained,
;;; the `merge-*!` fns resolve portable references via JOINs and apply the changes
;;; to the live tables with a split insert/update — mostly-unchanged re-imports
;;; pay the scan cost once instead of `ON CONFLICT`'s per-row probe + heap rewrite.

;;; -------------------------------------- staging tables --------------------------------------
;;;
;;; Staging tables are permanent (defined in
;;; `resources/migrations/062/20260504_metadata_import_staging.yaml`) but only
;;; used during the import transaction. The endpoint truncates them on entry
;;; and exit so a crashed import can't leak rows into the next run, and a
;;; concurrent import inside the same transaction simply isn't supported (the
;;; second one would clobber the first's staging rows). The whole flow runs
;;; inside `t2/with-transaction`, so the truncation and the merge are atomic
;;; with respect to anything outside the import.

(defn clear-staging-tables!
  "Removes any rows left in the staging tables. Called at the beginning and end
  of `with-staging-tables` so a connection that was abruptly disconnected mid-
  import cannot leave orphaned data behind for the next caller to merge."
  []
  (t2/query (sql/format {:delete-from :metabase_field_import}))
  (t2/query (sql/format {:delete-from :metabase_table_import})))

(defmacro with-staging-tables
  "Runs `body` with empty staging tables, ensuring they are also empty when we
  leave (whether `body` returned normally or threw). Caller is expected to be
  inside a `t2/with-transaction` so the merge into the live tables and the
  cleanup are atomic together."
  [& body]
  `(do (clear-staging-tables!)
       (try ~@body
            (finally (clear-staging-tables!)))))

;;; -------------------------------------- ingest --------------------------------------

(def ^:private staging-batch-size 1000)

(defn- bulk-insert!
  "Single multi-row INSERT into the given staging table. `rows` is a coll of maps
  whose keys are column names."
  [table rows]
  (when (seq rows)
    (t2/query (sql/format {:insert-into table :values (vec rows)}))))

(defn- drain-into-staging!
  "Drains a reducible of column-keyed row maps into `table` in
  [[staging-batch-size]]-sized INSERT VALUES batches. Memory at any time is
  bounded by one batch."
  [table rows]
  (transduce (partition-all staging-batch-size)
             (completing (fn [_ batch] (bulk-insert! table batch)))
             nil
             rows))

(defn- json-encode-path
  "Encodes an `nfc_path`-style vector as the JSON-text shape stored in
  `metabase_field.nfc_path`. Returns nil for empty/nil so we keep the staging
  column NULL rather than the string `\"[]\"`."
  [path]
  (when (seq path)
    (json/encode (vec path))))

(defn- ->vec
  "Coerces values that came in via Jackson — `java.util.List` from JSON arrays,
  Clojure vectors, lists, seqs — into a Clojure vector. Returns nil for nil
  and non-collection values. `sequential?` is too strict here: Jackson's
  `ObjectMapper.readValue(_, Map.class)` decodes JSON arrays as `ArrayList`,
  for which `sequential?` returns false."
  [x]
  (when (instance? java.util.List x)
    (vec x)))

(defn- decompose-fk-target
  "Splits an `fk_target_field_id` portable vector `[db schema table … leaf]` into
  staging columns. When the trailing portion is a single element it's treated
  as the target's `:name`; multi-element trailers are JSON-encoded as
  `:nfc_path`. Returns nil parts when `target` is not a vector or is too short."
  [target]
  (let [target (->vec target)]
    (if (and target (>= (count target) 4))
      (let [[db schema table & rest] target]
        {:fk_db_name        db
         :fk_table_schema   schema
         :fk_table_name     table
         :fk_field_name     (when (= 1 (count rest)) (first rest))
         :fk_field_nfc_path (when (> (count rest) 1) (json/encode (vec rest)))})
      {:fk_db_name nil :fk_table_schema nil :fk_table_name nil
       :fk_field_name nil :fk_field_nfc_path nil})))

(defn ingest-tables!
  "Drains a reducible of decoded table rows (the JSON object shape emitted by
  the export's `tables` array) into `metabase_table_import`."
  [rows]
  (drain-into-staging!
   :metabase_table_import
   (eduction (map (fn [{:strs [db_id schema name description]}]
                    {:db_name      db_id
                     :table_schema schema
                     :table_name   name
                     :description  description}))
             rows)))

(defn ingest-fields!
  "Drains a reducible of decoded field rows into `metabase_field_import`. The portable
  ids (`:id`, `:fk_target_field_id`, `:parent_id`) carry repeated identifying
  info; we store only the canonical decomposition (db/schema/table/name plus
  nfc_path) so the merge SQL can resolve everything with simple JOINs.

  `:parent_id` itself is not stored — instead we precompute `parent_nfc_path`
  (= `(butlast nfc-path)`) which is what the parent row in `metabase_field` is
  keyed on."
  [rows]
  (drain-into-staging!
   :metabase_field_import
   (eduction
    (map (fn [{:strs [id table_id name nfc_path description base_type database_type
                      effective_type semantic_type coercion_strategy fk_target_field_id]}]
           (let [_id*          id ; portable [db schema table …] — redundant with table_id + name
                 [db-name table-schema table-name] (->vec table_id)
                 nfc-vec       (->vec nfc_path)
                 parent-nfc    (when (and nfc-vec (>= (count nfc-vec) 2))
                                 (vec (butlast nfc-vec)))
                 fk-parts      (decompose-fk-target fk_target_field_id)]
             (merge {:db_name           db-name
                     :table_schema      table-schema
                     :table_name        table-name
                     :field_name        name
                     :nfc_path          (json-encode-path nfc-vec)
                     :parent_nfc_path   (json-encode-path parent-nfc)
                     :description       description
                     :base_type         base_type
                     :database_type     database_type
                     :effective_type    effective_type
                     :semantic_type     semantic_type
                     :coercion_strategy coercion_strategy}
                    fk-parts))))
    rows)))

;;; -------------------------------------- merge: tables --------------------------------------

(defn- ce
  "`COALESCE(col, '')` — used to make NULL `schema` (and similarly nullable
  columns) compare equal in the natural-key match without relying on
  `IS NOT DISTINCT FROM` (Postgres/H2) vs. `<=>` (MySQL)."
  [col]
  [:coalesce col [:inline ""]])

(defn- match-table
  "Honeysql predicate matching an `metabase_table_import` row aliased `:it` to a
  `metabase_table` row aliased `:t` (or unaliased) on (db_id, schema, name)."
  [t-alias]
  [:and
   [:= (u/qualified-key t-alias :db_id) :d.id]
   [:= (ce (u/qualified-key t-alias :schema)) (ce :it.table_schema)]
   [:= (u/qualified-key t-alias :name)  :it.table_name]])

(defn- insert-new-tables! []
  (t2/query
   (sql/format
    {:insert-into [[:metabase_table
                    [:db_id :schema :name :description :active
                     :show_in_getting_started :is_defective_duplicate
                     :created_at :updated_at]]
                   {:select [:d.id :it.table_schema :it.table_name :it.description
                             [[:inline true]] [[:inline false]] [[:inline false]]
                             [[:now]] [[:now]]]
                    :from   [[:metabase_table_import :it]]
                    :join   [[:metabase_database :d] [:= :d.name :it.db_name]]
                    :where  [:not [:exists
                                   {:select [[[:inline 1]]]
                                    :from   [[:metabase_table :t]]
                                    :where  (match-table :t)}]]}]})))

(defn- update-changed-tables! []
  (let [;; correlated subquery: the metabase_table_import row matching the current
        ;; (unaliased) metabase_table row, joined to metabase_database for db_id
        joined (fn [select-cols & [extra-where]]
                 {:select select-cols
                  :from   [[:metabase_table_import :it]]
                  :join   [[:metabase_database :d] [:= :d.name :it.db_name]]
                  :where  (let [match (match-table :metabase_table)]
                            (if extra-where [:and match extra-where] match))})]
    (t2/query
     (sql/format
      {:update :metabase_table
       :set    {:description (joined [:it.description])
                :updated_at  [[:now]]}
       :where  [:exists
                (joined [[[:inline 1]]]
                        [:not= (ce :it.description) (ce :metabase_table.description)])]}))))

(defn merge-tables!
  "After [[ingest-tables!]] has populated `metabase_table_import`, run the two-statement
  insert/update merge into `metabase_table`. New rows are inserted; existing
  rows whose `description` actually changed are updated. Other tables in the
  live schema (those not present in the import) are left alone."
  []
  (insert-new-tables!)
  (update-changed-tables!))

;;; -------------------------------------- merge: fields --------------------------------------
;;;
;;; Three phases, each a single statement:
;;;
;;;   1. INSERT new fields, with `parent_id` and `fk_target_field_id` left NULL
;;;      (we don't yet know whether the targets exist as live rows).
;;;   2. UPDATE existing fields' regular columns where any tracked column
;;;      actually differs.
;;;   3. UPDATE `parent_id` and `fk_target_field_id` for every row in
;;;      `metabase_field_import` whose target is now resolvable. Field rows from phase 1
;;;      become eligible here because phase 1 populated them.

(defn- field-row-match
  "Honeysql predicate matching `metabase_field_import` (alias `if_`) to a
  `metabase_field` row identified by alias `f-alias` (or `:metabase_field`).
  Match is on (table_id, name); the matching table_id is derived via JOIN
  through `metabase_database d` and `metabase_table t`."
  [f-alias]
  [:and
   [:= (u/qualified-key f-alias :table_id) :t.id]
   [:= (u/qualified-key f-alias :name)     :if_.field_name]])

(defn- field-resolved-base
  "Honeysql FROM/JOIN snippet that resolves `metabase_field_import` rows to their live
  `metabase_table.id`. Adds `:t.id AS table_id` to whatever `select-cols` the
  caller provides."
  [select-cols where]
  {:select select-cols
   :from   [[:metabase_field_import :if_]]
   :join   [[:metabase_database :d] [:= :d.name :if_.db_name]
            [:metabase_table :t]    [:and
                                     [:= :t.db_id :d.id]
                                     [:= (ce :t.schema) (ce :if_.table_schema)]
                                     [:= :t.name :if_.table_name]]]
   :where  where})

(defn- insert-new-fields! []
  (t2/query
   (sql/format
    {:insert-into [[:metabase_field
                    [:table_id :name :nfc_path :description :base_type :database_type
                     :effective_type :semantic_type :coercion_strategy
                     :active :preview_display :position :display_name :visibility_type
                     :is_defective_duplicate :database_position :custom_position
                     :database_required :fingerprint_version
                     :created_at :updated_at]]
                   (field-resolved-base
                    [:t.id :if_.field_name :if_.nfc_path :if_.description
                     :if_.base_type :if_.database_type :if_.effective_type
                     :if_.semantic_type :if_.coercion_strategy
                     [[:inline true]] [[:inline true]] [[:inline 0]]
                     :if_.field_name [[:inline "normal"]]
                     [[:inline false]] [[:inline 0]] [[:inline 0]]
                     [[:inline false]] [[:inline 0]]
                     [[:now]] [[:now]]]
                    [:not [:exists
                           {:select [[[:inline 1]]]
                            :from   [[:metabase_field :f]]
                            :where  (field-row-match :f)}]])]})))

(def ^:private updatable-field-cols
  "Columns we copy from staging to live `metabase_field` on each import. Keep
  in sync with what the export emits in `format-field-row`."
  [:nfc_path :description :base_type :database_type
   :effective_type :semantic_type :coercion_strategy])

(defn- staging-col [col] (keyword (str "if_." (name col))))
(defn- live-col    [col] (keyword (str "metabase_field." (name col))))

(defn- update-changed-fields-basic! []
  (let [joined
        (fn [select-cols & [extra-where]]
          (field-resolved-base
           select-cols
           (if extra-where
             [:and (field-row-match :metabase_field) extra-where]
             (field-row-match :metabase_field))))]
    (t2/query
     (sql/format
      {:update :metabase_field
       :set    (into {:updated_at [[:now]]}
                     (map (fn [c] [c (joined [(staging-col c)])]))
                     updatable-field-cols)
       :where  [:exists
                (joined [[[:inline 1]]]
                        (into [:or]
                              (map (fn [c] [:not= (ce (staging-col c)) (ce (live-col c))]))
                              updatable-field-cols))]}))))

(defn- compute-and-apply-field-id-update!
  "Computes a list of `{:child_id ... :resolved_id ...}` rows from the staging
  tables via the given resolution `query`, then applies `(UPDATE metabase_field
  SET set-col = CASE id WHEN ? THEN ? ... END WHERE id IN (...))` in batches.

  Splitting this into a SELECT + per-batch UPDATE — instead of one giant
  correlated `UPDATE ... SET col = (subquery)` — avoids the dialect minefield
  around joining the live table to itself in an UPDATE clause and lets us see
  exactly which rows we're touching."
  [set-col resolution-query]
  (let [pairs (t2/query (sql/format resolution-query))]
    (when (seq pairs)
      (doseq [batch (partition-all staging-batch-size pairs)]
        (t2/query
         (sql/format
          {:update :metabase_field
           :set    {set-col (into [:case]
                                  (mapcat (fn [{:keys [child_id resolved_id]}]
                                            [[:= :id child_id] resolved_id]))
                                  batch)}
           :where  [:in :id (mapv :child_id batch)]}))))))

(defn- update-field-parent-ids!
  "Resolve `parent_id` on rows whose `metabase_field_import.parent_nfc_path` matches a
  sibling `metabase_field.nfc_path` in the same `metabase_table`. `parent_id`
  is set only when both sides have a `parent_nfc_path` and the parent exists
  as a real `metabase_field` row."
  []
  (compute-and-apply-field-id-update!
   :parent_id
   {:select [[:f.id  :child_id]
             [:pf.id :resolved_id]]
    :from   [[:metabase_field_import :if_]]
    :join   [[:metabase_database :d] [:= :d.name :if_.db_name]
             [:metabase_table :t]    [:and
                                      [:= :t.db_id :d.id]
                                      [:= (ce :t.schema) (ce :if_.table_schema)]
                                      [:= :t.name :if_.table_name]]
             [:metabase_field :f]    [:and
                                      [:= :f.table_id :t.id]
                                      [:= :f.name     :if_.field_name]]
             [:metabase_field :pf]   [:and
                                      [:= :pf.table_id :t.id]
                                      [:= :pf.nfc_path :if_.parent_nfc_path]]]
    :where  [:not= :if_.parent_nfc_path nil]}))

(defn- update-field-fk-targets!
  "Resolve `fk_target_field_id` for fields whose `fk_*` staging columns identify
  a reachable target field. Targets identified by `:name` (no nfc_path) and by
  `:nfc_path` are both supported via the OR in the join predicate."
  []
  (compute-and-apply-field-id-update!
   :fk_target_field_id
   {:select [[:f.id  :child_id]
             [:fkf.id :resolved_id]]
    :from   [[:metabase_field_import :if_]]
    :join   [[:metabase_database :d]   [:= :d.name :if_.db_name]
             [:metabase_table :t]      [:and
                                        [:= :t.db_id :d.id]
                                        [:= (ce :t.schema) (ce :if_.table_schema)]
                                        [:= :t.name :if_.table_name]]
             [:metabase_field :f]      [:and
                                        [:= :f.table_id :t.id]
                                        [:= :f.name     :if_.field_name]]
             [:metabase_database :fkd] [:= :fkd.name :if_.fk_db_name]
             [:metabase_table :fkt]    [:and
                                        [:= :fkt.db_id :fkd.id]
                                        [:= (ce :fkt.schema) (ce :if_.fk_table_schema)]
                                        [:= :fkt.name :if_.fk_table_name]]
             [:metabase_field :fkf]    [:and
                                        [:= :fkf.table_id :fkt.id]
                                        [:or
                                         ;; non-nested target: matched by :name
                                         [:and
                                          [:= :fkf.name :if_.fk_field_name]
                                          [:= :if_.fk_field_nfc_path nil]]
                                         ;; nested target: matched by :nfc_path
                                         [:= :fkf.nfc_path :if_.fk_field_nfc_path]]]]}))

(defn merge-fields!
  "After [[ingest-fields!]] has populated `metabase_field_import`, run the field merge:

   1. INSERT new fields (with `parent_id` and `fk_target_field_id` left NULL).
   2. UPDATE the regular-column set on existing fields where it changed.
   3. UPDATE `parent_id` (resolved via `nfc_path`) on rows whose parent now exists.
   4. UPDATE `fk_target_field_id` on rows whose target now resolves through
      `metabase_database` → `metabase_table` → `metabase_field`."
  []
  (insert-new-fields!)
  (update-changed-fields-basic!)
  (update-field-parent-ids!)
  (update-field-fk-targets!))
