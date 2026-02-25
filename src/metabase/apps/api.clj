(ns metabase.apps.api
  "/api/app endpoints - admin only."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List all Apps. Requires superuser."
  [_route-params _query-params]
  (api/check-superuser)
  (t2/select :model/App {:order-by [[:%lower.name :asc]]}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new App. Requires superuser."
  [_route-params
   _query-params
   {:keys [collection_id] :as body} :- [:map
                                        [:name          ms/NonBlankString]
                                        [:auth_method   [:enum "jwt" "saml"]]
                                        [:collection_id ms/PositiveInt]
                                        [:theme         {:optional true} [:maybe :string]]
                                        [:published     {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (api/checkp (t2/exists? :model/Collection :id collection_id)
              "collection_id" "Collection does not exist.")
  (t2/insert-returning-instance! :model/App body))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch a single App by ID. Requires superuser."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/App :id id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an App. Requires superuser."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name          {:optional true} ms/NonBlankString]
            [:auth_method   {:optional true} [:enum "jwt" "saml"]]
            [:collection_id {:optional true} ms/PositiveInt]
            [:theme         {:optional true} [:maybe :string]]
            [:published     {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/App :id id))
  (when-let [collection-id (:collection_id body)]
    (api/checkp (t2/exists? :model/Collection :id collection-id)
                "collection_id" "Collection does not exist."))
  (t2/update! :model/App id body)
  (t2/select-one :model/App :id id))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete an App. Requires superuser."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/App :id id))
  (t2/delete! :model/App :id id)
  api/generic-204-no-content)
