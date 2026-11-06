(ns metabase.embedding.models.theme
  "Model for embedding themes for use in the embedding theme editor."
  (:require
   [metabase.embedding.schema :as embedding.schema]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.serialization.core :as serialization]
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

(defmethod serdes/make-spec "EmbeddingTheme"
  [_model-name _opts]
  {:schema    ::embedding.schema/external-embedding-theme
   :copy      [:entity_id :name :settings]
   ;; is_default means the theme is a default theme for this instance.
   :skip      [:is_default]})

(defmethod serdes/storage-path "EmbeddingTheme"
  [entity _ctx]
  [{:label "embedding_themes"} {:label (:name entity) :key (:entity_id entity)}])

;;;; serialization

(defmethod serialization/spec :model/EmbeddingTheme [_]
  {:schema ::embedding.schema/external-embedding-theme
   :copy   [:entity_id :name :settings]
   :skip   [:is_default]})

(defmethod serialization/storage-paths :model/EmbeddingTheme [_ entities _ctx]
  (mapv (fn [entity]
          [{:label "embedding_themes"} {:label (:name entity) :key (:entity_id entity)}])
        entities))
