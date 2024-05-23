(ns metabase-enterprise.scim.api
  "/api/ee/scim/ endpoints.

This feature is still in development."
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.models.api-key :as api-key]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- scim-api-key-name
  []
  (format "Metabase SCIM API Key - %s" (random-uuid)))

(defn- refresh-scim-api-key!
  "Generates a new SCIM API key and deletes any that already exist."
  [user-id]
  (t2/with-transaction [_conn]
    (t2/delete! :model/ApiKey :scope :scim)
    (let [unhashed-key (api-key/generate-key)]
      (->
       (t2/insert-returning-instance! :model/ApiKey {:user_id       nil
                                                     :scope         :scim
                                                     :name          (scim-api-key-name)
                                                     :unhashed_key  unhashed-key
                                                     :creator_id    user-id
                                                     :updated_by_id user-id})
       (assoc :unmasked_key (u.secret/expose unhashed-key))))))

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
