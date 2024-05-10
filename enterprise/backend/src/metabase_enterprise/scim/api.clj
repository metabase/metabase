(ns metabase-enterprise.scim.api
  "/api/ee/scim/ endpoints"
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.models.api-key :as api-key]
   [toucan2.core :as t2]))

(defn- scim-api-key-name
  []
  (format "Metabase SCIM API Key - %s" (random-uuid)))

(defn- refresh-scim-api-key!
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

(defendpoint POST "/api_key"
  "Create a new SCIM API key, or refresh one that already exists. When called for the first time,
  this is equivalent to enabling SCIM."
  []
  (api/check-superuser)
  (refresh-scim-api-key! api/*current-user-id*))

(defendpoint DELETE "/api_key"
  "Deletes the SCIM API key, if one exists. Equivalent to disabling SCIM."
  []
  (api/check-superuser)
  (t2/delete! :model/ApiKey :scope :scim))

(api/define-routes)
