(ns metabase.embedding.models.embedding-theme
  "Model for EmbeddingTheme, which stores named themes for React SDK and EAJS embedding."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EmbeddingTheme [_model] :embedding_theme)

(doto :model/EmbeddingTheme
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;;; schemas

(mr/def ::EmbeddingTheme
  [:map
   [:id                           ms/PositiveInt]
   [:name                         [:and ms/NonBlankString [:string {:max 255}]]]
   [:settings                     [:map-of :keyword :any]]
   [:created_at                   ms/TemporalString]
   [:updated_at                   ms/TemporalString]])

;;;; transforms

(t2/deftransforms :model/EmbeddingTheme
  {:settings mi/transform-json})
