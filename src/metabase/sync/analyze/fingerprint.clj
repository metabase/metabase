(ns metabase.sync.analyze.fingerprint
  "Analysis sub-step that takes a sample of values for a Field and saving a non-identifying fingerprint
   used for classification. This fingerprint is saved as a column on the Field it belongs to."
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [redux.core :as redux]))

(defn incomplete-analysis-kvs
  "Key-value pairs corresponding to the state of Fields that have the latest fingerprint, but have not yet
   *completed* analysis. All Fields who get new fingerprints should get marked as having the latest fingerprint
   version, but we'll clear their values for `last_analyzed`. This way we know these fields haven't 'completed'
   analysis for the latest fingerprints. This is a function because `*latest-fingerprint-version* may be rebound
   in tests."
  []
  {:fingerprint_version i/*latest-fingerprint-version*
   :last_analyzed       nil})

(mu/defn- mark-fingerprinting-failed!
  "Advance `fingerprint_version` to the latest version for `fields` without saving a fingerprint. Called when
  fingerprinting fails for a non-transient reason, so that the Fields are not re-selected by [[fields-to-fingerprint]]
  and retried on every subsequent sync. Transient failures (see [[metabase.sync.util/transient-exception?]]) are
  left untouched so they are retried."
  [fields :- [:maybe [:sequential i/FieldInstance]]]
  (when-let [ids (seq (map u/the-id fields))]
    (field/update-fields! (for [id (vec ids)] {:id id :fingerprint_version i/*latest-fingerprint-version*}) {:fields fields})))

(defn- fingerprint-outcome
  "What fingerprinting a Field gave, `fingerprint` being a Throwable when it failed: the stat it counts under."
  [fingerprint]
  (cond
    (instance? Throwable fingerprint)                  :failed-fingerprints
    (some-> fingerprint :global :distinct-count zero?) :no-data-fingerprints
    :else                                              :updated-fingerprints))

(defn- fingerprint-row
  "The update row of `field` for its `fingerprint`: a failure only advances its fingerprint version, a Field with no data
  gets none."
  [field fingerprint]
  (case (fingerprint-outcome fingerprint)
    :failed-fingerprints  {:id (:id field) :fingerprint_version i/*latest-fingerprint-version*}
    :no-data-fingerprints nil
    :updated-fingerprints (do (log/debugf "Saving fingerprint for %s" (sync-util/name-for-logging field))
                              (assoc (incomplete-analysis-kvs) :id (:id field) :fingerprint fingerprint))))

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

(defn- save-fingerprints!
  "Write the `fingerprints` of `fields`, in the same order, in one update, and return their stats."
  [fields fingerprints]
  (let [pairs (map vector fields fingerprints)]
    (when-let [rows (not-empty (into [] (keep (fn [[field fingerprint]] (fingerprint-row field fingerprint))) pairs))]
      (field/update-fields! rows {:fields (vec fields)}))
    (reduce (fn [stats [_ fingerprint]] (update stats (fingerprint-outcome fingerprint) inc))
            (empty-stats-map (count fingerprints))
            pairs)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *truncation-size*
  "The maximum size of :type/Text to be selected from the database in `table-rows-sample`. In practice we see large
  text blobs and want to balance taking enough for distinct counts and but not so much that we risk out of memory
  issues when syncing."
  1234)

(mu/defn- fingerprint-fields!
  [table  :- i/TableInstance
   fields :- [:maybe [:sequential i/FieldInstance]]]
  (let [rff (fn [_metadata]
              (redux/post-complete
               (analyze/fingerprint-fields fields)
               (fn [fingerprints]
                 (save-fingerprints! fields fingerprints))))
        driver (driver.u/database->driver (:db_id table))
        opts {:truncation-size *truncation-size*}]
    (tracing/with-span :sync "sync.fingerprint.sample" {:sync/table (:name table) :sync/field-count (count fields)}
      (driver/table-rows-sample driver table fields rff opts))))

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

(mu/defn- fields-to-fingerprint :- [:maybe [:sequential i/FieldInstance]]
  "Return up to `limit` Fields belonging to `table` for which we should generate (and save) fingerprints, ordered by
  id so the selection is stable across syncs. This should include NEW fields that are active and visible."
  [table :- i/TableInstance
   limit :- ms/PositiveInt]
  (seq (sync.db/fields-needing-fingerprint-update
        (u/the-id table)
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

(mu/defn- fingerprint-fields-of-table!
  "Fingerprint the (non-empty) `fields` of `table`. On a non-transient error, advance their fingerprint version so we
  don't re-attempt every sync; transient errors are left untouched to retry next sync."
  [table  :- i/TableInstance
   fields :- [:sequential i/FieldInstance]]
  (log/infof "Fingerprinting %s fields in table %s" (count fields) (sync-util/name-for-logging table))
  (let [stats (sync-util/with-returning-throwable (format "Error fingerprinting %s" (sync-util/name-for-logging table))
                (fingerprint-fields! table fields))]
    (if-let [throwable (:throwable stats)]
      (do
        (when-not (sync-util/transient-exception? throwable)
          (mark-fingerprinting-failed! fields))
        (merge (empty-stats-map 0) stats))
      stats)))

(mu/defn fingerprint-table!
  "Generate and save fingerprints for the Fields in `table` that have not been previously analyzed. At most
  [[metabase.sync.settings/fingerprint-max-fields-per-table]] fields are processed; if the table has more eligible
  fields, the rest are skipped (with a warning) so we don't load a huge number of Fields into memory at once."
  [table :- i/TableInstance]
  (tracing/with-span :sync "sync.fingerprint.table" {:db/id (:db_id table) :sync/table (:name table)}
    (let [limit  (sync.settings/fingerprint-max-fields-per-table)
          fields (fields-to-fingerprint table (inc limit))]
      (when (> (count fields) limit)
        (warn-too-many-fields! table limit))
      (if-let [fields (seq (take limit fields))]
        (fingerprint-fields-of-table! table fields)
        (empty-stats-map 0)))))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :nil])

(mu/defn- fingerprint-fields-for-db!*
  "Invokes `fingerprint-table!` on every table in `database`"
  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn]
   (fingerprint-fields-for-db!* database log-progress-fn (constantly true)))

  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn
    continue?       :- [:=> [:cat ::FingerprintStats] :boolean]]
   (let [tables (if *refingerprint?*
                  (sync-util/refingerprint-reducible-sync-tables database)
                  (sync-util/reducible-sync-tables database))]
     (reduce (fn [acc table]
               (log-progress-fn (if *refingerprint?* "refingerprint-fields" "fingerprint-fields") table)
               (let [ret (fingerprint-table! table)
                     new-acc (let [ret (if (:throwable ret)
                                         (-> ret
                                             (dissoc :throwable)
                                             (update :failed-fingerprints inc))
                                         ret)]
                               (merge-with + acc ret))]
                 (if (and (continue? new-acc) (not (sync-util/abandon-sync? ret)))
                   new-acc
                   (reduced new-acc))))
             (empty-stats-map 0)
             tables))))

(mu/defn fingerprint-fields-for-db!
  "Invokes [[fingerprint-table!]] on every table in `database`"
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (if (driver.u/supports? (:engine database) :fingerprint database)
    (fingerprint-fields-for-db!* database log-progress-fn)
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
    (fingerprint-fields-for-db!* database
                                 log-progress-fn
                                 (fn [stats-acc]
                                   (< (:fingerprints-attempted stats-acc) max-refingerprint-field-count)))))

(mu/defn refingerprint-field!
  "Refingerprint a field"
  [field :- i/FieldInstance]
  (let [table (field/table field)]
    (fingerprint-fields! table [field])))
