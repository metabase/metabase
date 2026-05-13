(ns metabase-enterprise.data-complexity-score.models.data-complexity-score
  "Persistence for cached Data Complexity Score snapshots."
  (:require
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
  "Return the most recently persisted Data Complexity Score row for `fingerprint`, or nil if none exist.

  When `source` is supplied, only rows whose `source` column equals it are considered — letting the
  appdb-authoritative read paths (API, cron) ignore representation-derived rows that share the same
  fingerprint."
  ([fingerprint] (latest-entry fingerprint nil))
  ([fingerprint source]
   (if source
     (t2/select-one :model/DataComplexityScore
                    :fingerprint fingerprint :source source {:order-by [[:id :desc]]})
     (t2/select-one :model/DataComplexityScore
                    :fingerprint fingerprint {:order-by [[:id :desc]]}))))

(defn latest-score
  "Return the latest persisted Data Complexity Score payload for `fingerprint`, or nil if none exist.
  Accepts the same optional `source` filter as [[latest-entry]]."
  ([fingerprint] (latest-score fingerprint nil))
  ([fingerprint source]
   (some-> (latest-entry fingerprint source)
           score-with-calculated-at)))

(defn record-score!
  "Persist one append-only Data Complexity Score snapshot.

  `source` discriminates the row's provenance — `\"appdb\"` for cron / API / CLI-from-appdb runs,
  or `\"representation:<digest>\"` for CLI runs that scored a representation directory."
  [fingerprint source score]
  (let [id (t2/insert-returning-pk! :model/DataComplexityScore
                                    {:fingerprint fingerprint
                                     :source      source
                                     :score_data  score})]
    (if id
      (score-with-calculated-at (t2/select-one :model/DataComplexityScore :id id))
      (latest-score fingerprint source))))
