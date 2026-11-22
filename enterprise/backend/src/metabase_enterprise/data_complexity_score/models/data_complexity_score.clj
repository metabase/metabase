(ns metabase-enterprise.data-complexity-score.models.data-complexity-score
  "Persistence for cached Data Complexity Score snapshots."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase-enterprise.data-complexity-score.schema :as data-complexity-score.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataComplexityScore [_model] :data_complexity_score)

(doto :model/DataComplexityScore
  (derive :metabase/model))

(defn- score-data-out
  "Re-keywordize the `:keyword`-typed leaves (e.g. `:meta.text-variant`) that JSON storage round-trips back as
  strings."
  [score-data]
  (when-let [decoded ((:out mi/transform-json) score-data)]
    (mc/decode ::data-complexity-score.schema/data-complexity-score.score-data decoded
               (mtx/transformer mtx/json-transformer))))

(t2/deftransforms :model/DataComplexityScore
  {:score_data {:in (:in mi/transform-json), :out score-data-out}})

(defn- score-with-calculated-at
  [{:keys [score_data created_at]}]
  (when score_data
    (assoc-in score_data [:meta :calculated-at] created_at)))

(defn latest-entry
  "Return the most recently persisted Data Complexity Score row for `fingerprint`, or nil if none exist."
  ([fingerprint] (latest-entry fingerprint "appdb"))
  ([fingerprint source]
   (data-complexity-score.db/latest-score-entry fingerprint source)))

(defn latest-score
  "Return the latest persisted Data Complexity Score payload for `fingerprint`, or nil if none exist."
  ([fingerprint] (latest-score fingerprint "appdb"))
  ([fingerprint source]
   (some-> (latest-entry fingerprint source)
           score-with-calculated-at)))

(defn scored-within-cooldown?
  "True when a `source` snapshot for `fingerprint` was recorded within the last `cooldown-hours` hours.
  The cutoff is computed in database time, since `created_at` defaults to the DB `current_timestamp` —
  we never compare it against the app server's clock.
  Lets the scoring task skip a run that would only re-publish a still-fresh score."
  [fingerprint source cooldown-hours]
  (data-complexity-score.db/scored-within-hours? fingerprint source cooldown-hours))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn record-score!
  "Persist one append-only Data Complexity Score snapshot and return the latest score of `fingerprint` and `source`."
  [fingerprint :- :string
   source      :- :string
   score       :- :map]
  (let [id (data-complexity-score.db/insert-score! {:fingerprint fingerprint
                                                    :source      source
                                                    :score_data  score})]
    (if id
      (score-with-calculated-at (data-complexity-score.db/score-entry id))
      (latest-score fingerprint source))))

(mu/defn delete-data-complexity-scores-for-cleanup! :- :int
  "Delete the Data Complexity Score snapshots created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (data-complexity-score.db/delete-scores-created-before! cutoff))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataComplexityScore [_model]
  {:skip? true})
