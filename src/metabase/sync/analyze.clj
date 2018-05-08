(ns metabase.sync.analyze
  "Logic responsible for doing deep 'analysis' of the data inside a database.
   This is significantly more expensive than the basic sync-metadata step, and involves things
   like running MBQL queries and fetching values to do things like determine Table row counts
   and infer field special types."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze
             [classify :as classify]
             [fingerprint :as fingerprint]
             #_[table-row-count :as table-row-count]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

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
;;     Classification takes place for these Fields and special types and the like are updated as needed.
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

(s/defn ^:private update-last-analyzed!
  [tables :- [i/TableInstance]]
  (when-let [ids (seq (map u/get-id tables))]
    ;; The WHERE portion of this query should match up with that of `classify/fields-to-classify`
    (db/update-where! Field {:table_id            [:in ids]
                             :fingerprint_version i/latest-fingerprint-version
                             :last_analyzed       nil}
      :last_analyzed (u/new-sql-timestamp))))

(s/defn ^:private update-fields-last-analyzed!
  "Update the `last_analyzed` date for all the recently re-fingerprinted/re-classified Fields in TABLE."
  [table :- i/TableInstance]
  (update-last-analyzed! [table]))

(s/defn ^:private update-fields-last-analyzed-for-db!
  "Update the `last_analyzed` date for all the recently re-fingerprinted/re-classified Fields in TABLE."
  [database :- i/DatabaseInstance
   tables :- [i/TableInstance]]
  ;; The WHERE portion of this query should match up with that of `classify/fields-to-classify`
  (update-last-analyzed! tables))

(s/defn analyze-table!
  "Perform in-depth analysis for a TABLE."
  [table :- i/TableInstance]
  ;; Table row count disabled for now because of performance issues
  #_(table-row-count/update-row-count! table)
  (fingerprint/fingerprint-fields! table)
  (classify/classify-fields! table)
  (classify/classify-table! table)
  (update-fields-last-analyzed! table))

(defn- maybe-log-progress [progress-bar-fn]
  (fn [step table]
    (let [progress-bar-result (progress-bar-fn)]
      (when progress-bar-result
        (log/info (u/format-color 'blue "%s Analyzed %s %s" step progress-bar-result (sync-util/name-for-logging table)))))))

(s/defn analyze-db!
  "Perform in-depth analysis on the data for all Tables in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row
   counting. This also updates the `:last_analyzed` value for each affected Field."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :analyze database (format "Analyze data for %s" (sync-util/name-for-logging database))
    (let [tables (sync-util/db->sync-tables database)]
      (sync-util/with-emoji-progress-bar [emoji-progress-bar (inc (* 3 (count tables)))]
        (let [log-progress-fn (maybe-log-progress emoji-progress-bar)]
          (fingerprint/fingerprint-fields-for-db! database tables log-progress-fn)
          (classify/classify-fields-for-db! database tables log-progress-fn)
          (classify/classify-tables-for-db! database tables log-progress-fn)
          (update-fields-last-analyzed-for-db! database tables))))))
