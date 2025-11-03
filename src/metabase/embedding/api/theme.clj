(ns metabase.embedding.api.theme
  "Endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::EmbeddingTheme
  [:map
   [:id       ms/PositiveInt]
   [:name     ms/NonBlankString]
   [:settings :map]
   [:created_at  :any]
   [:updated_at  :any]])

(api.macros/defendpoint :get "/" :- [:sequential
                                     [:map
                                      [:id          ms/PositiveInt]
                                      [:name        ms/NonBlankString]
                                      [:created_at  :any]
                                      [:updated_at  :any]]]
  "Fetch a list of all embedding themes."
  []
  (api/check-superuser)
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :desc]]
                                    :select [:id :name :created_at :updated_at]}))

(api.macros/defendpoint :get "/:id" :- ::EmbeddingTheme
  "Fetch a single embedding theme by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
    (api/check-404 theme)
    theme))

(api.macros/defendpoint :post "/" :- ::EmbeddingTheme
  "Create a new embedding theme."
  [_route-params
   _query-params
   {:keys [name settings]} :- [:map
                               [:name     ms/NonBlankString]
                               [:settings :map]]]
  (api/check-superuser)
  (first (t2/insert-returning-instances! :model/EmbeddingTheme
                                         {:name name
                                          :settings settings})))

(api.macros/defendpoint :put "/:id" :- ::EmbeddingTheme
  "Update an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name settings]} :- [:map
                               [:name {:optional true} [:maybe ms/NonBlankString]]
                               [:settings {:optional true} [:maybe :map]]]]
  (api/check-superuser)
  (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
    (api/check-404 theme)
    (t2/update! :model/EmbeddingTheme id
                (cond-> {}
                  name (assoc :name name)
                  settings (assoc :settings settings)))
    (t2/select-one :model/EmbeddingTheme :id id)))

(api.macros/defendpoint :delete "/:id"
  "Delete an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
    (api/check-404 theme)
    (t2/delete! :model/EmbeddingTheme :id id))
  api/generic-204-no-content)
