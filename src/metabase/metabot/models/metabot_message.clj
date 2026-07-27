(ns metabase.metabot.models.metabot-message
  (:require
   [metabase.config.core :as config]
   [metabase.metabot.schema.migrate-v1-to-v2 :as migrate]
   [metabase.metabot.schema.v2 :as schema.v2]
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
   :state mi/transform-json
   :role  mi/transform-keyword})

(defn- migrate-v1->v2-on-read
  "Convert a v1 row's `:data` to the v2 format and bump `:data_version`. On failure,
  log and return the row unchanged so a malformed legacy row can't break reads."
  [message]
  (try
    (-> message
        (update :data #(->> (migrate/migrate-v1->v2 %)
                            (schema.v2/check-message-data "migrated metabot_message.data")))
        (assoc :data_version schema.v2/current-data-version))
    (catch Throwable e
      (log/warn e "Failed to migrate metabot_message data v1->v2 on read" {:id (:id message)})
      message)))

(t2/define-after-select :model/MetabotMessage
  [{:keys [data data_version] :as message}]
  (cond
    (not data)
    message

    (= 1 data_version)
    (migrate-v1->v2-on-read message)

    (and config/is-dev? (= 2 data_version))
    (do (schema.v2/check-message-data "metabot_message.data (read)" data)
        message)

    :else
    message))
