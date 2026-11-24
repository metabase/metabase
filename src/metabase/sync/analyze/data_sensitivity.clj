(ns metabase.sync.analyze.data-sensitivity
  "Analyze sub-step that labels Fields with a `data_sensitivity` category from
  [[metabase.analyze.core/infer-data-sensitivity]], writing `:PUBLIC` when no rule matches so each field is scanned
  once. Selects fields whose `data_sensitivity` is `NULL` (or `PUBLIC` too under `force?`) across every active table
  in the database, hidden and cruft tables included. Inert unless [[metabase.sync.settings/data-sensitivity-scan-enabled]]
  is true, except through [[scan-data-sensitivity!]]. Fields with a label a user set in `FieldUserSettings` are never
  scanned. [[reset-data-sensitivity!]] clears the classifier's own labels so a rule change can reach fields that
  already carry a category."
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.analyze.table-chunks :as table-chunks]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field :as field]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private Stats
  [:map
   [:fields-scanned :int]
   [:fields-labeled :int]
   [:fields-failed  :int]
   [:fields-reset   {:optional true} :int]])

(def ^:private zero-stats
  {:fields-scanned 0 :fields-labeled 0 :fields-failed 0})

(def ^:private ScanOptions
  [:map {:closed true}
   [:force?          {:optional true} [:maybe :boolean]]
   [:ignore-setting? {:optional true} [:maybe :boolean]]])

(defn- skip? [ignore-setting?]
  (and (not ignore-setting?)
       (not (sync.settings/data-sensitivity-scan-enabled))))

(mu/defn- fields-to-scan :- [:sequential i/FieldInstance]
  "A page of the unscanned Fields of `tables`, after `after-id`."
  [tables   :- [:sequential i/TableInstance]
   force?   :- [:maybe :boolean]
   after-id :- :int]
  (analyze/data-sensitivity-fields (mapv :id tables) (boolean force?) after-id table-chunks/fields-per-read))

(mu/defn- classify
  "The inferred category of `field`, nil when no rule matched, or the Exception classifying it threw, which is logged."
  [field :- i/FieldInstance
   table :- i/TableInstance]
  (sync-util/with-error-handling (format "Error classifying data sensitivity for %s" (sync-util/name-for-logging field))
    (analyze/infer-data-sensitivity field {:name (:name table) :entity_type (:entity_type table)})))

(defn- save-pairs!
  "Write `pairs`, each a Field and its update row, with one call."
  [pairs]
  (field/update-fields! (mapv second pairs) {:fields (mapv first pairs)}))

(defn- save-categories!
  "Write the category of each of `results`, `[field category]` pairs of Fields of `tables`, `:PUBLIC` for nil, with
  one call, or Table by Table when that fails, leaving out the Fields whose classification threw, and return `results`
  with `::not-saved` as the result of the Fields of the Tables whose write failed."
  [tables results]
  (let [pairs  (into []
                     (keep (fn [[field category]]
                             (when-not (instance? Exception category)
                               [field {:id (:id field) :data_sensitivity (or category :PUBLIC)}])))
                     results)
        failed (if (seq pairs)
                 (table-chunks/save-by-table! "the data sensitivity" (table-chunks/table-name tables) (comp :table_id first)
                                              save-pairs! pairs)
                 #{})]
    (mapv (fn [[field result :as pair]]
            (if (and (contains? failed (:table_id field)) (not (instance? Exception result)))
              [field ::not-saved]
              pair))
          results)))

(defn- failed?
  "Whether `result` is a classification that threw or a category whose write failed."
  [result]
  (or (instance? Exception result) (= ::not-saved result)))

(defn- add-result
  "`stats` with the classification `result` of `field` counted and logged."
  [stats [field result]]
  (log/debugf "Data sensitivity for %s: %s" (sync-util/name-for-logging field)
              (if (failed? result) "failed" (or result :PUBLIC)))
  (cond-> (update (or stats zero-stats) :fields-scanned inc)
    (failed? result)                               (update :fields-failed inc)
    (and (keyword? result) (not (failed? result))) (update :fields-labeled inc)))

(mu/defn- scan-tables! :- [:sequential Stats]
  "Label every unscanned Field of `tables`, reading and saving them a page at a time, logging the stats of each Table
  with any, and return the stats of each of `tables`."
  [tables :- [:sequential i/TableInstance]
   force? :- [:maybe :boolean]]
  (let [id->table       (into {} (map (juxt :id identity)) tables)
        table-id->stats (loop [after-id 0
                               table-id->stats {}]
                          (if-let [fields (not-empty (fields-to-scan tables force? after-id))]
                            (let [results (save-categories! tables (mapv (fn [field] [field (classify field (id->table (:table_id field)))])
                                                                         fields))]
                              (recur (:id (last fields))
                                     (reduce (fn [acc [field :as pair]] (update acc (:table_id field) add-result pair))
                                             table-id->stats
                                             results)))
                            table-id->stats))]
    (mapv (fn [table]
            (u/prog1 (get table-id->stats (:id table) zero-stats)
              (when (pos? (:fields-scanned <>))
                (log/infof "Data sensitivity scanned %d fields in %s: %d labeled, %d failed"
                           (:fields-scanned <>) (sync-util/name-for-logging table)
                           (:fields-labeled <>) (:fields-failed <>)))))
          tables)))

(mu/defn scan-table! :- Stats
  "Label every unscanned Field in `table`, returning stats where `fields-scanned` counts every selected Field,
  `fields-labeled` those that matched a category and `fields-failed` those whose classification or write threw, the
  remainder being written `:PUBLIC`."
  [table :- i/TableInstance
   & {:keys [force? ignore-setting?]} :- [:maybe ScanOptions]]
  (if (skip? ignore-setting?)
    zero-stats
    (first (scan-tables! [table] force?))))

(mu/defn- table-ids-with-unscanned-fields :- [:maybe [:set pos-int?]]
  [database :- i/DatabaseInstance
   force?   :- [:maybe :boolean]]
  (sync.db/table-ids-with-fields-to-scan-for-data-sensitivity (u/the-id database) force?))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :nil])

(mu/defn scan-fields-for-db! :- Stats
  "Label every unscanned Field in every active table of `database`. `log-fn` is accepted for parity with the other
  analyze steps and not called: the step reports per table through the log, not the progress bar."
  [database :- i/DatabaseInstance
   _log-fn  :- [:maybe LogProgressFn]
   & {:keys [force? ignore-setting?]} :- [:maybe ScanOptions]]
  (if (skip? ignore-setting?)
    zero-stats
    (let [table-ids (table-ids-with-unscanned-fields database force?)]
      (if (empty? table-ids)
        zero-stats
        (transduce (mapcat #(scan-tables! % force?))
                   (partial merge-with +)
                   zero-stats
                   (table-chunks/chunks (eduction (map t2.realize/realize)
                                                  (sync.db/tables-by-schema-and-name-reducible table-ids))))))))

(defn- clear-classifier-labels!
  "Clear the `data_sensitivity` of the Fields with `field-ids` in one update and return their number."
  [field-ids]
  (field/update-fields! (for [id field-ids] {:id id :data_sensitivity nil}))
  (count field-ids))

(mu/defn reset-data-sensitivity! :- :int
  "REPL entry point: clear every classifier-written `data_sensitivity` in the Database with `database-id` so the next
  scan recomputes them, including fields that carry a category and would otherwise never be reselected. Labels with
  a value in the `FieldUserSettings` mirror are human-set and untouched. Returns the number of fields cleared."
  [database-id :- ::lib.schema.id/database]
  (let [n (clear-classifier-labels! (sync.db/classifier-data-sensitivity-field-ids-of-database database-id))]
    (log/infof "Data sensitivity reset %d classifier-written labels in %s"
               n (sync-util/name-for-logging (driver.u/lib-database database-id)))
    n))

(mu/defn reset-table-data-sensitivity! :- :int
  "Like [[reset-data-sensitivity!]], for a single `table`."
  [table :- i/TableInstance]
  (let [n (clear-classifier-labels! (sync.db/classifier-data-sensitivity-field-ids-of-table (u/the-id table)))]
    (log/infof "Data sensitivity reset %d classifier-written labels in %s" n (sync-util/name-for-logging table))
    n))

(def ^:private ScanDataSensitivityOptions
  [:maybe [:map {:closed true}
           [:force? {:optional true} [:maybe :boolean]]
           [:reset? {:optional true} [:maybe :boolean]]]])

(mu/defn scan-data-sensitivity! :- Stats
  "Scan the Database with `database-id` for data sensitivity regardless of the setting; `:force?` rescans `:PUBLIC`
  Fields and `:reset?` clears the classifier's labels first."
  [database-id                 :- ::lib.schema.id/database
   & {:keys [force? reset?]}   :- ScanDataSensitivityOptions]
  (let [reset (when reset? (reset-data-sensitivity! database-id))
        stats (scan-fields-for-db! (driver.u/lib-database database-id) (constantly nil)
                                   :force? force? :ignore-setting? true)]
    (cond-> stats
      reset (assoc :fields-reset reset))))

(mu/defn scan-table-data-sensitivity! :- Stats
  "Like [[scan-data-sensitivity!]], for a single `table`."
  [table                     :- i/TableInstance
   & {:keys [force? reset?]} :- ScanDataSensitivityOptions]
  (let [reset (when reset? (reset-table-data-sensitivity! table))
        stats (scan-table! table :force? force? :ignore-setting? true)]
    (cond-> stats
      reset (assoc :fields-reset reset))))
