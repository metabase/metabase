(ns metabase.models.schema
  "Malli schemas shared by the serialized forms of models."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- normalize-external-meta
  "The `:serdes/meta` of a serialized entity, from the full path of an older export: its containers, outermost first,
  then the entity itself, each with its id."
  [path]
  (cond-> path
    (sequential? path) (-> peek (select-keys [:model]) vector)))

(mr/def ::external-meta
  "The `:serdes/meta` of a serialized entity, which names its model."
  [:tuple {:decode/normalize normalize-external-meta}
   [:map {:closed true}
    [:model :string]]])

(mr/def ::external-date
  "A timestamp as serialization exports it, or as ingestion parses it back from an `_at` key."
  [:or :string ms/TemporalInstant])

(mr/def ::visualization-settings
  "Visualization settings, normalized to the shape a visualization settings column stores and reads them back in."
  [:map {:closed false, ::mr/deliberately-open true, :description "visualization settings"
         :decode/normalize #(some-> % mi/stored-visualization-settings)}])
