(ns metabase-enterprise.data-complexity-score.models.data-complexity-score
  "Single-row cache for the most recent Data Complexity Score run.
  Read by the API when the live fingerprint matches, written by the cron job and the API's
  compute path."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataComplexityScore [_model] :data_complexity_score)

(doto :model/DataComplexityScore
  (derive :metabase/model))

(t2/deftransforms :model/DataComplexityScore
  {:score mi/transform-json})
