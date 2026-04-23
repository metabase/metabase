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

(defn latest-entry
  "Return the most recently persisted Data Complexity Score row, or nil if none exist."
  []
  (t2/select-one :model/DataComplexityScore {:order-by [[:id :desc]]}))

(defn latest-score
  "Return the latest persisted Data Complexity Score payload, or nil if none exist."
  []
  (:score_data (latest-entry)))

(defn record-score!
  "Persist one append-only Data Complexity Score snapshot."
  [fingerprint score]
  (t2/insert! :model/DataComplexityScore
              {:fingerprint fingerprint
               :score_data  score}))
