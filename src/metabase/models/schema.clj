(ns metabase.models.schema
  "Malli schemas shared by the serialized forms of models."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::external-meta
  "The `:serdes/meta` path of a serialized entity: its containers, outermost first, then the entity itself. A file
  stores just the `:model` of the entity, and its nested entities store none."
  [:sequential [:map {:closed true}
                [:model :string]
                [:id    {:optional true} [:maybe :string]]
                [:label {:optional true} [:maybe :string]]]])

(mr/def ::external-date
  "A timestamp as serialization exports it, or as ingestion parses it back from an `_at` key."
  [:or :string ms/TemporalInstant])
