(ns metabase.embedding.api.theme
  "Endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/"
  "Fetch a list of all embedding themes."
  []
  (api/check-superuser)
  (t2/select :model/EmbeddingTheme [:id :name :created_at :updated_at] {:order-by [[:name :asc]]}))

(api.macros/defendpoint :get "/:id"
  "Fetch a single embedding theme by ID."
  [{:keys [id]}]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/EmbeddingTheme :id id)))

(api.macros/defendpoint :post "/"
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

(api.macros/defendpoint :put "/:id"
  "Update an embedding theme."
  [{:keys [id]}
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
  [id :- ms/PositiveInt]
  (api/check-superuser)
  (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
    (api/check-404 theme)
    (t2/delete! :model/EmbeddingTheme :id id))
  api/generic-204-no-content)
