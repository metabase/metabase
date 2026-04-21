(ns metabase.metabot.models.metabot-message
  (:require
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

(t2/define-before-insert :model/MetabotMessage
  [message]
  (cond-> message
    (nil? (:external_id message)) (assoc :external_id (str (random-uuid)))))
