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
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
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

  It also gives the Database its lease, or renews it, so no sync of the Database runs for the next [[lease-duration]],
  and it is refused (`metadata-sync-sync-running`) while one runs."
  [database-id :- ::lib.schema.id/database
   after       :- [:maybe ::wire/cursor]]
  (let [database (receiving-database database-id)]
    (take-lease! database-id)
    (u/remove-nils
     {:database        (:name database)
      :engine          (u/qualified-name (:engine database))
      :format_versions [wire/format-version]
      :schema_filters  (schema-filters database-id)
      :after           after})))

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

(defn- values-of
  "The value of each of `columns` that `entry` has one for, as the models expect it. A column the entry has no value
  for is left out, so the model gives it its default, as it does for a row that sync inserts."
  [columns entry]
  (into {}
        (keep (fn [column]
                (when-some [value (row-value entry column)]
                  [column value])))
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
         (u/index-by unique-key))))

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
  {:values_dropped        0
   :tables_skipped        0
   :database_updated      0
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
  once, since it has its metadata."
  [database-id entry]
  (merge (values-of (remove #{:schema :name} tables/table-columns) entry)
         {:db_id               database-id
          :schema              (:schema entry)
          :name                (:name entry)
          :active              true
          :initial_sync_status "complete"}))

(defn- field-row
  "The row of the Field that `field-entry` describes, in the Table with `table-id`, under the Field with `parent-id`
  or at the top."
  [table-id parent-id {:keys [path] :as field-entry}]
  (let [row (values-of tables/field-columns field-entry)]
    (cond-> (assoc row :table_id table-id :parent_id parent-id :name (peek path) :active true)
      ;; Without a coercion, the effective type is the base type, as sync writes it.
      (nil? (:coercion_strategy row)) (assoc :effective_type (:base_type row)))))

(defn- insert-fields!
  "Insert the Fields of the entries of `tables`, each `[table-id entry]`, through the model, one level of nesting at a
  time, so that a parent has its id before its children are inserted. Returns the ids of the inserted Fields by
  `[table-id path]`."
  [tables]
  (let [levels (->> (for [[table-id entry] tables
                          field-entry      (:fields entry)]
                      [table-id (update field-entry :path vec)])
                    (group-by (comp count :path second))
                    (sort-by key)
                    (map val))]
    (reduce (fn [ids level]
              (let [inserted (field/create-fields!
                              (for [[table-id {:keys [path] :as field-entry}] level]
                                (field-row table-id (ids [table-id (pop path)]) field-entry)))]
                ;; `create-fields!` returns the Fields in the order of the rows
                (into ids (map (fn [[table-id {:keys [path]}] {field-id :id}] [[table-id path] field-id])
                               level inserted))))
            {}
            levels)))

(defn- settings-values
  "The values of a settings row for `entry`: for each column it names in `user_set`, a true flag and the entry's value,
  which the settings row holds as a user's; for the other columns of `column->flag`, a false flag. `column->flag`
  gives each column's flag."
  [column->flag {:keys [user_set] :as entry}]
  (let [named (set user_set)]
    (into {}
          (mapcat (fn [[column flag]]
                    (if (contains? named (name column))
                      [[flag true] [column (row-value entry column)]]
                      [[flag false]])))
          column->flag)))

(defn- insert-user-settings!
  "Insert a settings row, through the models, for each of the new `tables`, each `[table-id entry]`, and each of their
  Fields whose entry names a column that a user set on the sender, with the Fields' ids `field-ids` by `[table-id
  path]`. This Metabase's sync then leaves that column as it is, as the sender's does."
  [tables field-ids]
  (let [table-rows (for [[table-id entry] tables
                         :when            (seq (:user_set entry))]
                     (assoc (settings-values warehouse-schema.user-settings/table-set-flags entry) :table_id table-id))
        field-rows (for [[table-id entry] tables
                         field-entry      (:fields entry)
                         :when            (seq (:user_set field-entry))]
                     (assoc (settings-values warehouse-schema.user-settings/field-set-flags field-entry)
                            :field_id (field-ids [table-id (vec (:path field-entry))])))]
    (when (seq table-rows)
      (table-user-settings/create-table-user-settings! (vec table-rows)))
    (when (seq field-rows)
      (field-user-settings/create-field-user-settings! (vec field-rows)))))

(defn- apply-tables!
  "Insert each Table of `batch` that the Database with `database-id` has no row for, active or not, once for each key,
  with its Fields, through the models' write functions, as sync inserts the Tables it finds. A new Table or Field with
  columns that a user set on the sender gets a settings row that says so."
  [database-id {:keys [tables]}]
  (let [existing    (tables-by-key database-id (map pages/table-key tables))
        new-entries (m/distinct-by unique-key (remove (comp existing unique-key) tables))
        ;; `create-tables!` returns the Tables in the order of the rows
        inserted    (when (seq new-entries)
                      (table/create-tables! (mapv #(table-row database-id %) new-entries)))
        by-id       (mapv (fn [{table-id :id} entry] [table-id entry]) inserted new-entries)
        field-ids   (insert-fields! by-id)]
    (insert-user-settings! by-id field-ids)
    {:tables_inserted (count new-entries)
     :tables_existing (count (filter (comp existing unique-key) tables))
     :fields_inserted (count field-ids)}))

(defn- target-key [{{table-schema :schema table-name :table} :target}]
  [table-schema table-name])

(defn- fk-links
  "`[fk-field target-field link]` for each link of the links `batch` whose Table the Database with `database-id` has as
  an active Table. Either Field is nil when this Metabase does not have it."
  [database-id {:keys [tables]}]
  (let [fk-tables (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        targets   (tables-by-key database-id (into [] (comp (mapcat :links) (map target-key)) tables)
                                 :active-only? true)
        by-table  (field-index (pages/in-batches sync.db/top-level-fields-of-tables
                                                 (vec (distinct (map :id (concat (vals fk-tables) (vals targets)))))))]
    (for [{:keys [links] :as links-table} tables
          :let  [table-id (:id (fk-tables (unique-key links-table)))]
          :when table-id
          {:keys [field target] :as link} links]
      [(resolve-field by-table table-id field)
       (resolve-field by-table
                      (:id (targets (unique-key {:schema (:schema target) :name (:table target)})))
                      (:field target))
       link])))

(defn- fk-changes
  "What sync writes when it finds that `fk-field` points at `target-field`: the target, the FK semantic type, and no
  automatic list of values. The columns of `user-set`, the ones a user set on this Field, are left as they are."
  [fk-field target-field user-set]
  (apply dissoc
         (cond-> {:fk_target_field_id (:id target-field) :semantic_type :type/FK}
           (= "auto-list" (:has_field_values fk-field)) (assoc :has_field_values nil))
         user-set))

(defn- mark-fks-as-set!
  "Mark the FK targets of `filled`, each `[fk-field target-field]`, as set by a user, with their targets, in the settings
  `settings` of the Fields by Field id, or in new settings rows."
  [filled settings]
  (let [[updates creates] ((juxt filter remove) (comp settings :id first) filled)]
    (when (seq updates)
      (field-user-settings/update-field-user-settings!
       (for [[{field-id :id} {target-id :id}] updates]
         {:id (:id (settings field-id)) :fk_target_field_id target-id :fk_target_field_id_set true})))
    (when (seq creates)
      (field-user-settings/create-field-user-settings!
       (for [[{field-id :id} {target-id :id}] creates]
         {:field_id field-id :fk_target_field_id target-id :fk_target_field_id_set true})))))

(defn- apply-links!
  "Fill the FK targets that the links of `batch` give and that are empty, through the model, with what sync writes for
  an FK, except on a Field whose FK a user of this Metabase set or cleared. A link that says a user of the sender set
  it marks the FK as set here too. A link whose Field or target this Metabase does not have is skipped, and the
  batch's skipped links are logged as one count."
  [database-id batch]
  (let [links    (fk-links database-id batch)
        empty-fk (into {}
                       (comp (filter (fn [[fk-field target-field]]
                                       (and fk-field target-field (nil? (:fk_target_field_id fk-field)))))
                             (map (fn [[fk-field :as link]] [(:id fk-field) link])))
                       links)
        settings (u/index-by :field_id (pages/in-batches sync.db/field-user-settings-of-fields (vec (keys empty-fk))))
        user-set (update-vals settings warehouse-schema.user-settings/user-set-field-columns)
        fillable (into {} (remove (fn [[field-id]] (contains? (user-set field-id) :fk_target_field_id))) empty-fk)
        skipped  (count (remove (fn [[fk-field target-field]] (and fk-field target-field)) links))]
    (when (pos? skipped)
      (log/warnf "Skipped %d FK links of Database %d: this Metabase does not have the Field or its target"
                 skipped database-id))
    (when (seq fillable)
      (field/update-fields! (for [[field-id [fk-field target-field]] fillable]
                              (assoc (fk-changes fk-field target-field (user-set field-id #{})) :id field-id)))
      (mark-fks-as-set! (for [[_ [fk-field target-field link]] fillable
                              :when (:user_set link)]
                          [fk-field target-field])
                        settings))
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

(defn- table-stats-writes
  "The writes of the stats `entry` for `table`: its row count when it has none, and a `:full` FieldValues row for each
  of the [[fields-to-give-values]]."
  [{table-id :id :as table} {:keys [estimated_row_count field_values]} by-table has-values]
  {:row-counts   (when (and (some? estimated_row_count) (nil? (:estimated_row_count table)))
                   [{:id table-id :estimated_row_count estimated_row_count}])
   :field-values (for [[field-id {:keys [values has_more_values]}]
                       (fields-to-give-values table-id field_values by-table has-values)]
                   {:field_id field-id :type :full :values values :has_more_values has_more_values})})

(defn- apply-stats!
  "Apply the stats of `batch` to the active Tables of the Database with `database-id` that have its keys, each once."
  [database-id {:keys [tables]}]
  (let [receiving  (tables-by-key database-id (map pages/table-key tables) :active-only? true)
        table-ids  (mapv :id (vals receiving))
        by-table   (field-index (pages/in-batches sync.db/top-level-fields-of-tables table-ids))
        has-values (into #{} (mapcat sync.db/field-ids-with-field-values)
                         (partition-all pages/query-batch-size table-ids))
        {:keys [row-counts field-values]}
        (transduce (keep (fn [entry]
                           (when-let [table (receiving (unique-key entry))]
                             (table-stats-writes table entry by-table has-values))))
                   (completing (partial merge-with into))
                   {:row-counts [] :field-values []}
                   (m/distinct-by unique-key tables))]
    (when (seq row-counts)
      (table/update-tables! row-counts))
    (when (seq field-values)
      (field-values/create-field-values! field-values))
    {:row_counts_set        (count row-counts)
     :field_values_inserted (count field-values)}))

;;; ------------------------------------------------ Response ------------------------------------------------

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
                 :field_order     table/field-orderings
                 ;; the model takes the others too, but they say how one instance made the Table
                 :data_source     (into #{} (map keyword) tables/sent-data-sources)}})

(defn- row-as-written
  "`row` of `model` with the model's transforms applied to each value. Throws when a transform refuses a value, as an
  insert through the model does."
  [model row]
  (reduce-kv (fn [row column {to-db :in}]
               (cond-> row
                 (and to-db (some? (get row column))) (update column to-db)))
             row
             (t2/transforms model)))

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
       (some? (row-as-written model row))))

(mr/def ::field-row
  "A Field row that an entry gives, before its Table has an id: what creating a Field takes, without the Table."
  (mut/dissoc ::warehouse-schema.schema/field.create :table_id))

(defn- table-accepted?
  "Whether the row that the Table entry `entry` gives is one this Metabase takes for the Database with `database-id`."
  [database-id entry]
  (try
    (accepted-row? :model/Table ::warehouse-schema.schema/table.create (table-row database-id entry))
    (catch Exception _
      false)))

(defn- field-accepted?
  "Whether the row that the Field entry `entry` gives is one this Metabase takes."
  [entry]
  (try
    (accepted-row? :model/Field ::field-row (dissoc (field-row nil nil (update entry :path vec)) :table_id))
    (catch Exception _
      false)))

(def ^:private table-column-groups
  "The columns of a Table entry that are left out together when this Metabase does not take one of them."
  (mapv vector (remove #{:schema :name} tables/table-columns)))

(def ^:private field-column-groups
  "The columns of a Field entry that are left out together when this Metabase does not take one of them. A coercion
  and the effective type it gives go together."
  (into [[:coercion_strategy :effective_type]]
        (map vector)
        (remove #{:base_type :database_type :coercion_strategy :effective_type} tables/field-columns)))

(defn- without-unaccepted
  "`[entry dropped]`: `entry` without each of the column `groups` that `accepted?` does not take next to the columns
  `base-keys`, and the set of columns it left out, or nil when it does not take the base columns, or the rest."
  [accepted? entry base-keys groups]
  (if (accepted? entry)
    [entry #{}]
    (let [base (select-keys entry (conj base-keys :path))]
      (when (accepted? base)
        (let [dropped (into []
                            (comp (filter (fn [group]
                                            (and (some #(contains? entry %) group)
                                                 (not (accepted? (merge base (select-keys entry group)))))))
                                  cat
                                  (filter #(contains? entry %)))
                            groups)
              kept    (apply dissoc entry dropped)]
          (when (accepted? kept)
            [kept (set dropped)]))))))

(defn- with-known-user-set
  "`[entry count]`: `entry`, from which the columns `dropped` were left out, with a `user_set` that names only columns
  among `known` and none of `dropped`, and how many columns and names it left out."
  [[entry dropped] known]
  (let [user-set (:user_set entry)
        kept     (filterv #(and (contains? known %) (not (contains? dropped (keyword %)))) user-set)]
    [(if (seq kept) (assoc entry :user_set kept) (dissoc entry :user_set))
     (+ (count dropped) (- (count user-set) (count kept)))]))

(defn- accepted-field
  "`[entry dropped]` for the Field entry `entry` as this Metabase takes it, or nil when it takes no row for it. A base
  type this version does not know is the unknown type, as sync gives a column of a type it does not know."
  [entry]
  (let [cleaned (or (without-unaccepted field-accepted? entry [:base_type :database_type] field-column-groups)
                    (some-> (without-unaccepted field-accepted? (assoc entry :base_type "type/*")
                                                [:base_type :database_type] field-column-groups)
                            (update 1 conj :base_type)))]
    (when cleaned
      (with-known-user-set cleaned (set tables/field-user-set-columns)))))

(defn- accepted-table
  "`[entry dropped]` for the Table entry `entry` as this Metabase takes it for the Database with `database-id`, with
  its Fields, or nil when it takes no row for the Table or one of its Fields."
  [database-id entry]
  (let [table  (without-unaccepted #(table-accepted? database-id %) (dissoc entry :fields) [:schema :name]
                                   table-column-groups)
        fields (map accepted-field (:fields entry))]
    (when (and table (every? some? fields))
      (let [[table-entry dropped] (with-known-user-set table (set tables/table-user-set-columns))]
        [(assoc table-entry :fields (mapv first fields))
         (transduce (map second) + dropped fields)]))))

(defn- accepted-batch
  "`[batch counts]`: the batch as this Metabase applies it to the Database with `database-id`, without the Tables,
  values and links it does not take, and counts of what it left out; or nil for a batch of a type it does not know."
  [database-id {batch-type :type :as batch}]
  (case batch-type
    "tables" (let [accepted (mapv #(accepted-table database-id %) (:tables batch))]
               [(assoc batch :tables (into [] (comp (keep identity) (map first)) accepted))
                {:values_dropped (transduce (keep second) + 0 accepted)
                 :tables_skipped (count (remove some? accepted))
                 :left_out       0}])
    "links"  (let [tables (for [table (:tables batch)]
                            (update table :links #(filterv (comp #{"fk"} :kind) %)))]
               [(assoc batch :tables (filterv (comp seq :links) tables))
                {:values_dropped 0 :tables_skipped 0
                 :left_out       (- (transduce (map (comp count :links)) + 0 (:tables batch))
                                    (transduce (map (comp count :links)) + 0 tables))}])
    ("database" "stats") [batch {:values_dropped 0 :tables_skipped 0 :left_out 0}]
    nil))

(defn- accepted-response
  "`response` as this Metabase applies it to the Database with `database-id`, with the counts of what it left out: a
  value, Table, batch or link that only a newer version sends, or that this version does not take. They are logged as
  counts, which hold none of the answer's values."
  [database-id response]
  (let [accepted (map #(accepted-batch database-id %) (:batches response))
        counts   (reduce (partial merge-with +) {:values_dropped 0 :tables_skipped 0 :left_out 0}
                         (keep second accepted))
        batches  (count (remove some? accepted))]
    (when (or (pos? batches) (some pos? (vals counts)))
      (log/warnf (str "An answer for Database %d holds what this version does not apply, which it leaves out: %d values,"
                      " %d Tables, %d batches and %d links")
                 database-id (:values_dropped counts) (:tables_skipped counts) batches (:left_out counts)))
    {:response (assoc response :batches (into [] (comp (keep identity) (map first)) accepted))
     :counts   (select-keys counts [:values_dropped :tables_skipped])}))

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

(defn- check-response!
  "Throw unless `response` is an answer this version can apply to `database`: of its format version, of the right
  shape, with each nested Field's parent in its Table's entry, and for this Database by name and engine. What it does
  not know or take is left out, not refused (see [[accepted-response]]). No error repeats a value of the answer: they
  are warehouse metadata."
  [database response]
  (check-format-version! response)
  (check-shape! response)
  (check-database! database response))

(defn- apply-batch!
  "Apply one `batch` to the Database `database`, and return the counts."
  [database batch]
  (merge no-counts
         (case (:type batch)
           "database" (apply-database! database batch)
           "tables"   (apply-tables! (:id database) batch)
           "links"    (apply-links! (:id database) batch)
           "stats"    (apply-stats! (:id database) batch))))

(def ^:private logged-frames
  "How many stack frames of the deepest cause a failed apply logs."
  12)

(defn- failure-description
  "What can be logged of the failure `e`: the class of each of its causes, with the SQLState of a SQL one, and the
  first frames of the deepest cause's stack. A cause's message is left out: it can hold the answer's values."
  [^Throwable e]
  (let [causes (take-while some? (iterate #(.getCause ^Throwable %) e))
        cause  (fn [^Throwable t]
                 (cond-> (.getName (class t))
                   (instance? java.sql.SQLException t)
                   (str " (SQLState " (.getSQLState ^java.sql.SQLException t) ")")))]
    (str (str/join " caused by " (map cause causes))
         (apply str (for [frame (take logged-frames (.getStackTrace ^Throwable (last causes)))]
                      (str "\n  at " frame))))))

(defn- apply-batches!
  "Apply the `batches` of an answer to the Database `database` in one transaction, and return the summed counts. A
  write that fails rolls back the whole answer, and is refused with a code of its own and a message with none of the
  answer's values; the cause stays on the exception. The failure is logged as [[failure-description]] gives it. With
  `last?`, the Database counts as synced in the same transaction."
  [database batches last?]
  (try
    (t2/with-transaction [_conn]
      (u/prog1 (reduce (fn [counts batch] (merge-with + counts (apply-batch! database batch))) no-counts batches)
        (when last?
          (sync-util/set-initial-database-sync-complete! database))))
    (catch Exception e
      (log/errorf "An answer for Database %d could not be applied: %s" (:id database) (failure-description e))
      (throw (ex-info (tru "The answer of the other Metabase could not be applied, and nothing of it was written.")
                      {:status-code 422 :error-code "metadata-sync-apply-failed"}
                      e)))))

(mr/def ::counts
  "What an apply did. The keys are snake_case: the counts are part of an API response."
  [:map {:closed true}
   [:values_dropped        :int]
   [:tables_skipped        :int]
   [:database_updated      :int]
   [:tables_inserted       :int]
   [:tables_existing       :int]
   [:fields_inserted       :int]
   [:fks_set               :int]
   [:row_counts_set        :int]
   [:field_values_inserted :int]])

(mr/def ::result
  [:map {:closed true}
   [:next   {:optional true} [:maybe ::wire/cursor]]
   [:counts ::counts]])

(mu/defn apply-response! :- ::result
  "Apply the other Metabase's `response` to a [[request!]] for the Database with `database-id`, and return the cursor
  of the next request (`:next`), when there is one, and counts of what it did.

  Before any write it refuses, with an `:error-code` in the ex-data, an answer of a format version it does not read,
  a malformed one, and one that is for another Database. It leaves out what only a newer sender sends, or what it
  does not take, and counts it: a key, batch type or link kind it does not know (not counted), a value
  (`values_dropped`), and a Table, with its Fields, that it takes no row for (`tables_skipped`). A base type it does not
  know is the unknown type, as sync gives one. An answer is applied in one transaction, so one that fails while it is
  written writes nothing
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
    (let [{accepted :response left-out :counts} (accepted-response database-id response)
          counts (merge-with + (apply-batches! database (:batches accepted) (nil? (:next response))) left-out)]
      (when-not (:next response)
        (end-lease! database-id))
      (cond-> {:counts counts}
        (:next response) (assoc :next (:next response))))))
