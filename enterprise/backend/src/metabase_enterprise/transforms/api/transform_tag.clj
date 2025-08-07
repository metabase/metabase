(ns metabase-enterprise.transforms.api.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/"
  "Create a new transform tag."
  [_route-params
   _query-params
   {:keys [name]} :- [:map
                      [:name :string]]]
  (log/info "create tag (dummy)")
  (api/check-superuser)
  {:id 1, :name name})

(api.macros/defendpoint :put "/:tag-id"
  "Update a transform tag."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map
                      [:name {:optional true} :string]]]
  (log/info "update tag (dummy)")
  (api/check-superuser)
  {:id   tag-id
   :name (or name "Updated Tag")})

(api.macros/defendpoint :delete "/:tag-id"
  "Delete a transform tag. Removes it from all transforms and jobs."
  [_tag :- [:map
            [:tag-id ms/PositiveInt]]]
  (log/info "delete tag (dummy)")
  (api/check-superuser)
  nil)

(api.macros/defendpoint :get "/"
  "Get a list of all transform tags."
  [_route-params
   _query-params]
  (log/info "get all tags (dummy)")
  (api/check-superuser)
  [{:id   1
    :name "Dummy Tag 1"}
   {:id   2
    :name "Dummy Tag 2"}])

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-tag` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))