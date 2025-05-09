(ns metabase.sync.analyze.fingerprint
  "Analysis sub-step that takes a sample of values for a Field and saving a non-identifying fingerprint
   used for classification. This fingerprint is saved as a column on the Field it belongs to."
  (:require
   [clojure.set :as set]
   [honey.sql.helpers :as sql.helpers]
   [metabase.analyze.classifiers.name :as name]
   [metabase.analyze.core :as analyze]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.db.query :as mdb.query]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  metadata-queries/keep-me-for-default-table-row-sample)

(defn incomplete-analysis-kvs
  "Key-value pairs corresponding to the state of Fields that have the latest fingerprint, but have not yet
   *completed* analysis. All Fields who get new fingerprints should get marked as having the latest fingerprint
   version, but we'll clear their values for `last_analyzed`. This way we know these fields haven't 'completed'
   analysis for the latest fingerprints. This is a function because `*latest-fingerprint-version* may be rebound
   in tests."
  []
  {:fingerprint_version i/*latest-fingerprint-version*
   :last_analyzed       nil})

(mu/defn- save-fingerprint!
  [field       :- i/FieldInstance
   fingerprint :- [:maybe analyze/Fingerprint]]
  (log/debugf "Saving fingerprint for %s" (sync-util/name-for-logging field))
  (t2/update! :model/Field (u/the-id field) (merge (incomplete-analysis-kvs) {:fingerprint fingerprint})))

(mr/def ::FingerprintStats
  [:map
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

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private ^:dynamic *truncation-size*
  "The maximum size of :type/Text to be selected from the database in `table-rows-sample`. In practice we see large
  text blobs and want to balance taking enough for distinct counts and but not so much that we risk out of memory
  issues when syncing."
  1234)

(mu/defn- fingerprint-fields!
  [table  :- i/TableInstance
   fields :- [:maybe [:sequential i/FieldInstance]]]
  ;; Skip fetching sample data and just apply name-based classification
  (log/debugf "Applying name classification without fingerprinting for %s fields in table %s" (count fields) (sync-util/name-for-logging table))
  (let [updated-count (reduce (fn [counter field]
                                (let [semantic-type (name/infer-semantic-type-by-name field)]
                                  (if semantic-type
                                    (do
                                      (log/debugf "Applied semantic type %s to field %s based on name"
                                                  semantic-type (sync-util/name-for-logging field))
                                      (save-fingerprint! field {:global {:distinct-count 0}})
                                      (t2/update! :model/Field (u/the-id field) {:semantic_type semantic-type})
                                      (inc counter))
                                    counter)))
                              0
                              fields)]
    (assoc (empty-stats-map (count fields))
           :updated-fingerprints updated-count)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    WHICH FIELDS NEED UPDATED FINGERPRINTS?                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Logic for building the somewhat-complicated query we use to determine which Fields need new Fingerprints
;;
;; This ends up giving us a SQL query that looks something like:
;;
;; SELECT *
;; FROM metabase_field
;; WHERE active = true
;;   AND (semantic_type NOT IN ('type/PK') OR semantic_type IS NULL)
;;   AND preview_display = true
;;   AND visibility_type <> 'retired'
;;   AND table_id = 1
;;   AND ((fingerprint_version < 1 AND
;;         base_type IN ("type/Longitude", "type/Latitude", "type/Integer"))
;;        OR
;;        (fingerprint_version < 2 AND
;;         base_type IN ("type/Text", "type/SerializedJSON")))

(mu/defn- base-types->descendants :- [:maybe [:set ms/FieldTypeKeywordOrString]]
  "Given a set of `base-types` return an expanded set that includes those base types as well as all of their
  descendants. These types are converted to strings so HoneySQL doesn't confuse them for columns."
  [base-types :- [:set ms/FieldType]]
  (into #{}
        (comp (mapcat (fn [base-type]
                        (cons base-type (descendants base-type))))
              (map u/qualified-name))
        base-types))

;; It's even cooler if we could generate efficient SQL that looks at what types have already
;; been marked for upgrade so we don't need to generate overly-complicated queries.
;;
;; e.g. instead of doing:
;;
;; WHERE ((version < 2 AND base_type IN ("type/Integer", "type/BigInteger", "type/Text")) OR
;;        (version < 1 AND base_type IN ("type/Boolean", "type/Integer", "type/BigInteger")))
;;
;; we could do:
;;
;; WHERE ((version < 2 AND base_type IN ("type/Integer", "type/BigInteger", "type/Text")) OR
;;        (version < 1 AND base_type IN ("type/Boolean")))
;;
;; (In the example above, something that is a `type/Integer` or `type/Text` would get upgraded
;; as long as it's less than version 2; so no need to also check if those types are less than 1, which
;; would always be the case.)
;;
;; This way we can also completely omit adding clauses for versions that have been "eclipsed" by others.
;; This would keep the SQL query from growing boundlessly as new fingerprint versions are added
(mu/defn- versions-clauses :- [:maybe [:sequential :any]]
  []
  ;; keep track of all the base types (including descendants) for each version, starting from most recent
  (let [versions+base-types (reverse (sort-by first (seq i/*fingerprint-version->types-that-should-be-re-fingerprinted*)))
        already-seen        (atom #{})]
    (for [[version base-types] versions+base-types
          :let  [descendants  (base-types->descendants base-types)
                 not-yet-seen (set/difference descendants @already-seen)]
          ;; if all the descendants of any given version have already been seen, we can skip this clause altogether
          :when (seq not-yet-seen)]
      ;; otherwise record the newly seen types and generate an appropriate clause
      (do
        (swap! already-seen set/union not-yet-seen)
        [:and
         [:< :fingerprint_version version]
         [:in :base_type not-yet-seen]]))))

(def ^:private fields-to-fingerprint-base-clause
  "Base clause to get fields for fingerprinting. When refingerprinting, run as is. When fingerprinting in analysis, only
  look for fields without a fingerprint or whose version can be updated. This clauses is added on
  by [[versions-clauses]]."
  [:and
   [:= :active true]
   [:or
    [:not (mdb.query/isa :semantic_type :type/PK)]
    [:= :semantic_type nil]]
   [:not-in :visibility_type ["retired" "sensitive"]]
   [:not-in :base_type (conj (mdb.query/type-keyword->descendants :type/fingerprint-unsupported)
                             (u/qualified-name :type/*))]])

(def ^:dynamic *refingerprint?*
  "Whether we are refingerprinting or doing the normal fingerprinting. Refingerprinting should get fields that already
  are analyzed and have fingerprints."
  false)

(mu/defn- honeysql-for-fields-that-need-fingerprint-updating :- [:map
                                                                 [:where :any]]
  "Return appropriate WHERE clause for all the Fields whose Fingerprint needs to be re-calculated."
  ([]
   {:where (cond-> fields-to-fingerprint-base-clause
             (not *refingerprint?*) (conj (cons :or (versions-clauses))))})

  ([table :- i/TableInstance]
   (sql.helpers/where (honeysql-for-fields-that-need-fingerprint-updating)
                      [:= :table_id (u/the-id table)])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      FINGERPRINTING ALL FIELDS IN A TABLE                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- fields-to-fingerprint :- [:maybe [:sequential i/FieldInstance]]
  "Return a sequences of Fields belonging to `table` for which we should generate (and save) fingerprints.
   This should include NEW fields that are active and visible."
  [table :- i/TableInstance]
  (seq (t2/select :model/Field
                  (honeysql-for-fields-that-need-fingerprint-updating table))))

(mu/defn fingerprint-table!
  "Generate and save fingerprints for all the Fields in `table` that have not been previously analyzed."
  [table :- i/TableInstance]
  (if-let [fields (fields-to-fingerprint table)]
    (do
      (log/infof "Fingerprinting %s fields in table %s" (count fields) (sync-util/name-for-logging table))
      (let [stats (sync-util/with-error-handling
                    (format "Error fingerprinting %s" (sync-util/name-for-logging table))
                    (fingerprint-fields! table fields))]
        (if (instance? Exception stats)
          (assoc (empty-stats-map 0)
                 :throwable stats)
          stats)))
    (empty-stats-map 0)))

(def ^:private LogProgressFn
  [:=> [:cat :string [:schema i/TableInstance]] :any])

(mu/defn- fingerprint-fields-for-db!*
  "Invokes `fingerprint-table!` on every table in `database`"
  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn]
   (fingerprint-fields-for-db!* database log-progress-fn (constantly true)))

  ([database        :- i/DatabaseInstance
    log-progress-fn :- LogProgressFn
    continue?       :- [:=> [:cat ::FingerprintStats] :any]]
   (qp.store/with-metadata-provider (u/the-id database)
     (let [tables (if *refingerprint?*
                    (sync-util/refingerprint-reducible-sync-tables database)
                    (sync-util/reducible-sync-tables database))]
       (reduce (fn [acc table]
                 (log-progress-fn (if *refingerprint?* "refingerprint-fields" "fingerprint-fields") table)
                 (let [new-acc (merge-with + acc (fingerprint-table! table))]
                   (if (and (continue? new-acc) (not (sync-util/abandon-sync? new-acc)))
                     new-acc
                     (reduced new-acc))))
               (empty-stats-map 0)
               tables)))))

(mu/defn fingerprint-fields-for-db!
  "Invokes [[fingerprint-table!]] on every table in `database`"
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  (if (driver.u/supports? (:engine database) :fingerprint database)
    (fingerprint-fields-for-db!* database log-progress-fn)
    (empty-stats-map 0)))

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private max-refingerprint-field-count
  "Maximum number of fields to refingerprint. Balance updating our fingerprinting values while not spending too much
  time in the db."
  1000)

#_{:clj-kondo/ignore [:unused-binding]}
(mu/defn refingerprint-fields-for-db!
  "Invokes [[fingeprint-fields!]] on every table in `database` up to some limit."
  [database        :- i/DatabaseInstance
   log-progress-fn :- LogProgressFn]
  ;; Skip refingerprinting entirely
  (log/infof "Skipping refingerprinting for database %s" (sync-util/name-for-logging database))
  (empty-stats-map 0))

(mu/defn refingerprint-field
  "Refingerprint a field"
  [field :- i/FieldInstance]
  ;; Skip refingerprinting field
  (log/infof "Skipping refingerprinting for field %s" (sync-util/name-for-logging field))
  (empty-stats-map 1))
