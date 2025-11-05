(ns metabase.embedding.models.theme
  "Model for embedding themes for use in the embedding theme editor."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
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
  {:settings mi/transform-json})

;;;; serialization

(defmethod serdes/hash-fields :model/EmbeddingTheme
  [_embedding-theme]
  [:name :created_at])

(defmethod serdes/make-spec "EmbeddingTheme"
  [_model-name _opts]
  {:copy      [:entity_id :name :settings]
   :skip      []
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)}})

(defmethod serdes/storage-path "EmbeddingTheme"
  [entity _ctx]
  (let [{:keys [id label]} (-> entity serdes/path last)]
    ["embedding_themes" (serdes/storage-leaf-file-name id label)]))
