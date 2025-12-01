(ns metabase-enterprise.representations.toucan.core
  (:require
   [metabase.api.common :as api]
   [metabase.config.core :as config]))

(defmulti with-toucan-defaults
  "Adds default, required values to a toucan representation."
  {:arglists '([t2-model toucan-entity])}
  (fn [t2-model _toucan-entity]
    t2-model))

(defn- with-question-defaults
  [question-entity]
  (->> question-entity
       (merge {:visualization_settings {}
               :display :table
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defn- with-model-defaults
  [model-entity]
  (->> model-entity
       (merge {:visualization_settings {}
               :display :table
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defn- with-metric-defaults
  [metric-entity]
  (->> metric-entity
       (merge {:visualization_settings {}
               :display :table
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defmethod with-toucan-defaults :model/Card
  [_t2-model card-entity]
  (case (:type card-entity)
    :question (with-question-defaults card-entity)
    :model (with-model-defaults card-entity)
    :metric (with-metric-defaults card-entity)))

(defmethod with-toucan-defaults :model/Collection
  [_t2-model collection-entity]
  collection-entity)

(defmethod with-toucan-defaults :model/Document
  [_t2-model document-entity]
  (->> document-entity
       (merge {:creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defmethod with-toucan-defaults :model/NativeQuerySnippet
  [_t2-model snippet-entity]
  (->> snippet-entity
       (merge {:description ""
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defmethod with-toucan-defaults :model/Transform
  [_t2-model transform-entity]
  (->> transform-entity
       (merge {:description ""})))

(defmethod with-toucan-defaults :model/Timeline
  [_t2-model timeline-entity]
  (->> timeline-entity
       (merge {:creator_id (or api/*current-user-id* config/internal-mb-user-id)})))

(defmethod with-toucan-defaults :model/TimelineEvent
  [_t2-model event-entity]
  (->> event-entity
       (merge {:creator_id (or api/*current-user-id* config/internal-mb-user-id)})))
