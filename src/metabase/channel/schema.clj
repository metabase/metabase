(ns metabase.channel.schema
  "Malli schemas for the channel module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::channel.details
  "The `:details` column of a Channel, decoded."
  :map)

(mr/def ::channel
  "A Channel as selected from the app DB: every column of `:channel`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:name        :string]
   [:description [:maybe :string]]
   [:type        [:or :keyword :string]]
   [:details     ::channel.details]
   [:active      :boolean]
   [:created_at  ms/TemporalInstant]
   [:updated_at  ms/TemporalInstant]])

(mr/def ::channel.update
  "What an update (or insert) of a Channel accepts: every column of `:channel` except `id`, all optional."
  [:map {:closed true}
   [:name        {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:type        {:optional true} [:maybe [:or :keyword :string]]]
   [:details     {:optional true} [:maybe ::channel.details]]
   [:active      {:optional true} [:maybe :boolean]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::channel-template.details
  "The `:details` column of a ChannelTemplate, decoded."
  :map)

(mr/def ::channel-template
  "A ChannelTemplate as selected from the app DB: every column of `:channel_template`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:name         :string]
   [:channel_type [:or :keyword :string]]
   [:details      [:maybe ::channel-template.details]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]])

(mr/def ::channel-template.update
  "What an update (or insert) of a ChannelTemplate accepts: every column of `:channel_template` except `id`, all optional."
  [:map {:closed true}
   [:name         {:optional true} [:maybe :string]]
   [:channel_type {:optional true} [:maybe [:or :keyword :string]]]
   [:details      {:optional true} [:maybe ::channel-template.details]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
