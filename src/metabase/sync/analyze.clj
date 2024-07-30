(ns metabase.sync.analyze
  "Logic responsible for doing deep 'analysis' of the data inside a database.
   This is significantly more expensive than the basic sync-metadata step, and involves things
   like running MBQL queries and fetching values to do things like determine Table row counts
   and infer field semantic types."
  (:require
   [metabase.sync.analyze.classify :as classify]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; How does analysis decide which Fields should get analyzed?
;;
;; Good question. There are two situations in which Fields should get analyzed:
;;
;; *  Whenever a new Field is first detected, *or*
;; *  When the fingerprinters are updated in such a way that this Field (based on its base type) ought to be
;; *  re-fingerprinted
;;
;; So how do we check all that?
;;
;; 1.  We keep track of which base types are affected by new fingerprint versions. See the discussion in
;;     `metabase.sync.interface` for more details.
;;
;; 2.  FINGERPRINTING
;;
;;     2a. When running fingerprinting, we calculate a fairly sophisticated SQL query to only fetch Fields that
;;         need to be re-fingerprinted based on type info and their current fingerprint version
;;
;;     2b. All of these fields get updated fingerprints and marked with the newest version. We also set
;;         `last_analyzed` to `nil` so we know we need to re-run classification for them
;;
;; 3.  CLASSIFICATION
;;
;;     All Fields that have the latest fingerprint version but a `nil` `last_analyzed` time need to be re-classified.
;;     Classification takes place for these Fields and semantic types and the like are updated as needed.
;;
;; 4.  MARKING FIELDS AS RECENTLY ANALYZED
;;
;;     Once all of the above is done, we update the `last_analyzed` timestamp for all the Fields that got
;;     re-fingerprinted and re-classified.
;;
;; So what happens during the next analysis?
;;
;; During the next analysis phase, Fields whose fingerprint is up-to-date will be skipped. However, if a new
;; fingerprint version is introduced, Fields that need it will be upgraded to it. We'll still only reclassify the
;; newly re-fingerprinted Fields, because we'll know to skip the ones from last time since their value of
;; `last_analyzed` is not `nil`.

(mu/defn ^:private update-fields-last-analyzed!
  "Update the `last_analyzed` date for all the recently re-fingerprinted/re-classified Fields in `table`."
  [table :- i/TableInstance]
  (t2/update! :model/Field
              (merge (sync.fingerprint/incomplete-analysis-kvs)
                     {:table_id (:id table)})
              {:last_analyzed :%now}))

(mu/defn ^:private update-fields-last-analyzed-for-db!
  "Update the `last_analyzed` date for all the recently re-fingerprinted/re-classified Fields in `database`."
  [database :- i/DatabaseInstance]
  (t2/update! :model/Field
              (merge (sync.fingerprint/incomplete-analysis-kvs)
                     {:table_id [:in {:select [:id]
                                      :from   [(t2/table-name :model/Table)]
                                      :where  [:and sync-util/sync-tables-clause [:= :db_id (:id database)]]}]})
              {:last_analyzed :%now}))

(mu/defn analyze-table!
  "Perform in-depth analysis for a `table`."
  [table :- i/TableInstance]
  (sync.fingerprint/fingerprint-fields! table)
  (classify/classify-fields! table)
  (classify/classify-table! table)
  (update-fields-last-analyzed! table))

(defn- maybe-log-progress [progress-bar-fn]
  (fn [step table]
    (let [progress-bar-result (progress-bar-fn)]
      (when progress-bar-result
        (log/info (u/format-color 'blue "%s Analyzed %s %s" step progress-bar-result (sync-util/name-for-logging table)))))))

(defn- fingerprint-fields-summary [{:keys [fingerprints-attempted updated-fingerprints no-data-fingerprints failed-fingerprints]}]
  (format "Fingerprint updates attempted %d, updated %d, no data found %d, failed %d"
          fingerprints-attempted updated-fingerprints no-data-fingerprints failed-fingerprints))

(defn- classify-fields-summary [{:keys [fields-classified fields-failed]}]
  (format "Total number of fields classified %d, %d failed"
          fields-classified fields-failed))

(defn- classify-tables-summary [{:keys [total-tables tables-classified]}]
  (format "Total number of tables classified %d, %d updated"
          total-tables tables-classified))

(defn- make-analyze-steps [log-fn]
  [(sync-util/create-sync-step "fingerprint-fields"
                               #(sync.fingerprint/fingerprint-fields-for-db! % log-fn)
                               fingerprint-fields-summary)
   (sync-util/create-sync-step "classify-fields"
                               #(classify/classify-fields-for-db! % log-fn)
                               classify-fields-summary)
   (sync-util/create-sync-step "classify-tables"
                               #(classify/classify-tables-for-db! % log-fn)
                               classify-tables-summary)])

(mu/defn analyze-db!
  "Perform in-depth analysis on the data for all Tables in a given `database`. This is dependent on what each database
  driver supports, but includes things like cardinality testing and table row counting. This also updates the
  `:last_analyzed` value for each affected Field."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :analyze database (format "Analyze data for %s" (sync-util/name-for-logging database))
    (sync-util/with-emoji-progress-bar [emoji-progress-bar (inc (* 3 (sync-util/sync-tables-count database)))]
      (u/prog1 (sync-util/run-sync-operation "analyze" database (make-analyze-steps (maybe-log-progress emoji-progress-bar)))
        (update-fields-last-analyzed-for-db! database)))))

(mu/defn refingerprint-db!
  "Refingerprint a subset of tables in a given `database`. This will re-fingerprint tables up to a threshold amount of
  [[fingerprint/max-refingerprint-field-count]]."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :refingerprint database (format "Refingerprinting tables for %s" (sync-util/name-for-logging database))
    (let [log-fn (fn [step table]
                   (log/info (u/format-color 'blue "%s Analyzed %s" step (sync-util/name-for-logging table))))]
      (sync-util/run-sync-operation "refingerprint database"
                                    database
                                    [(sync-util/create-sync-step "refingerprinting fields"
                                                                 #(sync.fingerprint/refingerprint-fields-for-db! % log-fn)
                                                                 fingerprint-fields-summary)]))))
