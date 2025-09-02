(ns metabase-enterprise.metabot-v3.models.metabot-usage
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotUsage [_model] :metabot_usage)

(doto :model/MetabotUsage
  (derive :metabase/model))

(t2/deftransforms :model/MetabotUsage
  {:usage mi/transform-json})
