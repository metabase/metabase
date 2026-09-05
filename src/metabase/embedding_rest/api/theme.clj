(ns metabase.embedding-rest.api.theme
  "Endpoints for managing embedding themes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.embedding-rest.db :as embedding-rest.db]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defonce ^:private seed-defaults-lock (Object.))

(mr/def ::EmbeddingTheme
  [:map
   [:id        ms/PositiveInt]
   [:entity_id ms/NonBlankString]
   [:name      ms/NonBlankString]
   [:settings ms/Map]
   [:created_at  (ms/InstanceOfClass java.time.temporal.Temporal)]
   [:updated_at  (ms/InstanceOfClass java.time.temporal.Temporal)]])

(api.macros/defendpoint :get "/" :- [:sequential ::EmbeddingTheme]
  "Fetch a list of all embedding themes."
  []
  ; settings field is used for theme card previews.
  ; we can optimize this by only selecting the preview colors needed.
  (embedding-rest.db/embedding-themes))

(api.macros/defendpoint :get "/:id" :- ::EmbeddingTheme
  "Fetch a single embedding theme by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (embedding-rest.db/embedding-theme-exists? id))
  (embedding-rest.db/embedding-theme id))

(api.macros/defendpoint :post "/" :- ::EmbeddingTheme
  "Create a new embedding theme."
  [_route-params
   _query-params
   {:keys [name settings]} :- [:map
                               [:name     ms/NonBlankString]
                               [:settings ms/Map]]]
  (embedding-rest.db/insert-embedding-theme! {:name name
                                              :settings settings}))

(api.macros/defendpoint :put "/:id" :- ::EmbeddingTheme
  "Update an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name settings]} :- [:map
                               [:name {:optional true} [:maybe ms/NonBlankString]]
                               [:settings {:optional true} [:maybe ms/Map]]]]
  (api/check-404 (embedding-rest.db/embedding-theme-exists? id))
  (embedding-rest.db/update-embedding-theme! id
                                             (cond-> {}
                                               name (assoc :name name)
                                               settings (assoc :settings settings)))
  (embedding-rest.db/embedding-theme id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (embedding-rest.db/embedding-theme-exists? id))
  (embedding-rest.db/delete-embedding-theme! id)
  nil)

(api.macros/defendpoint :post "/:id/copy" :- ::EmbeddingTheme
  "Copy an embedding theme."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (embedding-rest.db/embedding-theme-exists? id))
  (let [source-theme (embedding-rest.db/embedding-theme id)]
    (embedding-rest.db/insert-embedding-theme! {:name (tru "Copy of {0}" (:name source-theme))
                                                :settings (:settings source-theme)})))

(api.macros/defendpoint :post "/seed-defaults" :- :nil
  "Seed default embedding themes on first call, using the payloads built by the frontend from the
  `METABASE_LIGHT_THEME` / `METABASE_DARK_THEME` constants.

  Idempotent: guarded by the `default-embedding-themes-seeded` setting. Once flipped, subsequent calls
  are no-ops even if the admin has since deleted the seeded themes, so deletions are preserved."
  [_route-params
   _query-params
   {:keys [themes]} :- [:map
                        [:themes [:sequential [:map
                                               [:name     ms/NonBlankString]
                                               [:settings ms/Map]]]]]]
  (locking seed-defaults-lock
    (t2/with-transaction [_conn]
      (when-not (embedding.settings/default-embedding-themes-seeded)
        (embedding-rest.db/insert-embedding-themes! themes)
        (embedding.settings/default-embedding-themes-seeded! true))))
  nil)
