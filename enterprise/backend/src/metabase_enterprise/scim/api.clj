(ns metabase-enterprise.scim.api
  "/api/ee/scim/ endpoints"
  (:require
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase.api-keys.core :as api-key]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
       (t2/insert-returning-instance! :model/ApiKey {:user_id               nil
                                                     :scope                 :scim
                                                     :name                  (scim-api-key-name)
                                                     ::api-key/unhashed-key unhashed-key
                                                     :creator_id            user-id
                                                     :updated_by_id         user-id})
       (assoc :unmasked_key (u.secret/expose unhashed-key))))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/api_key"
  "Fetch the SCIM API key if one exists. Does *not* return an unmasked key, since we don't have access
  to that after it is created."
  []
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ApiKey :scope :scim)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/api_key"
  "Create a new SCIM API key, or refresh one that already exists. When called for the first time,
  this is equivalent to enabling SCIM."
  []
  (api/check-superuser)
  (backfill-required-entity-ids!)
  (refresh-scim-api-key! api/*current-user-id*))
