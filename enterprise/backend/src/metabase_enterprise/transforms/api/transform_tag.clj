(ns metabase-enterprise.transforms.api.transform-tag
  (:require
   [metabase-enterprise.transforms.models.transform-tag :as transform-tag]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [deferred-tru LocalizedString]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TransformTagResponse
  [:map {:closed true}
   [:id pos-int?]
   [:name [:or :string LocalizedString]]
   [:entity_id [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:built_in_type {:optional true} [:maybe :string]]
   [:can_run {:optional true} :boolean]])

(api.macros/defendpoint :post "/" :- TransformTagResponse
  "Create a new transform tag."
  [_route-params
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (log/info "Creating transform tag:" name)
  (api/check-403 (mi/can-create? :model/TransformTag {:name name}))
  (api/check-400 (not (transform-tag/tag-name-exists? name))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (t2/insert-returning-instance! :model/TransformTag {:name name}))

(api.macros/defendpoint :put "/:tag-id" :- TransformTagResponse
  "Update a transform tag."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (log/info "Updating transform tag" tag-id "with name:" name)
  (api/write-check (t2/select-one :model/TransformTag :id tag-id))
  (api/check-400 (not (transform-tag/tag-name-exists-excluding? name tag-id))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (t2/update! :model/TransformTag tag-id {:name name})
  (t2/select-one :model/TransformTag :id tag-id))

(api.macros/defendpoint :delete "/:tag-id" :- :nil
  "Delete a transform tag. Removes it from all transforms and jobs."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]]
  (log/info "Deleting transform tag" tag-id)
  (api/write-check (t2/select-one :model/TransformTag :id tag-id))
  (t2/delete! :model/TransformTag :id tag-id)
  nil)

(api.macros/defendpoint :get "/" :- [:sequential TransformTagResponse]
  "Get a list of all transform tags."
  [_route-params
   _query-params]
  (log/info "Getting all transform tags")
  (api/check-403 (or api/*is-superuser?* api/*is-data-analyst?*))
  (t2/hydrate (t2/select :model/TransformTag {:order-by [[:name :asc]]}) :can_run))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-tag` routes."
  (api.macros/ns-handler *ns* +auth))
