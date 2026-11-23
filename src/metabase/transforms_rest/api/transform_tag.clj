(ns metabase.transforms-rest.api.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.transforms-rest.db :as transforms-rest.db]
   [metabase.transforms.models.transform-tag :as models.transform-tag]
   [metabase.util.i18n :refer [LocalizedString]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doseq [topic [:event/transform-tag-create :event/transform-tag-update :event/transform-tag-delete]]
  (events/derive! topic :metabase/event))

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
   {:keys [name]} :- [:map {:closed true}
                      [:name ms/NonBlankString]]]
  (log/info "Creating transform tag")
  (api/create-check :model/TransformTag {:name name})
  (first (models.transform-tag/create-transform-tags! [{:name name}])))

(api.macros/defendpoint :put "/:tag-id" :- TransformTagResponse
  "Update a transform tag. `tag-id` is a numeric id or an entity id."
  [{id-or-entity-id :tag-id} :- [:map {:closed true}
                                 [:tag-id [:or ms/PositiveInt ms/NanoIdString]]]
   _query-params
   {:keys [name]} :- [:map {:closed true}
                      [:name ms/NonBlankString]]]
  (let [tag-id (eid-translation/->id-or-404 :model/TransformTag id-or-entity-id)]
    (log/info "Updating transform tag" tag-id)
    (api/update-check (api/check-404 (transforms-rest.db/tag tag-id)) {:name name})
    (models.transform-tag/update-transform-tags! [{:id tag-id :name name}])
    (transforms-rest.db/tag tag-id)))

(api.macros/defendpoint :delete "/:tag-id" :- :nil
  "Delete a transform tag. Removes it from all transforms and jobs. `tag-id` is a numeric id or an entity id."
  [{id-or-entity-id :tag-id} :- [:map {:closed true}
                                 [:tag-id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [tag-id (eid-translation/->id-or-404 :model/TransformTag id-or-entity-id)]
    (log/info "Deleting transform tag" tag-id)
    (api/write-check (transforms-rest.db/tag tag-id))
    (models.transform-tag/delete-transform-tags! [tag-id])
    nil))

(api.macros/defendpoint :get "/" :- [:sequential TransformTagResponse]
  "Get a list of all transform tags."
  [_route-params
   _query-params]
  (log/info "Getting all transform tags")
  (api/check-data-studio-access)
  (t2/hydrate (transforms-rest.db/tags) :can_run))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-tag` routes."
  (api.macros/ns-handler *ns* +auth))
