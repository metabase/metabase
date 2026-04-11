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

(t2/deftransforms :model/MetabotMessage
  {:usage mi/transform-json
   :data  mi/transform-json
   :role  mi/transform-keyword})

(t2/define-after-select :model/MetabotMessage [message]
  (cond-> message
    (= 1 (:data_version message))
    (update :data metabot-persistence/migrate-v1->v2)))
