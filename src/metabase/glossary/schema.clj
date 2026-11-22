(ns metabase.glossary.schema
  "Malli schemas for the glossary module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::glossary.term
  ms/NonBlankString)

(mr/def ::glossary.definition
  ms/NonBlankString)

(mr/def ::glossary
  "A Glossary as selected from the app DB: every column of `:glossary`."
  [:merge
   ::glossary.update
   [:map {:closed true}]])

(mr/def ::glossary.create
  "What creating a Glossary takes: its term, its definition and its creator."
  [:map {:closed true}
   [:term       ::glossary.term]
   [:definition ::glossary.definition]
   [:creator_id ::lib.schema.id/user]])

(mr/def ::glossary.update
  "A Glossary by its `id` with the columns to change: those of `::glossary.create`, and the columns the product sets."
  [:merge
   ::glossary.create
   [:map {:closed true}
    [:id         ms/PositiveInt]
    [:term       {:optional true} ::glossary.term]
    [:definition {:optional true} ::glossary.definition]
    [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]
    [:entity_id  {:optional true} [:maybe ms/NonBlankString]]
    [:created_at {:optional true} [:maybe ms/TemporalInstant]]
    [:updated_at {:optional true} [:maybe ms/TemporalInstant]]]])

(mr/def ::external-glossary
  "A Glossary as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::glossary [:entity_id :term :definition :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
