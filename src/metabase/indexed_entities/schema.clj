(ns metabase.indexed-entities.schema
  "Malli schemas for the indexed-entities module."
  (:require
   [malli.util :as mut]
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
   ::model-index.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::model-index.columns
  "Every column of `:model_index` except `id`, all optional."
  [:map {:closed true}
   [:model_id   {:optional true} [:maybe :int]]
   [:pk_ref     {:optional true} [:maybe ::model-index.pk-ref]]
   [:value_ref  {:optional true} [:maybe ::model-index.value-ref]]
   [:schedule   {:optional true} [:maybe :string]]
   [:state      {:optional true} [:maybe :string]]
   [:indexed_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:error      {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::model-index.create
  "What an insert of a ModelIndex accepts."
  (mut/select-keys (mr/schema ::model-index.columns)
                   [:model_id :pk_ref :value_ref :schedule :state :indexed_at :error :created_at :creator_id]))

(mr/def ::model-index.update
  "What an update of a ModelIndex accepts: no immutable columns."
  (mut/select-keys (mr/schema ::model-index.columns)
                   [:model_id :pk_ref :value_ref :schedule :state :indexed_at :error :created_at]))

(mr/def ::model-index.partial
  "A ModelIndex row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::model-index [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::model-index.column
  "A column of `model_index`, for the `:columns` option of the queries in [[metabase.indexed-entities.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::model-index.columns))))

(mr/def ::model-index-value
  "A ModelIndexValue as selected from the app DB: every column of `:model_index_value`."
  [:merge
   ::model-index-value.columns
   [:map {:closed true}]])

(mr/def ::model-index-value.columns
  "Every column of `:model_index_value` except `id`, all optional."
  [:map {:closed true}
   [:model_index_id {:optional true} [:maybe ms/PositiveInt]]
   [:model_pk       {:optional true} [:maybe :int]]
   [:name           {:optional true} [:maybe :string]]])

(mr/def ::model-index-value.create
  "What an insert of a ModelIndexValue accepts."
  (mut/select-keys (mr/schema ::model-index-value.columns) [:model_index_id :model_pk :name]))
