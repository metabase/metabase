(ns metabase.data-apps.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/:id"
  "Get a specific app by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check :model/App id)
  (t2/select-one :model/App :id id))

(api.macros/defendpoint :get "/:id/definition"
  "Get app definitions for a specific app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [limit]} :- [:map
                       [:limit {:optional true} [:maybe ms/PositiveInt]]]]
  (api/read-check :model/App id)
  (let [query (cond-> {:select   [:*]
                       :from     [:app_definition]
                       :where    [:= :app_id id]
                       :order-by [[:version :desc]]}
                limit (assoc :limit limit))]
    {:data (t2/query query)}))

(api.macros/defendpoint :get "/:id/publishing"
  "Get publishing information for a specific app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check :model/App id)
  {:data (t2/select :model/AppPublishing :app_id id {:order-by [[:published_at :desc]]})})

(api.macros/defendpoint :post "/"
  "Create a new app with an initial definition."
  [_route-params
   _query-params
   {:keys [name description config definition]} :- [:map
                                                    [:name ms/NonBlankString]
                                                    [:description {:optional true} [:maybe :string]]
                                                    [:config {:optional true} [:maybe :map]]
                                                    [:definition :map]]]
  (api/check-superuser)
  (data-apps.models/create-app! {:name        name
                                 :description description
                                 :config      config
                                 :definition  definition}))

(api.macros/defendpoint :put "/:id"
  "Update app metadata."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map]]
  (api/write-check :model/App id)
  (t2/update! :model/App id
              body)
  (t2/select-one :model/App :id id))

(api.macros/defendpoint :delete "/:id"
  "Delete an app and all associated data."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/App id)
  (api/check-superuser)
  (t2/delete! :model/App :id id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:id/definition"
  "Create a new definition version for an app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [definition]} :- [:map [:definition :map]]]
  (api/write-check :model/App id)
  (data-apps.models/new-definition! id definition))

(api.macros/defendpoint :post "/:id/publish"
  "Publish a specific definition version."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [app_definition_id]} :- [:map [:app_definition_id ms/PositiveInt]]]
  (api/write-check :model/App id)
  (let [definition (t2/select-one :model/AppDefinition :id app_definition_id :app_id id)]
    (when-not definition
      (throw (ex-info "App definition not found" {:status-code 404})))
    (data-apps.models/publish! id app_definition_id)))

(api.macros/defendpoint :post "/:id/unpublish"
  "Unpublish the currently active publication."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/App id)
  (let [active-pub (t2/select-one :model/AppPublishing :app_id id :active true)]
    (when-not active-pub
      (throw (ex-info "No active publication found" {:status-code 404})))
    (t2/update! :model/AppPublishing (:id active-pub) {:active false})
    api/generic-204-no-content))
