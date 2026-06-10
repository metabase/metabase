(ns metabase.metabot.models.metabot-message
  (:require
   [metabase.metabot.schema.migrate-v1-to-v2 :as migrate]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.metabot.schema.validate :as validate]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
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

(t2/define-after-select :model/MetabotMessage
  [message]
  (if (and (= 1 (:data_version message)) (:data message))
    (try
      (-> message
          (update :data #(->> (migrate/migrate-v1->v2 %)
                              (validate/check ::schema.v2/message-data "migrated metabot_message.data")))
          (assoc :data_version 2))
      (catch Throwable e
        (log/warn e "Failed to migrate metabot_message data v1->v2 on read" {:id (:id message)})
        message))
    message))
