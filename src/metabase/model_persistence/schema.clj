(ns metabase.model-persistence.schema
  "Malli schemas for the model-persistence module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::persisted-info.definition
  "The `:definition` column of a PersistedInfo, decoded."
  ::lib.schema.metadata/persisted-info.definition)

(mr/def ::persisted-info
  "A PersistedInfo as selected from the app DB: every column of `:persisted_info`."
  [:merge
   ::persisted-info.columns
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::persisted-info.columns
  "Every column of `:persisted_info` except `id`, all optional."
  [:map {:closed true}
   [:database_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:card_id         {:optional true} [:maybe ::lib.schema.id/card]]
   [:question_slug   {:optional true} [:maybe :string]]
   [:table_name      {:optional true} [:maybe :string]]
   [:definition      {:optional true} [:maybe ::persisted-info.definition]]
   [:query_hash      {:optional true} [:maybe :string]]
   [:active          {:optional true} [:maybe :boolean]]
   [:state           {:optional true} [:maybe :string]]
   [:refresh_begin   {:optional true} [:maybe ms/TemporalInstant]]
   [:refresh_end     {:optional true} [:maybe ms/TemporalInstant]]
   [:state_change_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:error           {:optional true} [:maybe :string]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:creator_id      {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::persisted-info.create
  "What an insert of a PersistedInfo accepts: every column of `:persisted_info` except `id`, all optional."
  (mr/schema ::persisted-info.columns))

(mr/def ::persisted-info.update
  "What an update of a PersistedInfo accepts: every column of `:persisted_info` except `id`, `card_id`, `created_at`,
  and `creator_id`, all optional."
  (-> (mr/schema ::persisted-info.columns)
      (mut/dissoc :card_id)
      (mut/dissoc :created_at)
      (mut/dissoc :creator_id)))

(mr/def ::persisted-info.partial
  "A PersistedInfo row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::persisted-info [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::persisted-info.column
  "A column of `persisted_info`, for the `:columns` option of the queries in [[metabase.model-persistence.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::persisted-info.columns))))
