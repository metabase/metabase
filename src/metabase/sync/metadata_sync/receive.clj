(ns metabase.sync.metadata-sync.receive
  "The receiver's side of a seed: the request to send to the other Metabase, and how its answer is applied.

  A seed is a loop that something outside Metabase runs, since no Metabase calls another: build a request with
  [[request]], send it to the other Metabase's `POST /api/warehouse/metadata/changes`, and give the answer to
  [[apply-response!]], again with the answer's `next` while it has one.

  A seed fills a Database that has no Tables yet, once. It inserts the Tables of each answer with their Fields, and
  then fills their FK targets, row counts and field values. An answer applied again writes nothing, since a Table it
  has is not inserted again and a value that is set is not set again, so an answer whose result was lost can be sent
  again. No sync of the Database may run until the seed ends: the app that runs the seed sees to that, for example
  with `disable-auto-sync` on. The Database's own sync then starts from the seeded metadata. What the receiver takes of
  an answer is in [[metabase.sync.metadata-sync.accept]].

  Answers hold warehouse metadata, and field values are rows of the customer's tables, so nothing here logs them."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.accept :as accept]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [metabase.warehouse-schema.user-settings :as warehouse-schema.user-settings]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

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

;;; ------------------------------------------------ Request ------------------------------------------------

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
   after       :- [:maybe ::wire/cursor]]
  (let [database (receiving-database database-id)]
    (u/remove-nils
     {:database        (:name database)
      :engine          (u/qualified-name (:engine database))
      :format_versions [wire/format-version]
      :schema_filters  (schema-filters database-id)
      :after           after})))

;;; ------------------------------------------------ Lookups ------------------------------------------------

(defn- unique-key
  "The key of a Table as the unique index on Tables compares it: a nil schema is the empty schema."
  [{table-schema :schema table-name :name}]
  [(or table-schema "") table-name])

(defn- tables-by-key
  "The Tables of the Database with `database-id` that have one of the `table-keys`, by [[unique-key]], looked up
  [[pages/query-batch-size]] names at a time. The name is compared again here: the app DB's collation can ignore
  case."
  [database-id table-keys]
  (let [wanted (into #{} (map (fn [[table-schema table-name]] (unique-key {:schema table-schema :name table-name})))
                     table-keys)]
    (->> (pages/in-batches #(sync.db/tables-named database-id %) (distinct (map second table-keys)))
         (filter (comp wanted unique-key))
         (u/index-by unique-key))))

(defn- field-index
  "The Fields of `fields` by Table id, each as a map of a name to its Field."
  [fields]
  (update-vals (group-by :table_id fields) #(m/index-by :name %)))

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
   :left_out              0
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
                                (accept/field-row table-id (ids [table-id (pop path)]) field-entry)))]
                ;; `create-fields!` returns the Fields in the order of the rows
                (into ids (map (fn [[table-id {:keys [path]}] {field-id :id}] [[table-id path] field-id])
                               level inserted))))
            {}
            levels)))

(defn- settings-values
  "The values of a settings row for `entry`, as the settings model says which columns a user set: for each column it
  names in `user_set`, the entry's value, which the settings row holds as a user's, and a true flag when the column
  has one in `column->flag`; for the other columns of `column->flag`, a false flag. An entry names an FK target only
  when a user cleared it (a target a user set is on its link), and an id in an entry would be one of the sender's, so
  the target is always none."
  [column->flag {:keys [user_set] :as entry}]
  (let [named (map keyword user_set)]
    (into (update-vals (set/map-invert column->flag) (constantly false))
          (mapcat (fn [column]
                    (cond-> [[column (when-not (= :fk_target_field_id column) (accept/row-value entry column))]]
                      (column->flag column) (conj [(column->flag column) true]))))
          named)))

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
  "Insert each Table of `batch` that the Database with `database-id` has no row for, once for each key, with its
  Fields, through the models' write functions, as sync inserts the Tables it finds. A new Table or Field with
  columns that a user set on the sender gets a settings row that says so."
  [database-id {:keys [tables]}]
  (let [existing    (tables-by-key database-id (map pages/table-key tables))
        new-entries (m/distinct-by unique-key (remove (comp existing unique-key) tables))
        ;; `create-tables!` returns the Tables in the order of the rows
        inserted    (when (seq new-entries)
                      (table/create-tables! (mapv #(accept/table-row database-id %) new-entries)))
        by-id       (mapv (fn [{table-id :id} entry] [table-id entry]) inserted new-entries)
        field-ids   (insert-fields! by-id)]
    (insert-user-settings! by-id field-ids)
    {:tables_inserted (count new-entries)
     :tables_existing (count (filter (comp existing unique-key) tables))
     :fields_inserted (count field-ids)}))

(defn- target-key [{{table-schema :schema table-name :table} :target}]
  [table-schema table-name])

(defn- fk-links
  "`[fk-field target-field link]` for each link of the links `batch` whose Table the Database with `database-id` has.
  Either Field is nil when this Metabase does not have it."
  [database-id {:keys [tables]}]
  (let [fk-tables (tables-by-key database-id (map pages/table-key tables))
        targets   (tables-by-key database-id (into [] (comp (mapcat :links) (map target-key)) tables))
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
  "Fill the FK targets that the links of `batch` give and that are empty, through the model. The Field already has
  the sender's semantic type and list setting from its entry. A link that says a user of the sender set it marks the
  FK as set here too. A Field whose entry said that a user cleared its FK is not filled: a newer sender could send a
  link for it. A link whose Field or target this Metabase does not have is skipped, and the batch's skipped links are
  logged as one count."
  [database-id batch]
  (let [links    (fk-links database-id batch)
        empty-fk (into {}
                       (comp (filter (fn [[fk-field target-field]]
                                       (and fk-field target-field (nil? (:fk_target_field_id fk-field)))))
                             (map (fn [[fk-field :as link]] [(:id fk-field) link])))
                       links)
        settings (u/index-by :field_id (pages/in-batches sync.db/field-user-settings-of-fields (vec (keys empty-fk))))
        cleared? (fn [[field-id]]
                   (contains? (warehouse-schema.user-settings/user-set-field-columns (settings field-id))
                              :fk_target_field_id))
        fillable (into {} (remove cleared?) empty-fk)
        skipped  (count (remove (fn [[fk-field target-field]] (and fk-field target-field)) links))]
    (when (pos? skipped)
      (log/warnf "Skipped %d FK links of Database %d: this Metabase does not have the Field or its target"
                 skipped database-id))
    (when (seq fillable)
      (field/update-fields! (for [[field-id [_fk-field target-field]] fillable]
                              {:id field-id :fk_target_field_id (:id target-field)}))
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
                   {:field_id field-id :type :full :values values :has_more_values (true? has_more_values)})})

(defn- apply-stats!
  "Apply the stats of `batch` to the Tables of the Database with `database-id` that have its keys, each once."
  [database-id {:keys [tables]}]
  (let [receiving  (tables-by-key database-id (map pages/table-key tables))
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

(defn- check-format-version [response]
  (let [version (:format_version response)]
    (when (not= wire/format-version version)
      (throw (refused (if (int? version)
                        (tru "The other Metabase sends format version {0}, and this Metabase reads version {1}."
                             (str version) (str wire/format-version))
                        (tru "The other Metabase sends no format version. This Metabase reads version {0}."
                             (str wire/format-version)))
                      "metadata-sync-format-version-differs")))))

(defn- check-shape [response]
  (when-not (mr/validate ::wire/envelope response)
    (throw (refused (tru "The answer of the other Metabase does not have the shape this version applies.")
                    "metadata-sync-malformed-response"))))

(defn- check-database [database response]
  (when-not (and (= (:name database) (:database response))
                 (= (u/qualified-name (:engine database)) (:engine response)))
    (throw (refused (tru "The answer of the other Metabase is for another Database than {0}."
                         (pr-str (:name database)))
                    "metadata-sync-answer-of-another-database"))))

(defn- check-response
  "Throw unless `response` is an answer this version can apply to `database`: of its format version, with the
  envelope of an answer, and for this Database by name and engine. An entry it cannot read, and what it does not know
  or take, is left out, not refused (see [[accept/accepted-response]]). No error repeats a value of the answer: they are
  warehouse metadata."
  [database response]
  (check-format-version response)
  (check-shape response)
  (check-database database response))

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
   [:left_out              :int]
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
  "Apply the other Metabase's `response` to a [[request]] for the Database with `database-id`, and return the cursor
  of the next request (`:next`), when there is one, and counts of what it did.

  Before any write it refuses, with an `:error-code` in the ex-data, an answer of a format version it does not read,
  one without the envelope of an answer, and one that is for another Database. It leaves out what only a newer sender
  sends, what it does not take, and what it cannot read, and counts it: a key, batch type or link kind it does not
  know, a value (`values_dropped`), such as one longer than its column, a Table, with its Fields, that it takes no row
  for or cannot read (`tables_skipped`), and a batch, link or stats entry (`left_out`). A null is a key left out. A
  base type it does not know is the unknown type, as sync gives one. An answer is applied in one transaction, so one
  that fails while it is written writes nothing (`metadata-sync-apply-failed`), and can be sent again. Each Table a
  seed inserts counts as synced at once; once an answer has no next cursor, the Database counts as synced too. An
  answer with no batches and no cursor therefore marks the Database as synced, also when it has no Tables."
  [database-id :- ::lib.schema.id/database
   response    :- [:map {:description "the other Metabase's answer, decoded from JSON, which this checks"}]]
  (let [database (receiving-database database-id)]
    (check-response database response)
    (let [{accepted :response left-out :counts} (accept/accepted-response database-id response)
          counts (merge-with + (apply-batches! database (:batches accepted) (nil? (:next response))) left-out)]
      (cond-> {:counts counts}
        (:next response) (assoc :next (:next response))))))
