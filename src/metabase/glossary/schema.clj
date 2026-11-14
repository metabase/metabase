(ns metabase.glossary.schema
  "Malli schemas for the glossary module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::glossary
  "A Glossary as selected from the app DB: every column of `:glossary`."
  [:merge
   ::glossary.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::glossary.update
  "What an update (or insert) of a Glossary accepts: every column of `:glossary` except `id`, all optional."
  [:map {:closed true}
   [:entity_id  {:optional true} [:maybe ms/NonBlankString]]
   [:term       {:optional true} [:maybe :string]]
   [:definition {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::external-glossary
  "A Glossary as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::glossary [:entity_id :term :definition :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
