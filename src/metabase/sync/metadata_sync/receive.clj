(ns metabase.sync.metadata-sync.receive
  "The receiver's side of a seed: the request to send to the other Metabase, and how its answer is applied.

  A seed is a loop that something outside Metabase runs, since no Metabase calls another: build a request with
  [[request]], send it to the other Metabase's `POST /api/warehouse/metadata/changes`, and give the answer to
  [[apply-response!]], again with the answer's `next` while it has one.

  A seed only adds. It inserts the Tables the receiver does not have, with their Fields, and fills FK targets, row
  counts and field values that are empty. It never changes or removes a row, so a Table the receiver has, active or
  not, keeps what it has, and the receiver's own sync corrects it later.

  Answers hold warehouse metadata, and field values are rows of the customer's tables, so nothing here logs them."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.change-log.core :as change-log]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.search.core :as search]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.humanization :as humanization]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Request ------------------------------------------------

(defn- receiving-database
  "The Database with `database-id`, when a seed may write it. Throws for no such Database, a stub Database, or the
  audit Database, which describes this Metabase's own app DB."
  [database-id]
  (let [database (sync.db/database database-id)]
    (cond
      (nil? database)
      (throw (ex-info (tru "There is no Database with id {0}." database-id)
                      {:status-code 404 :error-code "metadata-sync-no-database"}))

      (or (:is_stub database) (:is_audit database))
      (throw (ex-info (tru "The Database {0} does not take metadata from another Metabase." (pr-str (:name database)))
                      {:status-code 400 :error-code "metadata-sync-database-not-loadable"}))

      :else
      database)))

(defn- schema-filters
  "The schema filters of the Database with `database-id`, as a request sends them, or nil when it has none."
  [database-id]
  (let [[inclusion exclusion] (driver.s/db-details->schema-filter-patterns (driver.u/lib-database database-id))]
    (cond
      (not (str/blank? inclusion)) {:type "inclusion" :patterns inclusion}
      (not (str/blank? exclusion)) {:type "exclusion" :patterns exclusion})))

(mu/defn request :- ::wire/request
  "The request to send to the other Metabase for the metadata of the Database with `database-id`, from the cursor
  `after`, or from the start when it is nil. It names the Database by name and engine, with its schema filters."
  [database-id :- ::lib.schema.id/database
   after       :- [:maybe ::pages/cursor]]
  (let [database (receiving-database database-id)]
    (u/remove-nils
     {:database       (:name database)
      :engine         (u/qualified-name (:engine database))
      :schema_filters (schema-filters database-id)
      :after          after})))

;;; ------------------------------------------------ Values ------------------------------------------------

(def ^:private keyword-columns
  "The columns whose values an entry holds as strings and the app DB models expect as keywords."
  #{:base_type :effective_type :coercion_strategy :semantic_type :visibility_type :has_field_values
    :data_sensitivity :entity_type :data_layer :data_source :data_authority :field_order})

(defn- row-value
  "The value of `column` in the entry `entry`, as the app DB models expect it."
  [entry column]
  (let [value (get entry column)]
    (cond
      (nil? value)              nil
      (keyword-columns column)  (keyword value)
      (= column :last_analyzed) (u.date/parse value)
      :else                     value)))

(defn- table-defaults
  "The values a new Table named `table-name` gets when the entry has none: nil for any column not here."
  [table-name]
  {:display_name            (humanization/name->human-readable-name table-name)
   :show_in_getting_started false
   :field_order             :database
   :data_layer              :internal
   :data_authority          :unconfigured})

(defn- field-defaults
  "The values a new Field named `field-name` with `base-type` gets when the entry has none: nil for any column not
  here. Without a coercion, `effective_type` is the base type."
  [field-name base-type]
  {:display_name               (humanization/name->human-readable-name field-name)
   :effective_type             base-type
   :visibility_type            :normal
   :preview_display            true
   :json_unfolding             false
   :custom_position            0
   :position                   0
   :database_position          0
   :fingerprint_version        0
   :database_is_auto_increment false
   :database_required          false})

(defn- values-of
  "The value of each of `columns` in `entry`, or its default in `defaults` when the entry has none."
  [columns entry defaults]
  (into {}
        (map (fn [column]
               (let [value (row-value entry column)]
                 [column (if (some? value) value (get defaults column))])))
        columns))

;;; ------------------------------------------------ Lookups ------------------------------------------------

(defn- unique-key
  "The key of a Table as the unique index on Tables compares it: a nil schema is the empty schema."
  [{table-schema :schema table-name :name}]
  [(or table-schema "") table-name])

(defn- tables-by-key
  "The Tables of the Database with `database-id` that have one of the `table-keys`, by [[unique-key]], active or not,
  looked up [[pages/query-batch-size]] names at a time: the one with the lowest id when there are several. With
  `:active-only?`, only active ones."
  [database-id table-keys & {:keys [active-only?]}]
  (let [wanted (into #{} (map (fn [[table-schema table-name]] (unique-key {:schema table-schema :name table-name})))
                     table-keys)]
    (->> (pages/in-batches #(sync.db/tables-named database-id %) (distinct (map second table-keys)))
         (filter (comp wanted unique-key))
         (filter #(or (not active-only?) (:active %)))
         (sort-by :id)
         reverse
         (into {} (map (juxt unique-key identity))))))

(defn- field-index
  "The Fields of `fields` by Table id, each as a function of a name to its Field. A name that has no exact match
  matches case-insensitively, as sync does."
  [fields]
  (update-vals (group-by :table_id fields)
               (fn [table-fields]
                 (let [exact (m/index-by :name table-fields)
                       lower (m/index-by (comp u/lower-case-en :name) table-fields)]
                   (fn [field-name]
                     (or (exact field-name) (lower (u/lower-case-en field-name))))))))

(defn- resolve-field
  "The receiver's Field for the one-name `path` in the Table with `table-id`, or nil."
  [fields-by-table table-id [field-name & more]]
  (when (and table-id (nil? more))
    (when-let [lookup (fields-by-table table-id)]
      (lookup field-name))))

;;; ------------------------------------------------ Batches ------------------------------------------------

(def ^:private no-counts
  {:database_updated      0
   :tables_inserted       0
   :tables_existing       0
   :fields_inserted       0
   :fks_set               0
   :row_counts_set        0
   :field_values_inserted 0})

(defn- apply-database!
  "Set the database values of `batch` that the Database `database` has none of."
  [database batch]
  (let [changes (into {}
                      (filter (fn [[column value]] (and (some? value) (nil? (get database column)))))
                      (select-keys batch wire/database-columns))]
    (when (seq changes)
      (sync.db/update-database! (:id database) changes))
    {:database_updated (if (seq changes) 1 0)}))

(defn- table-row
  "The row of the Table that `entry` describes, in the Database with `database-id`. The Table counts as synced at
  once, since it has its metadata. A multi-row insert writes NULL for a column that a row leaves out, so the row has
  every column."
  [database-id entry]
  (merge (values-of (remove #{:schema :name} tables/table-columns) entry (table-defaults (:name entry)))
         {:db_id               database-id
          :schema              (:schema entry)
          :name                (:name entry)
          :active              true
          :initial_sync_status "complete"}))

(defn- field-row
  "The row of the Field that `field-entry` describes, in the Table with `table-id`, under the Field with `parent-id`
  or at the top. A multi-row insert writes NULL for a column that a row leaves out, so the row has every column."
  [table-id parent-id {:keys [path] :as field-entry}]
  (let [field-name (peek path)
        row        (values-of tables/field-columns
                              field-entry
                              (field-defaults field-name (row-value field-entry :base_type)))]
    (cond-> (assoc row :table_id table-id :parent_id parent-id :name field-name :active true)
      ;; Without a coercion, the effective type is the base type, as the Field model makes it.
      (nil? (:coercion_strategy row)) (assoc :effective_type (:base_type row)))))

(defn- field-ids-by-key
  "The ids of the Fields of the Tables with `table-ids`, by `[table-id parent-id name]`."
  [table-ids]
  (into {}
        (map (juxt (juxt :table_id :parent_id :name) :id))
        (pages/in-batches sync.db/field-keys-of-tables table-ids)))

(defn- insert-fields!
  "Insert the Fields of the entries of `tables`, each `[table-id entry]`, one level of nesting at a time, so that a
  parent has its id before its children are inserted. Returns how many it inserted."
  [tables]
  (let [levels (->> (for [[table-id entry] tables
                          field-entry      (:fields entry)]
                      [table-id (update field-entry :path vec)])
                    (group-by (comp count :path second))
                    (sort-by key)
                    (map val))]
    (loop [[level & deeper] levels, ids {}, inserted 0]
      (if-not level
        inserted
        (let [rows (for [[table-id {:keys [path] :as field-entry}] level]
                     (field-row table-id (ids [table-id (pop path)]) field-entry))]
          (doseq [batch (partition-all pages/query-batch-size rows)]
            (sync.db/insert-field-rows! (vec batch)))
          (recur deeper
                 ;; Only a deeper level needs the ids of this one.
                 (if (seq deeper)
                   (let [by-key (field-ids-by-key (mapv first tables))]
                     (into ids (for [[table-id {:keys [path]}] level]
                                 [[table-id path] (by-key [table-id (ids [table-id (pop path)]) (peek path)])])))
                   ids)
                 (+ inserted (count rows))))))))

(defn- after-insert!
  "Do for the new `tables` of the Database with `database-id`, all at once, what the Table and Field models' insert
  hooks do for each row: the default permissions, the change log, the dependency jobs and the search index."
  [database-id tables]
  (table/set-new-tables-permissions! database-id tables)
  (doseq [batch (partition-all pages/query-batch-size (map :id tables))]
    (change-log/log-rows! :model/Table :insert :id [:in batch])
    (change-log/log-rows! :model/Field :insert :table_id [:in batch]))
  (run! #(dependencies.hooks/before-insert :model/Table %) tables)
  (search/bulk-update! tables))

(defn- apply-tables!
  "Insert each Table of `batch` that the Database with `database-id` has no row for, active or not, once for each key,
  with its Fields. They are inserted a batch of rows at a time, not through the models, and [[after-insert!]] does
  what the models' hooks would."
  [database-id {:keys [tables]}]
  (let [existing    (tables-by-key database-id (map pages/table-key tables))
        new-entries (m/distinct-by unique-key (remove (comp existing unique-key) tables))]
    (doseq [batch (partition-all pages/query-batch-size new-entries)]
      (sync.db/insert-table-rows! (mapv #(table-row database-id %) batch)))
    (let [inserted (tables-by-key database-id (map pages/table-key new-entries))
          fields   (insert-fields! (mapv (juxt (comp :id inserted unique-key) identity) new-entries))]
      (when (seq inserted)
        (after-insert! database-id (vals inserted)))
      {:tables_inserted (count new-entries)
       :tables_existing (count (filter (comp existing unique-key) tables))
       :fields_inserted fields})))

(defn- target-key [{{table-schema :schema table-name :table} :target}]
  [table-schema table-name])

(defn- fk-changes
  "The FK targets, by Field id, that the links of `batch` set: for a Field whose FK target is empty, when the receiver
  has both the Field and its target. A link it cannot resolve is skipped and logged."
  [database-id {:keys [tables]}]
  (let [fk-tables (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        targets   (tables-by-key database-id (into [] (comp (mapcat :links) (map target-key)) tables)
                                 :active-only? true)
        fields    (pages/in-batches sync.db/link-fields-of-tables
                                    (vec (distinct (map :id (concat (vals fk-tables) (vals targets))))))
        by-table  (field-index fields)]
    (into {}
          (for [{:keys [links] :as links-table} tables
                :let  [table-id (:id (fk-tables (unique-key links-table)))]
                :when table-id
                {:keys [field target]} links
                :let  [fk-field     (resolve-field by-table table-id field)
                       target-field (resolve-field by-table
                                                   (:id (targets (unique-key {:schema (:schema target)
                                                                              :name   (:table target)})))
                                                   (:field target))]
                :when (or (and fk-field target-field)
                          (log/warnf "Skipping an FK link of Table %d: this Metabase does not have %s"
                                     table-id (if fk-field "its target" "its Field")))
                :when (nil? (:fk_target_field_id fk-field))]
            [(:id fk-field) (:id target-field)]))))

(defn- apply-links!
  "Set the FK targets that the links of `batch` give and that are empty, one Field at a time through the model, as
  sync does."
  [database-id batch]
  (let [changes (fk-changes database-id batch)]
    (doseq [[field-id target-id] changes]
      (sync.db/update-field! field-id {:fk_target_field_id target-id}))
    {:fks_set (count changes)}))

(defn- apply-table-stats!
  "Set the row count of `table` when it is empty, and insert a `:full` FieldValues row, through the model, for each
  Field of the stats `entry` that has no FieldValues row of any type: the model's hooks would delete the others.
  Returns the counts."
  [{table-id :id :as table} {:keys [estimated_row_count field_values]} by-table has-values]
  (let [row-count? (and (some? estimated_row_count) (nil? (:estimated_row_count table)))
        inserted   (into []
                         (keep (fn [{:keys [field values has_more_values]}]
                                 (when-let [{field-id :id} (resolve-field by-table table-id field)]
                                   (when-not (has-values field-id)
                                     (sync.db/insert-full-field-values! field-id {:values          values
                                                                                  :has_more_values has_more_values})))))
                         field_values)]
    (when row-count?
      (sync.db/update-table! table-id {:estimated_row_count estimated_row_count}))
    {:row_counts_set        (if row-count? 1 0)
     :field_values_inserted (count inserted)}))

(defn- apply-stats!
  "Apply the stats of `batch` to the active Tables of the Database with `database-id` that have its keys."
  [database-id {:keys [tables]}]
  (let [receiving  (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        table-ids  (mapv :id (vals receiving))
        by-table   (field-index (pages/in-batches sync.db/link-fields-of-tables table-ids))
        has-values (into #{} (mapcat sync.db/field-ids-with-field-values)
                         (partition-all pages/query-batch-size table-ids))]
    (transduce (keep (fn [entry]
                       (when-let [table (receiving (unique-key entry))]
                         (apply-table-stats! table entry by-table has-values))))
               (completing (partial merge-with +))
               {:row_counts_set 0 :field_values_inserted 0}
               tables)))

;;; ------------------------------------------------ Response ------------------------------------------------

(def ^:private known-batch-types
  "The batch types this version applies."
  #{"database" "tables" "links" "stats"})

(defn- refused [message error-code]
  (ex-info message {:status-code 422 :error-code error-code}))

(defn- broken-field-paths?
  "Whether the Fields of the Table entry `table` have a path twice, or a nested Field whose parent is not there."
  [table]
  (let [paths (mapv (comp vec :path) (:fields table))
        known (set paths)]
    (or (not= (count paths) (count known))
        (some #(and (next %) (not (known (pop %)))) paths))))

(defn- check-response!
  "Throw unless `response` is an answer this version can apply: of its format version, with batch types it knows, and
  of the right shape, with each nested Field's parent in its Table's entry. The error says nothing of the answer's values: they are warehouse metadata."
  [response]
  (when (not= wire/format-version (:format_version response))
    (throw (refused (tru "The other Metabase sends format version {0}, and this Metabase reads version {1}."
                         (pr-str (:format_version response)) wire/format-version)
                    "metadata-sync-format-version-differs")))
  (when-let [unknown (seq (into (sorted-set)
                                (comp (filter map?) (keep :type) (remove known-batch-types) (map str))
                                (when (sequential? (:batches response)) (:batches response))))]
    (throw (refused (tru "The other Metabase sent a batch of type {0}, which this version does not know."
                         (str/join ", " unknown))
                    "metadata-sync-unknown-batch-type")))
  (when-not (and (mr/validate ::wire/response response)
                 (not-any? broken-field-paths? (for [{batch-type :type :keys [tables]} (:batches response)
                                                     :when (= "tables" batch-type)
                                                     table tables]
                                                 table)))
    (throw (refused (tru "The answer of the other Metabase does not have the shape this version applies.")
                    "metadata-sync-malformed-response"))))

(defn- apply-batch!
  "Apply one `batch` to the Database `database`, and return the counts."
  [database batch]
  (merge no-counts
         (case (:type batch)
           "database" (apply-database! database batch)
           "tables"   (apply-tables! (:id database) batch)
           "links"    (apply-links! (:id database) batch)
           "stats"    (apply-stats! (:id database) batch))))

(defn- apply-batches!
  "Apply the `batches` of an answer to the Database `database` in one transaction, and return the summed counts. A
  write that fails rolls back the whole answer, and is refused with a code of its own and a message with none of the
  answer's values; the cause stays on the exception."
  [database batches]
  (try
    (t2/with-transaction [_conn]
      (dependencies.hooks/with-batched-marks
        (reduce (fn [counts batch] (merge-with + counts (apply-batch! database batch))) no-counts batches)))
    (catch Throwable e
      (throw (ex-info (tru "The answer of the other Metabase could not be applied, and nothing of it was written.")
                      {:status-code 422 :error-code "metadata-sync-apply-failed"}
                      e)))))

(mr/def ::counts
  "What an apply did. The keys are snake_case: the counts are part of an API response."
  [:map {:closed true}
   [:database_updated      :int]
   [:tables_inserted       :int]
   [:tables_existing       :int]
   [:fields_inserted       :int]
   [:fks_set               :int]
   [:row_counts_set        :int]
   [:field_values_inserted :int]])

(mr/def ::result
  [:map {:closed true}
   [:next   {:optional true} [:maybe ::pages/cursor]]
   [:counts ::counts]])

(mu/defn apply-response! :- ::result
  "Apply the other Metabase's `response` to a [[request]] for the Database with `database-id`, and return the cursor of
  the next request (`:next`), when there is one, and counts of what it did.

  Before any write it refuses, with an `:error-code` in the ex-data, an answer of another format version, one with a
  batch type it does not know, and a malformed one. An answer is applied in one transaction, so one that fails while
  it is written writes nothing (`metadata-sync-apply-failed`), and can be sent again. Each Table a seed inserts counts
  as synced at once; once an answer has no next cursor, the Database counts as synced too. An answer with no batches
  and no cursor therefore marks the Database as synced, also when it has no Tables.

  A seed and a sync of the same Database must not run at the same time: both insert Tables, and the unique index on
  Tables refuses the second insert of one key. A seed's answer that fails that way can be sent again."
  [database-id :- ::lib.schema.id/database
   response    :- [:map {::mr/deliberately-open true
                         :description           "the other Metabase's answer, decoded from JSON, which this checks"}]]
  (let [database (receiving-database database-id)]
    (check-response! response)
    (let [counts (apply-batches! database (:batches response))]
      (when-not (:next response)
        (sync-util/set-initial-table-sync-complete-for-db! database)
        (sync-util/set-initial-database-sync-complete! database))
      (cond-> {:counts counts}
        (:next response) (assoc :next (:next response))))))
