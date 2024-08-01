(ns metabase-enterprise.scim.api
  "/api/ee/scim/ endpoints"
  (:require
   [compojure.core :refer [POST]]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.models.api-key :as api-key]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting scim-enabled
  (deferred-tru "Is SCIM currently enabled?")
  :visibility :admin
  :type       :boolean
  :audit      :getter
  :export?    false)

(defsetting scim-base-url
  (deferred-tru "Base URL for SCIM endpoints")
  :visibility :admin
  :type       :string
  :setter     :none
  :audit      :never
  :export?    false
  :getter     (fn []
                (str (public-settings/site-url) "/api/ee/scim/v2")))

(defn- scim-api-key-name
  []
  ;; This is only used internally, since API keys require names, but isn't displayed on the UI, so it doesn't need to be
  ;; translated.
  (format "Metabase SCIM API Key - %s" (random-uuid)))

(defn- backfill-required-entity-ids!
  "Backfills entity IDs for Users and Groups whenever a SCIM key is generated, in case any are not set"
  []
  (serdes.backfill/backfill-ids-for! :model/User)
  (serdes.backfill/backfill-ids-for! :model/PermissionsGroup))

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

(defendpoint GET "/api_key"
  "Fetch the SCIM API key if one exists. Does *not* return an unmasked key, since we don't have access
  to that after it is created."
  []
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ApiKey :scope :scim)))

(defendpoint POST "/api_key"
  "Create a new SCIM API key, or refresh one that already exists. When called for the first time,
  this is equivalent to enabling SCIM."
  []
  (api/check-superuser)
  (backfill-required-entity-ids!)
  (refresh-scim-api-key! api/*current-user-id*))

(api/define-routes)
