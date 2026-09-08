(ns metabase.indexed-entities.schema
  "Malli schemas for the indexed-entities module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::model-index
  "A ModelIndex as selected from the app DB: every column of `:model_index`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:model_id   [:maybe :int]]
   [:pk_ref     [:or :string :map sequential?]]
   [:value_ref  [:or :string :map sequential?]]
   [:schedule   [:or :string :map sequential?]]
   [:state      [:or :string :map sequential?]]
   [:indexed_at [:maybe ms/TemporalInstant]]
   [:error      [:maybe [:or :string :map sequential?]]]
   [:created_at ms/TemporalInstant]
   [:creator_id ::lib.schema.id/user]])

(mr/def ::model-index.update
  "What an update (or insert) of a ModelIndex accepts: every column of `:model_index` except `id`, all optional."
  [:map {:closed true}
   [:model_id   {:optional true} [:maybe :int]]
   [:pk_ref     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:value_ref  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:schedule   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:state      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:indexed_at {:optional true} [:maybe ms/TemporalInstant]]
   [:error      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::model-index-value
  "A ModelIndexValue as selected from the app DB: every column of `:model_index_value`."
  [:map {:closed true}
   [:model_index_id [:maybe ms/PositiveInt]]
   [:model_pk       :int]
   [:name           [:or :string :map sequential?]]])

(mr/def ::model-index-value.update
  "What an update (or insert) of a ModelIndexValue accepts: every column of `:model_index_value` except `id`, all optional."
  [:map {:closed true}
   [:model_index_id {:optional true} [:maybe ms/PositiveInt]]
   [:model_pk       {:optional true} [:maybe :int]]
   [:name           {:optional true} [:maybe [:or :string :map sequential?]]]])
