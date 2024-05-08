(ns metabase-enterprise.sso.integrations.scim
  (:require
   [metabase.api.common :as api]
   [metabase.models.api-key :as api-key]
   [toucan2.core :as t2]))

(def ^:private scim-api-key-name "Metabase SCIM API Key (internal)")

(defn refresh-scim-api-key!
  "Generates a new SCIM API key and deletes any that already exist."
  []
  (t2/with-transaction [_conn]
    (t2/delete! :model/ApiKey :scope :scim)
    (t2/insert-returning-instance! :model/ApiKey {:user_id       nil
                                                  :scope         :scim
                                                  :name          scim-api-key-name
                                                  :unhashed_key  (api-key/generate-key)
                                                  :creator_id    api/*current-user-id*
                                                  :updated_by_id api/*current-user-id*})))

(comment
 (require '[metabase.test :as mt])
 (mt/with-current-user 1
   (refresh-scim-api-key!)))
