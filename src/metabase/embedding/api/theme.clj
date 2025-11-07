(ns metabase.embedding.api.theme
  "Endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::EmbeddingTheme
  [:map
   [:id        ms/PositiveInt]
   [:entity_id ms/NonBlankString]
   [:name      ms/NonBlankString]
   [:settings :map]
   [:created_at  (ms/InstanceOfClass java.time.temporal.Temporal)]
   [:updated_at  (ms/InstanceOfClass java.time.temporal.Temporal)]])

(api.macros/defendpoint :get "/" :- [:sequential
                                     [:map
                                      [:id          ms/PositiveInt]
                                      [:entity_id ms/NonBlankString]
                                      [:name        ms/NonBlankString]
                                      [:created_at  (ms/InstanceOfClass java.time.temporal.Temporal)]
                                      [:updated_at  (ms/InstanceOfClass java.time.temporal.Temporal)]]]
  "Fetch a list of all embedding themes."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :desc]]
                                    :select [:id :entity_id :name :created_at :updated_at]}))

(api.macros/defendpoint :get "/:id" :- ::EmbeddingTheme
  "Fetch a single embedding theme by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/EmbeddingTheme :id id))
  (t2/select-one :model/EmbeddingTheme :id id))

(api.macros/defendpoint :post "/" :- ::EmbeddingTheme
  "Create a new embedding theme."
  [_route-params
   _query-params
   {:keys [name settings]} :- [:map
                               [:name     ms/NonBlankString]
                               [:settings :map]]]
  (t2/insert-returning-instance! :model/EmbeddingTheme
                                 {:name name
                                  :settings settings}))

(api.macros/defendpoint :put "/:id" :- ::EmbeddingTheme
  "Update an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name settings]} :- [:map
                               [:name {:optional true} [:maybe ms/NonBlankString]]
                               [:settings {:optional true} [:maybe :map]]]]
  (api/check-404 (t2/exists? :model/EmbeddingTheme :id id))
  (t2/update! :model/EmbeddingTheme id
              (cond-> {}
                name (assoc :name name)
                settings (assoc :settings settings)))
  (t2/select-one :model/EmbeddingTheme :id id))

(api.macros/defendpoint :delete "/:id"
  "Delete an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/EmbeddingTheme :id id))
  (t2/delete! :model/EmbeddingTheme :id id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:id/copy" :- ::EmbeddingTheme
  "Copy an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/EmbeddingTheme :id id))
  (let [source-theme (t2/select-one :model/EmbeddingTheme :id id)]
    (t2/insert-returning-instance! :model/EmbeddingTheme
                                   {:name (tru "Copy of {0}" (:name source-theme))
                                    :settings (:settings source-theme)})))
