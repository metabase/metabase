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
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.document :as document]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.humanization :as humanization]
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
  "The columns whose values a document holds as strings and the app DB models expect as keywords."
  #{:base_type :effective_type :coercion_strategy :semantic_type :visibility_type :has_field_values
    :data_sensitivity :entity_type :data_layer :data_source :data_authority :field_order})

(defn- row-value
  "The value of `column` in the document `doc-row`, as the app DB models expect it."
  [doc-row column]
  (let [value (get doc-row column)]
    (cond
      (nil? value)              nil
      (keyword-columns column)  (keyword value)
      (= column :last_analyzed) (u.date/parse value)
      :else                     value)))

(defn- table-defaults
  "The values a new Table named `table-name` gets when the document has none: nil for any column not here."
  [table-name]
  {:display_name            (humanization/name->human-readable-name table-name)
   :show_in_getting_started false
   :field_order             :database
   :data_layer              :internal
   :data_authority          :unconfigured})

(defn- field-defaults
  "The values a new Field named `field-name` with `base-type` gets when the document has none: nil for any column not
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
  "The value of each of `columns` in `doc-row`, or its default in `defaults` when the document has none."
  [columns doc-row defaults]
  (into {}
        (map (fn [column]
               (let [value (row-value doc-row column)]
                 [column (if (some? value) value (get defaults column))])))
        columns))

;;; ------------------------------------------------ Lookups ------------------------------------------------

(defn- tables-by-key
  "The Tables of the Database with `database-id` that have one of the `table-keys`, by key, active or not, looked up
  [[document/query-batch-size]] names at a time. With `:active-only?`, only active ones, and the one with the lowest id
  when there are several."
  [database-id table-keys & {:keys [active-only?]}]
  (let [wanted (set table-keys)]
    (->> (document/in-batches #(sync.db/tables-named database-id %) (distinct (map second table-keys)))
         (filter (comp wanted document/table-key))
         (filter #(or (not active-only?) (:active %)))
         (sort-by :id)
         reverse
         (into {} (map (juxt document/table-key identity))))))

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

(defn- key-of [{table-schema :schema table-name :name}]
  [table-schema table-name])

;;; ------------------------------------------------ Batches ------------------------------------------------

(def ^:private no-counts
  {:database-updated      0
   :tables-inserted       0
   :tables-existing       0
   :fields-inserted       0
   :fks-set               0
   :row-counts-set        0
   :field-values-inserted 0})

(defn- apply-database!
  "Set the database values of `batch` that the Database `database` has none of."
  [database batch]
  (let [changes (into {}
                      (filter (fn [[column value]] (and (some? value) (nil? (get database column)))))
                      (select-keys batch document/database-columns))]
    (when (seq changes)
      (sync.db/update-database! (:id database) changes))
    {:database-updated (if (seq changes) 1 0)}))

(defn- insert-table!
  "Insert the Table that `doc` describes into the Database with `database-id`, with its Fields, and return how many
  Fields it inserted. A multi-row insert writes NULL for a column that a row leaves out, so each row has every
  column."
  [database-id doc]
  (let [table-id (:id (sync.db/insert-table! (merge {:db_id               database-id
                                                     :schema              (:schema doc)
                                                     :name                (:name doc)
                                                     :active              true
                                                     :initial_sync_status "complete"}
                                                    (u/remove-nils
                                                     (values-of (remove #{:schema :name} document/table-columns)
                                                                doc
                                                                (table-defaults (:name doc)))))))
        rows     (for [{[field-name & more] :path :as doc-field} (:fields doc)
                       :when (or (nil? more)
                                 (log/warnf "Not inserting a nested Field of Table %d" table-id))]
                   (merge (values-of document/field-columns
                                     doc-field
                                     (field-defaults field-name (row-value doc-field :base_type)))
                          {:table_id table-id :name field-name :active true}))]
    (doseq [batch (partition-all document/query-batch-size rows)]
      (sync.db/insert-fields! (vec batch)))
    (count rows)))

(defn- apply-objects!
  "Insert each Table of `batch` that the Database with `database-id` has no row for, active or not."
  [database-id {:keys [tables]}]
  (let [existing (tables-by-key database-id (map key-of tables))
        new-docs (remove (comp existing key-of) tables)]
    {:tables-inserted (count new-docs)
     :tables-existing (- (count tables) (count new-docs))
     :fields-inserted (transduce (map #(insert-table! database-id %)) + 0 new-docs)}))

(defn- target-key [{{table-schema :schema table-name :table} :target}]
  [table-schema table-name])

(defn- fk-changes
  "The FK targets, by Field id, that the links of `batch` set: for a Field whose FK target is empty, when the receiver
  has both its Field and its target. A link it cannot resolve is skipped and logged."
  [database-id {:keys [tables]}]
  (let [sources  (tables-by-key database-id (map key-of tables) :active-only? true)
        targets  (tables-by-key database-id (into [] (comp (mapcat :links) (map target-key)) tables)
                                :active-only? true)
        fields   (document/in-batches sync.db/link-fields-of-tables
                                      (vec (distinct (map :id (concat (vals sources) (vals targets))))))
        by-table (field-index fields)]
    (into {}
          (for [{:keys [links] :as links-table} tables
                :let  [source-id (:id (sources (key-of links-table)))]
                :when source-id
                {:keys [field target] :as link} links
                :let  [source-field (resolve-field by-table source-id field)
                       target-field (resolve-field by-table (:id (targets (target-key link))) (:field target))]
                :when (or (and source-field target-field)
                          (log/warnf "Skipping an FK link of Table %d: this Metabase does not have %s"
                                     source-id (if source-field "its target" "its Field")))
                :when (nil? (:fk_target_field_id source-field))]
            [(:id source-field) (:id target-field)]))))

(defn- apply-links!
  "Set the FK targets that the links of `batch` give and that are empty."
  [database-id batch]
  (let [changes (fk-changes database-id batch)]
    (doseq [[field-id target-id] changes]
      (sync.db/update-field! field-id {:fk_target_field_id target-id}))
    {:fks-set (count changes)}))

(defn- apply-table-stats!
  "Set the row count of `table` when it is empty, and insert a `:full` FieldValues row, through the model, for each
  Field of the stats `entry` that has none. Returns the counts."
  [{table-id :id :as table} {:keys [estimated_row_count field_values]} by-table has-full]
  (let [row-count? (and (some? estimated_row_count) (nil? (:estimated_row_count table)))
        inserted   (into []
                         (keep (fn [{:keys [field values has_more_values]}]
                                 (when-let [{field-id :id} (resolve-field by-table table-id field)]
                                   (when-not (has-full field-id)
                                     (sync.db/insert-full-field-values! field-id {:values          values
                                                                                  :has_more_values has_more_values})))))
                         field_values)]
    (when row-count?
      (sync.db/update-table! table-id {:estimated_row_count estimated_row_count}))
    {:row-counts-set        (if row-count? 1 0)
     :field-values-inserted (count inserted)}))

(defn- apply-stats!
  "Apply the stats of `batch` to the active Tables of the Database with `database-id` that have its keys."
  [database-id {:keys [tables]}]
  (let [receiving (tables-by-key database-id (map key-of tables) :active-only? true)
        table-ids (mapv :id (vals receiving))
        by-table  (field-index (document/in-batches sync.db/link-fields-of-tables table-ids))
        has-full  (into #{} (mapcat sync.db/field-ids-with-full-field-values)
                        (partition-all document/query-batch-size table-ids))]
    (transduce (keep (fn [entry]
                       (when-let [table (receiving (key-of entry))]
                         (apply-table-stats! table entry by-table has-full))))
               (completing (partial merge-with +))
               {:row-counts-set 0 :field-values-inserted 0}
               tables)))

;;; ------------------------------------------------ Response ------------------------------------------------

(def ^:private known-batch-types
  "The batch types this version applies."
  #{"database" "objects" "links" "stats"})

(defn- refused [message error-code]
  (ex-info message {:status-code 422 :error-code error-code}))

(defn- check-response!
  "Throw unless `response` is an answer this version can apply: of its format version, with batch types it knows, and
  of the right shape. Nothing is written before this check. The error says nothing of the answer's values: they are
  warehouse metadata."
  [response]
  (when (not= document/format-version (:format_version response))
    (throw (refused (tru "The other Metabase sends format version {0}, and this Metabase reads version {1}."
                         (pr-str (:format_version response)) document/format-version)
                    "metadata-sync-format-version-differs")))
  (when-let [unknown (seq (into (sorted-set)
                                (comp (filter map?) (keep :type) (remove known-batch-types) (map str))
                                (when (sequential? (:batches response)) (:batches response))))]
    (throw (refused (tru "The other Metabase sent a batch of type {0}, which this version does not know."
                         (str/join ", " unknown))
                    "metadata-sync-unknown-batch-type")))
  (when-not (mr/validate ::wire/response response)
    (throw (refused (tru "The answer of the other Metabase does not have the shape this version applies.")
                    "metadata-sync-malformed-response"))))

(defn- apply-batch!
  "Apply one `batch` to the Database `database`, in one transaction, and return the counts."
  [database batch]
  (t2/with-transaction [_conn]
    (merge no-counts
           (case (:type batch)
             "database" (apply-database! database batch)
             "objects"  (apply-objects! (:id database) batch)
             "links"    (apply-links! (:id database) batch)
             "stats"    (apply-stats! (:id database) batch)))))

(mr/def ::counts
  [:map {:closed true}
   [:database-updated      :int]
   [:tables-inserted       :int]
   [:tables-existing       :int]
   [:fields-inserted       :int]
   [:fks-set               :int]
   [:row-counts-set        :int]
   [:field-values-inserted :int]])

(mr/def ::result
  [:map {:closed true}
   [:next   {:optional true} [:maybe ::pages/cursor]]
   [:counts ::counts]])

(mu/defn apply-response! :- ::result
  "Apply the other Metabase's `response` to a [[request]] for the Database with `database-id`, and return the cursor of
  the next request (`:next`), when there is one, and counts of what it did.

  Before any write it refuses, with an `:error-code` in the ex-data, an answer of another format version, one with a
  batch type it does not know, and a malformed one. Each batch is applied in one transaction. Once an answer has no
  next cursor, the Database and its Tables count as synced."
  [database-id :- ::lib.schema.id/database
   response    :- [:map {::mr/deliberately-open true
                         :description           "the other Metabase's answer, decoded from JSON, which this checks"}]]
  (let [database (receiving-database database-id)]
    (check-response! response)
    (let [counts (reduce (fn [counts batch] (merge-with + counts (apply-batch! database batch)))
                         no-counts
                         (:batches response))]
      (when-not (:next response)
        (sync-util/set-initial-table-sync-complete-for-db! database)
        (sync-util/set-initial-database-sync-complete! database))
      (cond-> {:counts counts}
        (:next response) (assoc :next (:next response))))))
