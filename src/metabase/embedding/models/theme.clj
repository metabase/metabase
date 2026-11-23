(ns metabase.embedding.models.theme
  "Model for embedding themes for use in the embedding theme editor."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
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

(mu/defn create-embedding-themes! :- [:sequential :map]
  "Insert the EmbeddingTheme `rows` and return the inserted instances, in the order of `rows`."
  [rows :- [:sequential ::embedding.schema/embedding-theme.create]]
  (if (seq rows) (embedding.db/insert-embedding-themes! rows) []))

(defn- write-theme-updates!
  "Writes `rows`, updates of EmbeddingThemes, with one statement for each distinct set of columns."
  [rows]
  (embedding.db/update-embedding-themes! rows))

(mu/defn update-embedding-themes! :- :nil
  "Apply `updates`, each the `:id` of an EmbeddingTheme with the columns to give it, in one transaction."
  [updates :- [:sequential [:merge
                            [:map {:closed true} [:id ms/PositiveInt]]
                            [:map {:closed true}
                             [:name     {:optional true} :string]
                             [:settings {:optional true} ::embedding.schema/embedding-theme.settings]]]]]
  (t2/with-transaction [_conn]
    (run! write-theme-updates! (partition-all app-db/update-partition-size updates)))
  nil)

(mu/defn delete-embedding-themes! :- :nil
  "Delete the EmbeddingThemes with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (embedding.db/delete-embedding-themes! ids))
  nil)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/EmbeddingTheme [_model]
  {:skip? false})

(defmethod serialization/spec :model/EmbeddingTheme [_]
  {:schema        ::embedding.schema/external-embedding-theme
   :copy          [:entity_id :name :settings]
   :skip          [:is_default]
   :storage-paths storage-paths})
