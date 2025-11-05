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
