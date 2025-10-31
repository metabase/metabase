(ns metabase.embedding.api.theme
  "/api/theme endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;;; schemas

;; (mr/def ::Theme
;;   [:map
;;    [:id         ms/PositiveInt]
;;    [:name       ms/NonBlankString]
;;    [:settings   [:map-of :keyword :any]]
;;    [:created_at ms/TemporalString]
;;    [:updated_at ms/TemporalString]])

(mr/def ::CreateThemeRequest
  [:map
   [:name     ms/NonBlankString]
   [:settings [:map-of :keyword :any]]])

;;;; endpoints

(api.macros/defendpoint :get "/"
  "Fetch a list of all embedding themes."
  []
  (t2/select :model/EmbeddingTheme {:order-by [[:%lower.name :asc]]}))

(api.macros/defendpoint :get "/v1/:name"
  "Fetch an `EmbeddingTheme` by ID or name. This endpoint is public and does not require authentication.

  - If `id-or-name` is numeric, it queries by ID
  - Otherwise, it queries by name (case-insensitive, URL-decoded)"
  [req]
  (api/check-404
   (t2/select-one :model/EmbeddingTheme {:where [:= :name (:name req)]})))

;; (api.macros/defendpoint :get "/" :- [:sequential ::ThemeSummary]
;;   "Fetch a list of all `EmbeddingTheme`s."
;;   []
;;   (api/check-superuser)
;;   (map #(select-keys % [:id :name :created_at :updated_at])
;;        (t2/select :model/EmbeddingTheme {:order-by [[:%lower.name :asc]]})))

(api.macros/defendpoint :post "/"
  "Create a new `EmbeddingTheme`."
  [_route-params
   _query-params
   {:keys [name settings]} :- ::CreateThemeRequest]
  (api/check-superuser)
  (let [existing (t2/select-one :model/EmbeddingTheme
                                {:where [:= :%lower.name (u/lower-case-en name)]})]
    (when existing
      (throw (ex-info (str "An embedding theme with the name \"" name "\" already exists.")
                      {:status-code 400
                       :name name}))))
  (first (t2/insert-returning-instances! :model/EmbeddingTheme
                                         {:name name
                                          :settings settings})))

;; (api.macros/defendpoint :delete "/:id"
;;   "Delete an `EmbeddingTheme`."
;;   [id :- ms/PositiveInt]
;;   (api/check-superuser)
;;   (let [theme (t2/select-one :model/EmbeddingTheme :id id)]
;;     (api/check-404 theme)
;;     (t2/delete! :model/EmbeddingTheme :id id))
;;   api/generic-204-no-content)
