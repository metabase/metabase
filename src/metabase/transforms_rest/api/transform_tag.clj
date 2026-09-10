(ns metabase.transforms-rest.api.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.transforms-rest.db :as transforms-rest.db]
   [metabase.transforms.core :as transforms.core]
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
  (log/info "Creating transform tag")
  (api/check-403 (mi/can-create? :model/TransformTag {:name name}))
  (api/check-400 (not (transforms.core/tag-name-exists? name))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (transforms-rest.db/insert-tag! name))

(api.macros/defendpoint :put "/:tag-id" :- TransformTagResponse
  "Update a transform tag."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (log/info "Updating transform tag" tag-id)
  (api/write-check (transforms-rest.db/tag tag-id))
  (api/check-400 (not (transforms.core/tag-name-exists-excluding? name tag-id))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (transforms-rest.db/update-tag! tag-id name)
  (transforms-rest.db/tag tag-id))

(api.macros/defendpoint :delete "/:tag-id" :- :nil
  "Delete a transform tag. Removes it from all transforms and jobs."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]]
  (log/info "Deleting transform tag" tag-id)
  (api/write-check (transforms-rest.db/tag tag-id))
  (transforms-rest.db/delete-tag! tag-id)
  nil)

(api.macros/defendpoint :get "/" :- [:sequential TransformTagResponse]
  "Get a list of all transform tags."
  [_route-params
   _query-params]
  (log/info "Getting all transform tags")
  (api/check-data-analyst)
  (t2/hydrate (transforms-rest.db/tags) :can_run))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-tag` routes."
  (api.macros/ns-handler *ns* +auth))
