(ns metabase.indexed-entities.schema
  "Malli schemas for the indexed-entities module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::model-index.pk-ref
  "The `:pk_ref` column of a ModelIndex, decoded."
  vector?)

(mr/def ::model-index.value-ref
  "The `:value_ref` column of a ModelIndex, decoded."
  vector?)

(mr/def ::model-index
  "A ModelIndex as selected from the app DB: every column of `:model_index`."
  [:merge
   ::model-index.update
   [:map {:closed true, :probe/id "src/metabase/indexed_entities/schema.clj:20"}
    [:id         ms/PositiveInt]]])

(mr/def ::model-index.update
  "What an update (or insert) of a ModelIndex accepts: every column of `:model_index` except `id`, all optional."
  [:map {:closed true}
   [:model_id   {:optional true} [:maybe :int]]
   [:pk_ref     {:optional true} [:maybe ::model-index.pk-ref]]
   [:value_ref  {:optional true} [:maybe ::model-index.value-ref]]
   [:schedule   {:optional true} [:maybe :string]]
   [:state      {:optional true} [:maybe :string]]
   [:indexed_at {:optional true} [:maybe ms/TemporalInstant]]
   [:error      {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::model-index-value
  "A ModelIndexValue as selected from the app DB: every column of `:model_index_value`."
  [:merge
   ::model-index-value.update
   [:map {:closed true, :probe/id "src/metabase/indexed_entities/schema.clj:40"}]])

(mr/def ::model-index-value.update
  "What an update (or insert) of a ModelIndexValue accepts: every column of `:model_index_value` except `id`, all optional."
  [:map {:closed true}
   [:model_index_id {:optional true} [:maybe ms/PositiveInt]]
   [:model_pk       {:optional true} [:maybe :int]]
   [:name           {:optional true} [:maybe :string]]])
