(ns metabase-enterprise.sso.integrations.scim
  (:require
   [metabase.models.api-key :as api-key]
   [toucan2.core :as t2]))

(defn- scim-api-key-name
  []
  (format "Metabase SCIM API Key - %s" (random-uuid)))

(defn refresh-scim-api-key!
  "Generates a new SCIM API key and deletes any that already exist."
  [user-id]
  (t2/with-transaction [_conn]
    (t2/delete! :model/ApiKey :scope :scim)
    (t2/insert-returning-instance! :model/ApiKey {:user_id       nil
                                                  :scope         :scim
                                                  :name          (scim-api-key-name)
                                                  :unhashed_key  (api-key/generate-key)
                                                  :creator_id    user-id
                                                  :updated_by_id user-id})))

(comment
 (refresh-scim-api-key! 1))
