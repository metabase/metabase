(ns metabase.embedding.models.theme
  "Model for embedding themes for use in the embedding theme editor."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EmbeddingTheme [_model] :embedding_theme)

(doto :model/EmbeddingTheme
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;;; transforms

(t2/deftransforms :model/EmbeddingTheme
  {:settings mi/transform-json})
