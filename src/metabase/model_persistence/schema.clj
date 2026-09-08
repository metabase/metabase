(ns metabase.model-persistence.schema
  "Malli schemas for the model-persistence module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::persisted-info
  "A PersistedInfo as selected from the app DB: every column of `:persisted_info`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:database_id     ::lib.schema.id/database]
   [:card_id         [:maybe ::lib.schema.id/card]]
   [:question_slug   [:or :string :map sequential?]]
   [:table_name      [:or :string :map sequential?]]
   [:definition      [:maybe [:or :string :map sequential?]]]
   [:query_hash      [:maybe [:or :string :map sequential?]]]
   [:active          :boolean]
   [:state           [:or :string :map sequential?]]
   [:refresh_begin   ms/TemporalInstant]
   [:refresh_end     [:maybe ms/TemporalInstant]]
   [:state_change_at [:maybe ms/TemporalInstant]]
   [:error           [:maybe [:or :string :map sequential?]]]
   [:created_at      ms/TemporalInstant]
   [:creator_id      [:maybe ::lib.schema.id/user]]])

(mr/def ::persisted-info.update
  "What an update (or insert) of a PersistedInfo accepts: every column of `:persisted_info` except `id`, all optional."
  [:map {:closed true}
   [:database_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:card_id         {:optional true} [:maybe ::lib.schema.id/card]]
   [:question_slug   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:table_name      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:definition      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:query_hash      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:active          {:optional true} [:maybe :boolean]]
   [:state           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:refresh_begin   {:optional true} [:maybe ms/TemporalInstant]]
   [:refresh_end     {:optional true} [:maybe ms/TemporalInstant]]
   [:state_change_at {:optional true} [:maybe ms/TemporalInstant]]
   [:error           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:creator_id      {:optional true} [:maybe ::lib.schema.id/user]]])
