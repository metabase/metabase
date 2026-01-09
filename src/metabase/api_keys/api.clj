(ns metabase.api-keys.api
  "/api/api-key endpoints for CRUD management of API Keys"
  (:require
   [medley.core :as m]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(defn- maybe-expose-key [api-key]
  (if (contains? api-key :unmasked_key)
    (update api-key :unmasked_key u.secret/expose)
    api-key))

(defn- present-api-key
  "Takes an ApiKey and hydrates/selects keys as necessary to put it into a standard form for responses"
  [api-key]
  (-> api-key
      (t2/hydrate :group :updated_by)
      (select-keys [:created_at
                    :updated_at
                    :updated_by
                    :id
                    :group
                    :unmasked_key
                    :name
                    :masked_key])
      (maybe-expose-key)
      (update :updated_by #(select-keys % [:common_name :id]))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new API key (and an associated `User`) with the provided name and group ID."
  [_route-params
   _query-params
   {group-id :group_id, key-name :name, :as _body} :- [:map
                                                       [:group_id ::api-keys.schema/id]
                                                       [:name     ms/NonBlankString]]]
  (api/check-superuser)
  (-> (api-key/create-api-key-with-new-user! {:key-name key-name, :group-id group-id})
      present-api-key))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/count"
  "Get the count of API keys in the DB with the default scope."
  []
  (api/check-superuser)
  (t2/count :model/ApiKey :scope nil))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an API key by changing its group and/or its name"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {group-id :group_id, key-name :name} :- [:map
                                            [:group_id {:optional true} [:maybe ms/PositiveInt]]
                                            [:name     {:optional true} [:maybe ::api-keys.schema/name]]]]
  (api/check-superuser)
  (api/let-404 [api-key-before (t2/select-one :model/ApiKey id)]
    (-> api-key-before
        (m/assoc-some ::api-keys/group-id group-id, :name key-name)
        t2/save!
        present-api-key)))

(api.macros/defendpoint :put "/:id/regenerate" :- [:map
                                                   [:id           ::api-keys.schema/id]
                                                   [:unmasked_key ::api-keys.schema/key.raw]
                                                   [:masked_key   ::api-keys.schema/key.masked]
                                                   [:prefix       ::api-keys.schema/prefix]]
  "Regenerate an API Key"
  [{:keys [id]} :- [:map
                    [:id ::api-keys.schema/id]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/ApiKey id))
  (let [regenerated (api-key/regenerate! id)]
    {:id           id
     :unmasked_key (u.secret/expose (:unmasked-key regenerated))
     :masked_key   (:masked-key regenerated)
     :prefix       (:prefix regenerated)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get a list of API keys with the default scope. Non-paginated."
  []
  (api/check-superuser)
  (let [api-keys (t2/hydrate (t2/select :model/ApiKey :scope nil) :group :updated_by)]
    (map present-api-key api-keys)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete an ApiKey"
  [{:keys [id]} :- [:map
                    [:id ::api-keys.schema/id]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/ApiKey id))
  (t2/delete! :model/ApiKey id)
  api/generic-204-no-content)

#_:clj-kondo/ignore
(comment
  ;; check the generated docs
  (metabase.api.open-api/open-api-spec (metabase.api.macros/ns-handler) "/api/api-key"))
