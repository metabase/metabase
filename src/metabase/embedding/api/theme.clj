(ns metabase.embedding.api.theme
  "Endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/"
  "Fetch a list of all embedding themes."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:%lower.name :asc]]}))

(api.macros/defendpoint :post "/"
  "Create a new `EmbeddingTheme`."
  [_route-params
   _query-params
   {:keys [name settings]} :- [:map
                               [:name     ms/NonBlankString]
                               [:settings [:map-of :keyword :any]]]]
  (api/check-superuser)
  (first (t2/insert-returning-instances! :model/EmbeddingTheme
                                         {:name name
                                          :settings settings})))

(api.macros/defendpoint :delete "/:id"
  "Delete an `EmbeddingTheme`."
  [id :- ms/PositiveInt]
  (api/check-superuser)
  (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
    (api/check-404 theme)
    (t2/delete! :model/EmbeddingTheme :id id))
  api/generic-204-no-content)
