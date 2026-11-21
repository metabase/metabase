(ns metabase.embedding.models.theme
  "Model for embedding themes for use in the embedding theme editor."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EmbeddingTheme [_model] :embedding_theme)

(doto :model/EmbeddingTheme
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/read-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;;;; transforms

(t2/deftransforms :model/EmbeddingTheme
  {:settings mi/transform-json-no-keywordization})

;;;; serialization

(defn- storage-paths
  "The storage path of each of the EmbeddingTheme `entities`, under `embedding_themes/` by name."
  [entities _ctx]
  (mapv (fn [entity]
          [{:label "embedding_themes"} {:label (:name entity) :key (:entity_id entity)}])
        entities))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-embedding-theme! :- :map
  "Insert the EmbeddingTheme `row` and return it."
  [row :- ::embedding.schema/embedding-theme.create]
  (embedding.db/insert-embedding-theme! row))

(mu/defn create-embedding-themes!
  "Insert the EmbeddingTheme `rows`."
  [rows :- [:sequential ::embedding.schema/embedding-theme.create]]
  (embedding.db/insert-embedding-themes! rows))

(mu/defn update-embedding-theme!
  "Apply `changes` to the EmbeddingTheme with `id`."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:name     {:optional true} :string]
               [:settings {:optional true} ::embedding.schema/embedding-theme.settings]]]
  (embedding.db/update-embedding-theme! id changes))

(mu/defn delete-embedding-theme!
  "Delete the EmbeddingTheme with `id`."
  [id :- ms/PositiveInt]
  (embedding.db/delete-embedding-theme! id))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/EmbeddingTheme [_model]
  {:skip? false})

(defmethod serialization/spec :model/EmbeddingTheme [_]
  {:schema        ::embedding.schema/external-embedding-theme
   :copy          [:entity_id :name :settings]
   :skip          [:is_default]
   :storage-paths storage-paths})
