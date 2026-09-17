(ns metabase.pulse.schema
  "Malli schemas for the pulse module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::pulse.parameter
  "One entry of the `:parameters` column of a Pulse, decoded. A dashboard subscription stores only the
  filter values it overrides (`:id`/`:value`), not the dashboard's own parameter declaration, so `:type`
  is not always present."
  ::parameters.schema/parameter-with-optional-type)

(mr/def ::pulse
  "A Pulse as selected from the app DB: every column of `:pulse`."
  [:merge
   ::pulse.columns
   [:map {:closed true}
    [:id                  ::lib.schema.id/pulse]]])

(mr/def ::pulse.columns
  "Every column of `:pulse` except `id`, all optional."
  [:map {:closed true}
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:name                {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:skip_if_empty       {:optional true} [:maybe :boolean]]
   [:alert_condition     {:optional true} [:maybe :string]]
   [:alert_first_only    {:optional true} [:maybe :boolean]]
   [:alert_above_goal    {:optional true} [:maybe :boolean]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position {:optional true} [:maybe :int]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:dashboard_id        {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:parameters          {:optional true} [:maybe [:sequential ::pulse.parameter]]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:disable_links       {:optional true} [:maybe :boolean]]])

(mr/def ::pulse.create
  "What an insert of a Pulse accepts."
  (mr/schema ::pulse.columns))

(mr/def ::pulse.update
  "What an update of a Pulse accepts: no immutable columns (`:created_at` and `:entity_id` are fixed at
  creation and never change after that)."
  (mut/select-keys (mr/schema ::pulse.columns)
                   [:creator_id :name :updated_at :skip_if_empty :alert_condition :alert_first_only
                    :alert_above_goal :collection_id :collection_position :archived :dashboard_id
                    :parameters :disable_links]))

(mr/def ::pulse.partial
  "A Pulse row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::pulse [:map {:closed true} [:id {:optional true} ::lib.schema.id/pulse]]])

(mr/def ::pulse.column
  "A column of `:pulse`, for the `:columns` option of the queries in [[metabase.pulse.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::pulse.columns))))

(mr/def ::pulse-card
  "A PulseCard as selected from the app DB: every column of `:pulse_card`."
  [:merge
   ::pulse-card.columns
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::pulse-card.columns
  "Every column of `:pulse_card` except `id`, all optional."
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

(mr/def ::pulse-card.create
  "What an insert of a PulseCard accepts."
  (mr/schema ::pulse-card.columns))

(mr/def ::pulse-card.update
  "What an update of a PulseCard accepts: no immutable columns (`:pulse_id` -- the Pulse a card is created
  under -- and `:entity_id` are fixed at creation and never change after that)."
  (mut/select-keys (mr/schema ::pulse-card.columns)
                   [:card_id :position :include_csv :include_xls :dashboard_card_id :format_rows
                    :pivot_results]))

(mr/def ::pulse-card.partial
  "A PulseCard row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::pulse-card [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::pulse-card.column
  "A column of `:pulse_card`, for the `:columns` option of the queries in [[metabase.pulse.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::pulse-card.columns))))

(mr/def ::pulse-channel.details
  "The `:details` column of a PulseChannel, decoded. Shape varies by `:channel_type` (email carries
  `:emails`; slack carries `:channel`/`:channels`/`:channel_id`; both may carry `:include_pdf`/
  `:attachment_only`), so every key is optional here rather than modeled as a `:channel_type`-dispatched
  `:multi`."
  [:map {:closed true}
   [:channel         {:optional true} [:maybe :string]]
   [:channels        {:optional true} [:maybe :string]]
   [:channel_id      {:optional true} [:maybe :string]]
   [:include_pdf     {:optional true} [:maybe :boolean]]
   [:attachment_only {:optional true} [:maybe :boolean]]
   [:emails          {:optional true} [:maybe [:sequential :string]]]])

(mr/def ::pulse-channel
  "A PulseChannel as selected from the app DB: every column of `:pulse_channel`."
  [:merge
   ::pulse-channel.columns
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::pulse-channel.columns
  "Every column of `:pulse_channel` except `id`, all optional."
  [:map {:closed true}
   [:pulse_id       {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:channel_type   {:optional true} [:maybe [:or :keyword :string]]]
   [:details        {:optional true} [:maybe ::pulse-channel.details]]
   [:schedule_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:schedule_hour  {:optional true} [:maybe :int]]
   [:schedule_day   {:optional true} [:maybe :string]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:schedule_frame {:optional true} [:maybe [:or :keyword :string]]]
   [:enabled        {:optional true} [:maybe :boolean]]
   [:entity_id      {:optional true} [:maybe :string]]
   [:channel_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::pulse-channel.create
  "What an insert of a PulseChannel accepts."
  (mr/schema ::pulse-channel.columns))

(mr/def ::pulse-channel.update
  "What an update of a PulseChannel accepts: no immutable columns (`:pulse_id` -- the Pulse a channel is
  created under --, `:entity_id`, and `:created_at` are fixed at creation and never change after that)."
  (mut/select-keys (mr/schema ::pulse-channel.columns)
                   [:channel_type :details :schedule_type :schedule_hour :schedule_day :updated_at
                    :schedule_frame :enabled :channel_id]))

(mr/def ::pulse-channel.partial
  "A PulseChannel row as selected, where a `:columns` narrowing may have left out any column. `:details` is typed
  as an open map here (rather than the closed `::pulse-channel.details` shape) because a stored row can carry
  keys older code wrote that the current shape does not enumerate, and a read must not throw on that."
  [:merge
   ::pulse-channel.columns
   [:map {:closed true}
    [:id      {:optional true} ms/PositiveInt]
    [:details {:optional true} [:maybe [:map]]]]])

(mr/def ::pulse-channel.column
  "A column of `:pulse_channel`, for the `:columns` option of the queries in [[metabase.pulse.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::pulse-channel.columns))))

(mr/def ::pulse-channel-recipient
  "A PulseChannelRecipient as selected from the app DB: every column of `:pulse_channel_recipient`."
  [:merge
   ::pulse-channel-recipient.columns
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::pulse-channel-recipient.columns
  "Every column of `:pulse_channel_recipient` except `id`, all optional."
  [:map {:closed true}
   [:pulse_channel_id {:optional true} [:maybe ms/PositiveInt]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::pulse-channel-recipient.create
  "What an insert of a PulseChannelRecipient accepts."
  (mr/schema ::pulse-channel-recipient.columns))

(mr/def ::pulse-channel-recipient.update
  "What an update of a PulseChannelRecipient accepts: no immutable columns (`:pulse_channel_id` -- the
  PulseChannel a recipient is created under -- never changes after that)."
  (mut/select-keys (mr/schema ::pulse-channel-recipient.columns) [:user_id]))

(mr/def ::pulse-channel-recipient.partial
  "A PulseChannelRecipient row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::pulse-channel-recipient [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::pulse-channel-recipient.column
  "A column of `:pulse_channel_recipient`, for the `:columns` option of the queries in
  [[metabase.pulse.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::pulse-channel-recipient.columns))))
