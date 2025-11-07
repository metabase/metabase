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
   [:id        ms/PositiveInt]
   [:entity_id ms/NonBlankString]
   [:name      ms/NonBlankString]
   [:settings :map]
   [:created_at  (ms/InstanceOfClass java.time.temporal.Temporal)]
   [:updated_at  (ms/InstanceOfClass java.time.temporal.Temporal)]])

(api.macros/defendpoint :get "/" :- [:sequential ::EmbeddingTheme]
  "Fetch a list of all embedding themes."
  []
  ; settings field is used for theme card previews.
  ; we can optimize this by only selecting the preview colors needed.
  (t2/select :model/EmbeddingTheme {:order-by [[:created_at :desc]]
                                    :select [:id :entity_id :name :settings :created_at :updated_at]}))

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
