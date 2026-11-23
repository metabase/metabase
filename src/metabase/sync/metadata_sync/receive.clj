(ns metabase.sync.metadata-sync.receive
  "The receiver's side of a seed: the request to send to the other Metabase, and how its answer is applied.

  A seed is a loop that something outside Metabase runs, since no Metabase calls another: build a request with
  [[request!]], send it to the other Metabase's `POST /api/warehouse/metadata/changes`, and give the answer to
  [[apply-response!]], again with the answer's `next` while it has one.

  A seed only adds. It inserts the Tables the receiver does not have, with their Fields, and fills FK targets, row
  counts and field values that are empty. It removes no row, and changes a row it did not insert only to fill such
  an empty value, so a Table the receiver has, active or not, keeps what it has, and the receiver's own sync corrects
  it later.

  Answers hold warehouse metadata, and field values are rows of the customer's tables, so nothing here logs them."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.change-log.core :as change-log]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2])
  (:import
   (java.time Duration Instant)))

(set! *warn-on-reflection* true)

(defn- receiving-database
  "The Database with `database-id`, when a seed may write it. Throws for no such Database, a stub Database, the audit
  Database, which describes this Metabase's own app DB, or a destination Database of database routing, which has no
  metadata of its own."
  [database-id]
  (let [database (sync.db/database database-id)]
    (cond
      (nil? database)
      (throw (ex-info (tru "There is no Database with id {0}." database-id)
                      {:status-code 404 :error-code "metadata-sync-no-database"}))

      (or (:is_stub database) (:is_audit database) (:router_database_id database))
      (throw (ex-info (tru "The Database {0} does not take metadata from another Metabase." (pr-str (:name database)))
                      {:status-code 400 :error-code "metadata-sync-database-not-loadable"}))

      :else
      database)))

;;; ------------------------------------------------ Lease ------------------------------------------------

;; A seed is many calls that something outside Metabase makes. From the first until the last answer is applied, the
;; receiving Database has a lease, and no sync operation of it runs: a sync and a seed both insert Tables. The lease
;; is in this JVM only. It ends with the last answer, or once no call renewed it for [[lease-duration]], so a seed
;; that stops does not stop sync for ever.

(def ^:private lease-duration (Duration/ofMinutes 10))

(defonce ^:private leases
  ;; Database id -> the Instant its lease ends.
  (atom {}))

(defn- end-lease! [database-id]
  (swap! leases dissoc database-id))

(defn- seed-running
  "`{:reason ..}` when a seed of `database` runs, so that its sync is skipped, or nil."
  [database]
  (when-let [^Instant ends (@leases (u/the-id database))]
    (when (.isAfter ends (Instant/now))
      {:reason "a seed of its metadata from another Metabase is running"})))

(sync-util/register-busy-predicate! #'seed-running)

(defn- take-lease!
  "Give the Database with `database-id` a lease, or renew the one it has. Throws, and puts the lease back as it was,
  when a sync of the Database runs: it would insert Tables while the seed does. The lease is set first and the sync is
  looked for second. Sync does the same the other way round, so of a seed and a sync that start together, at least
  one yields."
  [database-id]
  (let [[before] (swap-vals! leases assoc database-id (.plus (Instant/now) ^Duration lease-duration))]
    (when (sync-util/sync-running? database-id)
      (swap! leases #(if-let [ends (before database-id)]
                       (assoc % database-id ends)
                       (dissoc % database-id)))
      (throw (ex-info (tru "A sync of this Database is running. Try again when it ends.")
                      {:status-code 409 :error-code "metadata-sync-sync-running"})))))

;;; ------------------------------------------------ Request ------------------------------------------------

(defn- schema-filters
  "The schema filters of the Database with `database-id`, as a request sends them, or nil when it has none."
  [database-id]
  (let [[inclusion exclusion] (driver.s/db-details->schema-filter-patterns (driver.u/lib-database database-id))]
    (cond
      (not (str/blank? inclusion)) {:type "inclusion" :patterns inclusion}
      (not (str/blank? exclusion)) {:type "exclusion" :patterns exclusion})))

(mu/defn request! :- ::wire/request
  "The request to send to the other Metabase for the metadata of the Database with `database-id`, from the cursor
  `after`, or from the start when it is nil. It names the Database by name and engine, with its schema filters.

  It also gives the Database its lease, or renews it, so no sync of the Database runs for the next 10 minutes, and it
  is refused (`metadata-sync-sync-running`) while one runs."
  [database-id :- ::lib.schema.id/database
   after       :- [:maybe ::pages/cursor]]
  (let [database (receiving-database database-id)]
    (take-lease! database-id)
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
  "The value of `column` in the entry `entry`, as the app DB models expect it. A value of the wrong kind stays as it
  is, or makes this throw: the checks of an answer then refuse it."
  [entry column]
  (let [value (get entry column)]
    (cond
      (nil? value)                                   nil
      (and (keyword-columns column) (string? value)) (keyword value)
      (= column :last_analyzed)                      (u.date/parse value)
      :else                                          value)))

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
      (database/update-databases! [(assoc changes :id (:id database))]))
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

(defn- field-ids-by-path
  "The ids of the Fields of the Tables with `table-ids`, by `[table-id path]`."
  [table-ids]
  (let [rows  (pages/in-batches sync.db/field-keys-of-tables (vec table-ids))
        by-id (m/index-by :id rows)
        path  (fn path [{:keys [parent_id] field-name :name}]
                (conj (if parent_id (path (by-id parent_id)) []) field-name))]
    (into {} (map (juxt (juxt :table_id path) :id)) rows)))

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
    (reduce (fn [inserted level]
              ;; Only a nested level needs ids: the ones of its parents, which the levels before it inserted.
              (let [ids  (if (pos? inserted) (field-ids-by-path (map first tables)) {})
                    rows (for [[table-id {:keys [path] :as field-entry}] level]
                           (field-row table-id (ids [table-id (pop path)]) field-entry))]
                (doseq [batch (partition-all pages/query-batch-size rows)]
                  (sync.db/insert-field-rows! (vec batch)))
                (+ inserted (count rows))))
            0
            levels)))

(defn- set-flags
  "The flags of a settings row for `entry`: true for each column it names in `user_set`, false for the others.
  `column->flag` gives each column's flag."
  [column->flag {:keys [user_set]}]
  (let [named (set user_set)]
    (into {} (map (fn [[column flag]] [flag (contains? named (name column))])) column->flag)))

(defn- insert-user-settings!
  "Insert a settings row, through the models, for each of the new `tables`, each `[table-id entry]`, and each of their
  Fields whose entry names a column that a user set on the sender. This Metabase's sync then leaves that column as it
  is, as the sender's does."
  [tables]
  (let [table-rows (for [[table-id entry] tables
                         :when            (seq (:user_set entry))]
                     (assoc (set-flags warehouse-schema.user-settings/table-set-flags entry) :table_id table-id))
        flagged    (for [[table-id entry] tables
                         field-entry      (:fields entry)
                         :when            (seq (:user_set field-entry))]
                     [table-id field-entry])
        field-ids  (when (seq flagged)
                     (field-ids-by-path (distinct (map first flagged))))]
    (doseq [batch (partition-all pages/query-batch-size table-rows)]
      (sync.db/insert-table-user-settings! (vec batch)))
    (doseq [batch (partition-all pages/query-batch-size flagged)]
      (sync.db/insert-field-user-settings!
       (mapv (fn [[table-id field-entry]]
               (assoc (set-flags warehouse-schema.user-settings/field-set-flags field-entry)
                      :field_id (field-ids [table-id (vec (:path field-entry))])))
             batch)))))

(defn- after-insert!
  "Do for the new `tables` of the Database with `database-id`, all at once, what the Table and Field models' insert
  hooks and the consumers of their events do for each row: the default permissions, the change log and the search
  index. The dependency jobs need nothing: they compute nothing for a Table, and a new Table has no dependents."
  [database-id tables]
  (table/set-new-tables-permissions! database-id tables)
  (doseq [batch (partition-all pages/query-batch-size (map :id tables))]
    (change-log/log-rows! :model/Table :insert :id [:in batch])
    (change-log/log-rows! :model/Field :insert :table_id [:in batch]))
  (search/bulk-update! tables))

(defn- apply-tables!
  "Insert each Table of `batch` that the Database with `database-id` has no row for, active or not, once for each key,
  with its Fields. They are inserted a batch of rows at a time, not through the models, and [[after-insert!]] does
  what the models' hooks would. A new Table or Field with columns that a user set on the sender gets a settings row
  that says so."
  [database-id {:keys [tables]}]
  (let [existing    (tables-by-key database-id (map pages/table-key tables))
        new-entries (m/distinct-by unique-key (remove (comp existing unique-key) tables))]
    (doseq [batch (partition-all pages/query-batch-size new-entries)]
      (sync.db/insert-table-rows! (mapv #(table-row database-id %) batch)))
    (let [inserted (tables-by-key database-id (map pages/table-key new-entries))
          by-id    (mapv (juxt (comp :id inserted unique-key) identity) new-entries)
          fields   (insert-fields! by-id)]
      (when (seq inserted)
        (insert-user-settings! by-id)
        (after-insert! database-id (vals inserted)))
      {:tables_inserted (count new-entries)
       :tables_existing (count (filter (comp existing unique-key) tables))
       :fields_inserted fields})))

(defn- target-key [{{table-schema :schema table-name :table} :target}]
  [table-schema table-name])

(defn- fk-pairs
  "`[fk-field target-field]` for each link of the links `batch` whose Table the Database with `database-id` has as an
  active Table. Either Field is nil when this Metabase does not have it."
  [database-id {:keys [tables]}]
  (let [fk-tables (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        targets   (tables-by-key database-id (into [] (comp (mapcat :links) (map target-key)) tables)
                                 :active-only? true)
        by-table  (field-index (pages/in-batches sync.db/top-level-fields-of-tables
                                                 (vec (distinct (map :id (concat (vals fk-tables) (vals targets)))))))]
    (for [{:keys [links] :as links-table} tables
          :let  [table-id (:id (fk-tables (unique-key links-table)))]
          :when table-id
          {:keys [field target]} links]
      [(resolve-field by-table table-id field)
       (resolve-field by-table
                      (:id (targets (unique-key {:schema (:schema target) :name (:table target)})))
                      (:field target))])))

(defn- user-set-columns
  "The columns that a user set, by Field id, for each of the Fields with `field-ids` that has a settings row."
  [field-ids]
  (into {}
        (map (juxt :field_id warehouse-schema.user-settings/user-set-field-columns))
        (pages/in-batches sync.db/field-user-settings-of-fields (vec field-ids))))

(defn- fk-changes
  "What sync writes when it finds that `fk-field` points at `target-field`: the target, the FK semantic type, and no
  automatic list of values. The other columns of `user-set`, the ones a user set on this Field, are left as they are.
  The target is always written: it is empty, and the link is what the seed is here to copy."
  [fk-field target-field user-set]
  (apply dissoc
         (cond-> {:fk_target_field_id (:id target-field) :semantic_type :type/FK}
           (= "auto-list" (:has_field_values fk-field)) (assoc :has_field_values nil))
         (disj user-set :fk_target_field_id)))

(defn- apply-links!
  "Fill the FK targets that the links of `batch` give and that are empty, one Field at a time through the model, with
  what sync writes for an FK. A link whose Field or target this Metabase does not have is skipped, and the batch's
  skipped links are logged as one count."
  [database-id batch]
  (let [pairs    (fk-pairs database-id batch)
        fillable (into {}
                       (comp (filter (fn [[fk-field target-field]]
                                       (and fk-field target-field (nil? (:fk_target_field_id fk-field)))))
                             (map (fn [[fk-field :as pair]] [(:id fk-field) pair])))
                       pairs)
        skipped  (count (remove (partial every? some?) pairs))
        user-set (user-set-columns (keys fillable))]
    (when (pos? skipped)
      (log/warnf "Skipped %d FK links of Database %d: this Metabase does not have the Field or its target"
                 skipped database-id))
    (when (seq fillable)
      (field/update-fields! (for [[field-id [fk-field target-field]] fillable]
                              (assoc (fk-changes fk-field target-field (user-set field-id #{})) :id field-id))))
    {:fks_set (count fillable)}))

(defn- fields-to-give-values
  "`[field-id entry]` for each entry of `field-values` whose Field, in the Table with `table-id`, this Metabase has,
  that can have field values, and that has no FieldValues row of any type: the model's hooks would delete the others.
  A Field is there once."
  [table-id field-values by-table has-values]
  (->> field-values
       (keep (fn [{:keys [field] :as entry}]
               (when-let [{field-id :id :as receiving} (resolve-field by-table table-id field)]
                 (when (and (not (has-values field-id))
                            (field-values/field-should-have-field-values? receiving))
                   [field-id entry]))))
       (m/distinct-by first)))

(defn- apply-table-stats!
  "Set the row count of `table` when it is empty, and insert a `:full` FieldValues row, through the model, for each of
  the [[fields-to-give-values]] of the stats `entry`. Returns the counts."
  [{table-id :id :as table} {:keys [estimated_row_count field_values]} by-table has-values]
  (let [row-count? (and (some? estimated_row_count) (nil? (:estimated_row_count table)))
        to-fill    (fields-to-give-values table-id field_values by-table has-values)]
    (doseq [[field-id {:keys [values has_more_values]}] to-fill]
      (sync.db/insert-full-field-values! field-id {:values values :has_more_values has_more_values}))
    (when row-count?
      (table/update-tables! [{:id table-id :estimated_row_count estimated_row_count}]))
    {:row_counts_set        (if row-count? 1 0)
     :field_values_inserted (count to-fill)}))

(defn- apply-stats!
  "Apply the stats of `batch` to the active Tables of the Database with `database-id` that have its keys, each once."
  [database-id {:keys [tables]}]
  (let [receiving  (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        table-ids  (mapv :id (vals receiving))
        by-table   (field-index (pages/in-batches sync.db/top-level-fields-of-tables table-ids))
        has-values (into #{} (mapcat sync.db/field-ids-with-field-values)
                         (partition-all pages/query-batch-size table-ids))]
    (transduce (keep (fn [entry]
                       (when-let [table (receiving (unique-key entry))]
                         (apply-table-stats! table entry by-table has-values))))
               (completing (partial merge-with +))
               {:row_counts_set 0 :field_values_inserted 0}
               (m/distinct-by unique-key tables))))

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

(def ^:private enum-columns
  "The values of the columns that a model takes as any keyword, by model. The models' transforms check the others."
  {:model/Field {:visibility_type  (set lib.schema.metadata/column-visibility-types)
                 :has_field_values (set lib.schema.metadata/column-has-field-values-options)
                 :data_sensitivity (set lib.schema.metadata/column-data-sensitivity-types)}
   :model/Table {:visibility_type table/visibility-types
                 :field_order     table/field-orderings}})

(defn- accepted-row?
  "Whether this Metabase's `model` takes `row`: it has the shape of `row-schema`, its [[enum-columns]] have values
  this version knows, and the model's transforms take its values. A transform throws for a type that this version
  does not know."
  [model row-schema row]
  (and (mr/validate row-schema row)
       (every? (fn [[column allowed]]
                 (let [value (get row column)]
                   (or (nil? value) (contains? allowed value))))
               (enum-columns model))
       (some? (sync.db/row-as-written model row))))

(mr/def ::field-row
  "A Field row that an entry gives, before its Table has an id: what creating a Field takes, without the Table."
  (mut/dissoc ::warehouse-schema.schema/field.create :table_id))

(defn- accepted-table?
  "Whether the rows that the Table entry `table` gives, its own and its Fields', are rows this Metabase takes for the
  Database with `database-id`."
  [database-id table]
  (try
    (and (accepted-row? :model/Table ::warehouse-schema.schema/table.create (table-row database-id table))
         (every? #(accepted-row? :model/Field ::field-row (dissoc (field-row nil nil (update % :path vec)) :table_id))
                 (:fields table)))
    (catch Exception _
      false)))

(defn- table-entries
  "The Table entries of the tables batches of `response`."
  [response]
  (for [{batch-type :type :keys [tables]} (:batches response)
        :when (= "tables" batch-type)
        table tables]
    table))

(defn- check-format-version! [response]
  (let [version (:format_version response)]
    (when (not= wire/format-version version)
      (throw (refused (if (int? version)
                        (tru "The other Metabase sends format version {0}, and this Metabase reads version {1}."
                             (str version) (str wire/format-version))
                        (tru "The other Metabase sends no format version. This Metabase reads version {0}."
                             (str wire/format-version)))
                      "metadata-sync-format-version-differs")))))

(defn- check-batch-types! [{:keys [batches]}]
  (when (and (sequential? batches)
             (some #(and (map? %) (some? (:type %)) (not (known-batch-types (:type %)))) batches))
    (throw (refused (tru "The other Metabase sent a batch of a type that this version does not know.")
                    "metadata-sync-unknown-batch-type"))))

(defn- check-shape! [response]
  (when-not (and (mr/validate ::wire/response response)
                 (not-any? broken-field-paths? (table-entries response)))
    (throw (refused (tru "The answer of the other Metabase does not have the shape this version applies.")
                    "metadata-sync-malformed-response"))))

(defn- check-database! [database response]
  (when-not (and (= (:name database) (:database response))
                 (= (u/qualified-name (:engine database)) (:engine response)))
    (throw (refused (tru "The answer of the other Metabase is for another Database than {0}."
                         (pr-str (:name database)))
                    "metadata-sync-answer-of-another-database"))))

(defn- check-values! [database response]
  (when-not (every? #(accepted-table? (:id database) %) (table-entries response))
    (throw (refused (tru "The answer of the other Metabase has a value that this version does not accept.")
                    "metadata-sync-malformed-response"))))

(defn- check-response!
  "Throw unless `response` is an answer this version can apply to `database`: of its format version, with batch types
  it knows, of the right shape, with each nested Field's parent in its Table's entry, for this Database by name and
  engine, and with values that this Metabase's Table and Field models take. No error repeats a value of the answer:
  they are warehouse metadata."
  [database response]
  (check-format-version! response)
  (check-batch-types! response)
  (check-shape! response)
  (check-database! database response)
  (check-values! database response))

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
      (reduce (fn [counts batch] (merge-with + counts (apply-batch! database batch))) no-counts batches))
    (catch Exception e
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
  "Apply the other Metabase's `response` to a [[request!]] for the Database with `database-id`, and return the cursor
  of the next request (`:next`), when there is one, and counts of what it did.

  Before any write it refuses, with an `:error-code` in the ex-data, an answer of another format version, one with a
  batch type it does not know, a malformed one, one with a value this version does not accept, and one that is for
  another Database. An answer is applied in one transaction, so one that fails while it is written writes nothing
  (`metadata-sync-apply-failed`), and can be sent again. Each Table a seed inserts counts as synced at once; once an
  answer has no next cursor, the Database counts as synced too. An answer with no batches and no cursor therefore
  marks the Database as synced, also when it has no Tables. A Table the receiver had keeps its sync status.

  From the first [[request!]] until the last answer, no sync of the Database runs in this JVM, and while a sync of it
  runs, a request or an answer is refused (`metadata-sync-sync-running`): both insert Tables. See the lease above."
  [database-id :- ::lib.schema.id/database
   response    :- [:map {:description "the other Metabase's answer, decoded from JSON, which this checks"}]]
  (let [database (receiving-database database-id)]
    (check-response! database response)
    (take-lease! database-id)
    (let [counts (apply-batches! database (:batches response))]
      (when-not (:next response)
        (sync-util/set-initial-database-sync-complete! database)
        (end-lease! database-id))
      (cond-> {:counts counts}
        (:next response) (assoc :next (:next response))))))
