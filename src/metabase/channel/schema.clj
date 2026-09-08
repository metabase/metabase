(ns metabase.channel.schema
  "Malli schemas for the channel module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::channel
  "A Channel as selected from the app DB: every column of `:channel`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        :string]
   [:description [:maybe [:or :string :map sequential?]]]
   [:type        [:or :keyword :string :map sequential?]]
   [:details     [:or :string :map sequential?]]
   [:active      :boolean]
   [:created_at  ms/TemporalInstant]
   [:updated_at  ms/TemporalInstant]])

(mr/def ::channel.update
  "What an update (or insert) of a Channel accepts: every column of `:channel` except `id`, all optional."
  [:map {:closed true}
   [:name        {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe [:or :string :map sequential?]]]
   [:type        {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:details     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:active      {:optional true} [:maybe :boolean]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::channel-template
  "A ChannelTemplate as selected from the app DB: every column of `:channel_template`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:name         :string]
   [:channel_type [:or :keyword :string :map sequential?]]
   [:details      [:maybe [:or :string :map sequential?]]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]])

(mr/def ::channel-template.update
  "What an update (or insert) of a ChannelTemplate accepts: every column of `:channel_template` except `id`, all optional."
  [:map {:closed true}
   [:name         {:optional true} [:maybe :string]]
   [:channel_type {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:details      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
