(ns metabase.metabot.models.metabot-message
  (:require
   [metabase.metabot.persistence :as metabot-persistence]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotMessage [_model] :metabot_message)

(doto :model/MetabotMessage
  (derive :metabase/model))

(def ^:private transform-data-with-migration
  "JSON transform for the :data column that migrates v1 format to v2 on read."
  {:in  mi/json-in
   :out (comp metabot-persistence/ensure-current-format mi/json-out-with-keywordization)})

(t2/deftransforms :model/MetabotMessage
  {:usage mi/transform-json
   :data  transform-data-with-migration
   :role  mi/transform-keyword})
