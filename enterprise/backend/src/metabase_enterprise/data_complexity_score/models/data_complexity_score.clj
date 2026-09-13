(ns metabase-enterprise.data-complexity-score.models.data-complexity-score
  "Persistence for cached Data Complexity Score snapshots."
  (:require
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataComplexityScore [_model] :data_complexity_score)

(doto :model/DataComplexityScore
  (derive :metabase/model))

(t2/deftransforms :model/DataComplexityScore
  {:score_data mi/transform-json})

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

(defn record-score!
  "Persist one append-only Data Complexity Score snapshot."
  [fingerprint source score]
  (let [id (data-complexity-score.db/insert-score! {:fingerprint fingerprint
                                                    :source      source
                                                    :score_data  score})]
    (if id
      (score-with-calculated-at (data-complexity-score.db/score-entry id))
      (latest-score fingerprint source))))
