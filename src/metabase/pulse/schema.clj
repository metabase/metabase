(ns metabase.pulse.schema
  "Malli schemas for the pulse module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::pulse.parameter
  "One entry of the `:parameters` column of a Pulse, decoded."
  :map)

(mr/def ::pulse.parameters
  "The `:parameters` column of a Pulse, decoded."
  [:sequential ::pulse.parameter])

(mr/def ::pulse
  "A Pulse as selected from the app DB: every column of `:pulse`."
  [:map {:closed true}
   [:id                  ::lib.schema.id/pulse]
   [:creator_id          ::lib.schema.id/user]
   [:name                [:maybe :string]]
   [:created_at          ms/TemporalInstant]
   [:updated_at          ms/TemporalInstant]
   [:skip_if_empty       :boolean]
   [:alert_condition     [:maybe :string]]
   [:alert_first_only    [:maybe :boolean]]
   [:alert_above_goal    [:maybe :boolean]]
   [:collection_id       [:maybe ::lib.schema.id/collection]]
   [:collection_position [:maybe :int]]
   [:archived            [:maybe :boolean]]
   [:dashboard_id        [:maybe ::lib.schema.id/dashboard]]
   [:parameters          ::pulse.parameters]
   [:entity_id           :string]
   [:disable_links       [:maybe :boolean]]])

(mr/def ::pulse.update
  "What an update (or insert) of a Pulse accepts: every column of `:pulse` except `id`, all optional."
  [:map {:closed true}
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:name                {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:skip_if_empty       {:optional true} [:maybe :boolean]]
   [:alert_condition     {:optional true} [:maybe :string]]
   [:alert_first_only    {:optional true} [:maybe :boolean]]
   [:alert_above_goal    {:optional true} [:maybe :boolean]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position {:optional true} [:maybe :int]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:dashboard_id        {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:parameters          {:optional true} [:maybe ::pulse.parameters]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:disable_links       {:optional true} [:maybe :boolean]]])

(mr/def ::pulse-card
  "A PulseCard as selected from the app DB: every column of `:pulse_card`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:pulse_id          ::lib.schema.id/pulse]
   [:card_id           ::lib.schema.id/card]
   [:position          :int]
   [:include_csv       :boolean]
   [:include_xls       :boolean]
   [:dashboard_card_id [:maybe ::lib.schema.id/card]]
   [:entity_id         :string]
   [:format_rows       [:maybe :boolean]]
   [:pivot_results     [:maybe :boolean]]])

(mr/def ::pulse-card.update
  "What an update (or insert) of a PulseCard accepts: every column of `:pulse_card` except `id`, all optional."
  [:map {:closed true}
   [:pulse_id          {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:card_id           {:optional true} [:maybe ::lib.schema.id/card]]
   [:position          {:optional true} [:maybe :int]]
   [:include_csv       {:optional true} [:maybe :boolean]]
   [:include_xls       {:optional true} [:maybe :boolean]]
   [:dashboard_card_id {:optional true} [:maybe ::lib.schema.id/card]]
   [:entity_id         {:optional true} [:maybe :string]]
   [:format_rows       {:optional true} [:maybe :boolean]]
   [:pivot_results     {:optional true} [:maybe :boolean]]])

(mr/def ::pulse-channel.details
  "The `:details` column of a PulseChannel, decoded."
  :map)

(mr/def ::pulse-channel
  "A PulseChannel as selected from the app DB: every column of `:pulse_channel`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:pulse_id       ::lib.schema.id/pulse]
   [:channel_type   [:or :keyword :string]]
   [:details        ::pulse-channel.details]
   [:schedule_type  [:or :keyword :string]]
   [:schedule_hour  [:maybe :int]]
   [:schedule_day   [:maybe :string]]
   [:created_at     ms/TemporalInstant]
   [:updated_at     ms/TemporalInstant]
   [:schedule_frame [:maybe [:or :keyword :string]]]
   [:enabled        :boolean]
   [:entity_id      :string]
   [:channel_id     [:maybe ms/PositiveInt]]])

(mr/def ::pulse-channel.update
  "What an update (or insert) of a PulseChannel accepts: every column of `:pulse_channel` except `id`, all optional."
  [:map {:closed true}
   [:pulse_id       {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:channel_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:details        {:optional true} [:maybe ::pulse-channel.details]]
   [:schedule_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:schedule_hour  {:optional true} [:maybe :int]]
   [:schedule_day   {:optional true} [:maybe :string]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:schedule_frame {:optional true} [:maybe [:or :keyword :string]]]
   [:enabled        {:optional true} [:maybe :boolean]]
   [:entity_id      {:optional true} [:maybe :string]]
   [:channel_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::pulse-channel-recipient
  "A PulseChannelRecipient as selected from the app DB: every column of `:pulse_channel_recipient`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:pulse_channel_id ms/PositiveInt]
   [:user_id          ::lib.schema.id/user]])

(mr/def ::pulse-channel-recipient.update
  "What an update (or insert) of a PulseChannelRecipient accepts: every column of `:pulse_channel_recipient` except `id`, all optional."
  [:map {:closed true}
   [:pulse_channel_id {:optional true} [:maybe ms/PositiveInt]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]])
