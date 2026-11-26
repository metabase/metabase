(ns metabase.sync.analyze.fingerprint
  "Analysis sub-step that takes a sample of values for a Field and saving a non-identifying fingerprint
   used for classification. This fingerprint is saved as a column on the Field it belongs to."
  (:require
   [java-time.api :as t]
   [metabase.analyze.core :as analyze]
   [metabase.driver.util :as driver.u]
   [metabase.sync.analyze.sample :as sample]
   [metabase.sync.analyze.table-chunks :as table-chunks]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.updates :as sync.updates]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]))

(defn incomplete-analysis-kvs
  "Key-value pairs corresponding to the state of Fields that have the latest fingerprint, but have not yet
   *completed* analysis. All Fields who get new fingerprints should get marked as having the latest fingerprint
   version, but we'll clear their values for `last_analyzed`. This way we know these fields haven't 'completed'
   analysis for the latest fingerprints. This is a function because `*latest-fingerprint-version* may be rebound
   in tests."
  []
  {:fingerprint_version i/*latest-fingerprint-version*
   :last_analyzed       nil})

(defn- failed-row
  "The update row that advances the fingerprint version of `field` without saving a fingerprint, so that a Field whose
  fingerprinting failed for a non-transient reason is not re-selected and retried on every sync."
  [field]
  {:id (:id field) :fingerprint_version i/*latest-fingerprint-version*})

(defn- fingerprint-outcome
  "What fingerprinting a Field gave, `fingerprint` being a Throwable when it failed: the stat it counts under."
  [fingerprint]
  (cond
    (instance? Throwable fingerprint)                  :failed-fingerprints
    (some-> fingerprint :global :distinct-count zero?) :no-data-fingerprints
    :else                                              :updated-fingerprints))

(defn- fingerprint-row
  "The update row of `field` for its `fingerprint`, which came from `origin`: a failure only advances its fingerprint
  version, a Field with no data gets none."
  [origin field fingerprint]
  (case (fingerprint-outcome fingerprint)
    :failed-fingerprints  (failed-row field)
    :no-data-fingerprints nil
    :updated-fingerprints (do (log/debugf "Saving fingerprint for %s" (sync-util/name-for-logging field))
                              (assoc (incomplete-analysis-kvs)
                                     :id                 (:id field)
                                     :fingerprint        fingerprint
                                     :fingerprint_origin origin))))

(defn- sample-origin
  "The origin of the fingerprints from a sample of `table`, as [[sample/sample]] describes it."
  [table {:keys [method fraction runs]}]
  (cond-> {:source       :sample
           :method       method
           :row-count    (:estimated_row_count table)
           :collected-at (str (t/instant))}
    fraction (assoc :fraction fraction)
    runs     (assoc :runs runs)))

(mr/def ::FingerprintStats
  [:map {:closed true}
   [:no-data-fingerprints   ms/IntGreaterThanOrEqualToZero]
   [:failed-fingerprints    ms/IntGreaterThanOrEqualToZero]
   [:updated-fingerprints   ms/IntGreaterThanOrEqualToZero]
   [:fingerprints-attempted ms/IntGreaterThanOrEqualToZero]])

(mu/defn empty-stats-map :- ::FingerprintStats
  "The default stats before any fingerprints happen"
  [fields-count :- ms/IntGreaterThanOrEqualToZero]
  {:no-data-fingerprints   0
   :failed-fingerprints    0
   :updated-fingerprints   0
   :fingerprints-attempted fields-count})

(mu/defn- save-fingerprints!
  "Write `rows`, the update rows of the fingerprints of `fields`, in one update."
  [rows   :- [:sequential :map]
   fields :- [:sequential i/FieldInstance]]
  (when (seq rows)
    (sync.updates/update-fields! rows {:fields (vec fields)})))

(defn- fingerprint-stats
  "The stats of `fingerprints`, those of the Fields of one sample."
  [fingerprints]
  (reduce (fn [stats fingerprint] (update stats (fingerprint-outcome fingerprint) inc))
          (empty-stats-map (count fingerprints))
          fingerprints))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *truncation-size*
  "The maximum size of :type/Text to be selected from the database in `table-rows-sample`. In practice we see large
  text blobs and want to balance taking enough for distinct counts and but not so much that we risk out of memory
  issues when syncing."
  1234)

(mu/defn- sample-fingerprints
  "The fingerprints of `fields` of `table` from a sample of its rows: `:rows`, the update rows that save them, and
  `:stats`."
  [table  :- i/TableInstance
   fields :- [:maybe [:sequential i/FieldInstance]]]
  (let [rff                          (fn [_metadata]
                                       (analyze/fingerprint-fields fields))
        opts                         {:truncation-size *truncation-size*}
        no-data?                     (fn [fingerprints]
                                       (every? #(= :no-data-fingerprints (fingerprint-outcome %)) fingerprints))
        {fingerprints :result :as how} (tracing/with-span :sync "sync.fingerprint.sample" {:sync/table       (:name table)
                                                                                           :sync/field-count (count fields)}
                                         (let [how (sample/sample table fields rff opts)]
                                           ;; A better sample with no rows, for example of a table whose row count
                                           ;; estimate is old, gives no fingerprints; the first rows may have some. A sample that
                                           ;; is already the first rows is not read again.
                                           (if (and (not (#{:unspecified :first-rows} (:method how)))
                                                    (no-data? (:result how)))
                                             (sample/first-rows-sample table fields rff opts)
                                             how)))]
    {:rows  (into [] (keep identity) (map (partial fingerprint-row (sample-origin table how)) fields fingerprints))
     :stats (fingerprint-stats fingerprints)}))

(mu/defn- fingerprint-fields!
  "Fingerprint `fields` of `table` from a sample of its rows and save the fingerprints, returning their stats."
  [table  :- i/TableInstance
   fields :- [:maybe [:sequential i/FieldInstance]]]
  (let [{:keys [rows stats]} (sample-fingerprints table fields)]
    (save-fingerprints! rows (vec fields))
    stats))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    WHICH FIELDS NEED UPDATED FINGERPRINTS?                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *refingerprint?*
  "Whether we are refingerprinting or doing the normal fingerprinting. Refingerprinting should get fields that already
  are analyzed and have fingerprints."
  false)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      FINGERPRINTING ALL FIELDS IN A TABLE                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- fields-to-fingerprint :- [:map-of :int [:sequential i/FieldInstance]]
  "Up to `limit` Fields of each of `tables` to fingerprint, new active and visible ones included, by Table id, ordered
  by id so that the selection is stable across syncs."
  [tables :- [:sequential i/TableInstance]
   limit  :- ms/PositiveInt]
  (group-by :table_id (analyze/fields-to-fingerprint (mapv :id tables)
                                                     *refingerprint?*
                                                     i/*fingerprint-version->types-that-should-be-re-fingerprinted*
                                                     limit)))

(mu/defn- warn-too-many-fields!
  "Log that `table` has more fields to fingerprint than fingerprint-max-fields-per-table (`limit`), so only the first
  `limit` are fingerprinted and the rest skipped -- fingerprinting that many Fields at once can exhaust the heap (this
  has OOM'd instances syncing document databases like Mongo with very large/dynamic schemas)."
  [table :- i/TableInstance
   limit :- ms/PositiveInt]
  (log/warnf (str "Table %s has more than fingerprint-max-fields-per-table (%d) fields to fingerprint; fingerprinting "
                  "the first %d and skipping the rest. Raise MB_FINGERPRINT_MAX_FIELDS_PER_TABLE to fingerprint more.")
             (sync-util/name-for-logging table) limit limit))

(defn- table-fingerprints
  "The fingerprints of the first `limit` of `fields` of `table`, unsaved, as `:rows` (the update rows that save them)
  and `:stats`, where a non-transient error makes the rows advance the fingerprint version of the Fields and a
  transient one leaves them for the next sync."
  [table fields limit]
  (tracing/with-span :sync "sync.fingerprint.table" {:db/id (:db_id table) :sync/table (:name table)}
    (when (> (count fields) limit)
      (warn-too-many-fields! table limit))
    (let [fields (vec (take limit fields))]
      (if (empty? fields)
        {:table table :fields fields :rows [] :stats (empty-stats-map 0)}
        (let [_         (log/infof "Fingerprinting %s fields in table %s" (count fields) (sync-util/name-for-logging table))
              sample    (sync-util/with-returning-throwable (format "Error fingerprinting %s" (sync-util/name-for-logging table))
                          (sample-fingerprints table fields))
              throwable (:throwable sample)]
          {:table  table
           :fields fields
           :rows   (cond
                     (nil? throwable)                           (:rows sample)
                     (sync-util/transient-exception? throwable) []
                     :else                                      (mapv failed-row fields))
           :stats  (if throwable
                     (merge (empty-stats-map 0) sample)
                     (:stats sample))})))))

(defn- save-table-fingerprints!
  "Save the rows of `result`, the fingerprints of one Table, returning it with the stats of a failure when that fails,
  after advancing the fingerprint version of its Fields unless the failure is transient."
  [{:keys [table fields rows] :as result}]
  (let [saved (sync-util/with-returning-throwable (format "Error fingerprinting %s" (sync-util/name-for-logging table))
                (save-fingerprints! rows fields))]
    (if-let [throwable (:throwable saved)]
      (do (when-not (sync-util/transient-exception? throwable)
            (save-fingerprints! (mapv failed-row fields) fields))
          (assoc result :stats (merge (empty-stats-map 0) saved)))
      result)))

(defn- save-fingerprints-of-tables!
  "Save the rows of `results`, the fingerprints of some Tables, with one call, or Table by Table when that fails,
  returning the results."
  [results]
  (if (and (next results)
           (not (sync-util/rethrow-fatal
                 (:throwable (sync-util/with-returning-throwable "Error saving fingerprints"
                               (save-fingerprints! (into [] (mapcat :rows) results)
                                                   (into [] (mapcat :fields) results)))))))
    results
    (mapv save-table-fingerprints! results)))

(mu/defn fingerprint-table!
  "Generate and save fingerprints for the Fields in `table` that have not been previously analyzed. At most
  [[metabase.sync.settings/fingerprint-max-fields-per-table]] fields are processed; if the table has more eligible
  fields, the rest are skipped (with a warning) so we don't load a huge number of Fields into memory at once."
  [table :- i/TableInstance]
  (let [limit  (sync.settings/fingerprint-max-fields-per-table)
        fields (get (fields-to-fingerprint [table] (inc limit)) (:id table))]
    (:stats (first (save-fingerprints-of-tables! [(table-fingerprints table fields limit)])))))

(defn- add-table-stats
  "`acc` with the `stats` of one Table added, a failure of the Table counting as one failed fingerprint."
  [acc stats]
  (merge-with + acc (if (:throwable stats)
                      (-> stats
                          (dissoc :throwable)
                          (update :failed-fingerprints inc))
                      stats)))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :nil])

(defn- fingerprint-group!
  "Fingerprint the Tables of `group` one by one and save their fingerprints at once, returning `acc` with their stats
  added, `reduced` once `continue?` says to stop or a Table could not reach its database."
  [acc group log-progress-fn continue?]
  (let [limit                    (sync.settings/fingerprint-max-fields-per-table)
        table-id->fields         (fields-to-fingerprint group (inc limit))
        step                     (if *refingerprint?* "refingerprint-fields" "fingerprint-fields")
        {:keys [results stop?]}  (reduce (fn [{:keys [results running]} table]
                                           (log-progress-fn step table)
                                           (let [result  (table-fingerprints table (table-id->fields (:id table)) limit)
                                                 running (add-table-stats running (:stats result))
                                                 state   {:results (conj results result) :running running}]
                                             (if (and (continue? running) (not (sync-util/abandon-sync? (:stats result))))
                                               state
                                               (reduced (assoc state :stop? true)))))
                                         {:results [] :running acc}
                                         group)
        acc                      (transduce (map :stats) (completing add-table-stats) acc
                                            (save-fingerprints-of-tables! results))]
    (cond-> acc
      stop? reduced)))

(mu/defn- fingerprint-fields-for-db!*
  "Fingerprint the Fields of every table in `database`, reading and saving the Fields of a group of Tables at once."
  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn]
   (fingerprint-fields-for-db!* database log-progress-fn (constantly true)))

  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn
    continue?       :- [:=> [:cat ::FingerprintStats] :boolean]]
   (let [tables (if *refingerprint?*
                  (sync-util/refingerprint-reducible-sync-tables database)
                  (sync-util/reducible-sync-tables database))
         groups (table-chunks/groups tables
                                     #(analyze/fingerprint-field-counts
                                       % *refingerprint?* i/*fingerprint-version->types-that-should-be-re-fingerprinted*)
                                     (inc (sync.settings/fingerprint-max-fields-per-table)))]
     (reduce (fn [acc group] (fingerprint-group! acc group log-progress-fn continue?))
             (empty-stats-map 0)
             groups))))

(mu/defn fingerprint-fields-for-db!
  "Fingerprint the Fields of every table in `database` whose driver supports fingerprinting."
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (if (driver.u/supports? (:engine database) :fingerprint database)
    (sample/do-with-better-sample-run #(fingerprint-fields-for-db!* database log-progress-fn))
    (empty-stats-map 0)))

(def ^:private max-refingerprint-field-count
  "Maximum number of fields to refingerprint. Balance updating our fingerprinting values while not spending too much
  time in the db."
  1000)

(mu/defn refingerprint-fields-for-db!
  "Invokes [[fingeprint-fields!]] on every table in `database` up to some limit."
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (binding [*refingerprint?* true]
    (sample/do-with-better-sample-run
     #(fingerprint-fields-for-db!* database
                                   log-progress-fn
                                   (fn [stats-acc]
                                     (< (:fingerprints-attempted stats-acc) max-refingerprint-field-count))))))

(mu/defn refingerprint-field!
  "Refingerprint a field"
  [field :- i/FieldInstance]
  (let [table (field/table field)]
    (fingerprint-fields! table [field])))
