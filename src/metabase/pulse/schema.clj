(ns metabase.pulse.schema
  "Malli schemas for the pulse module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::pulse.parameter
  "One entry of the `:parameters` column of a Pulse, decoded. A dashboard subscription stores only the
  filter values it overrides (`:id`/`:value`), not the dashboard's own parameter declaration, so `:type`
  is not always present."
  ::parameters.schema/parameter-with-optional-type)

(def ^:private dashboard-subscription-columns
  "The columns a dashboard subscription leaves nil."
  [:collection_position :alert_condition :alert_first_only :alert_above_goal])

(defn- check-dashboard-subscription
  "Returns `pulse`, throwing a 400 when it holds `:dashboard_id` and every column of a dashboard subscription and is a
  dashboard subscription with a column of an alert or a collection position."
  [pulse]
  (when (and (map? pulse)
             (every? #(contains? pulse %) (cons :dashboard_id dashboard-subscription-columns))
             (some? (:dashboard_id pulse))
             (some #(some? (get pulse %)) dashboard-subscription-columns))
    (throw (ex-info (tru "A dashboard subscription cannot have the columns of an alert or a collection position.")
                    {:status-code 400})))
  pulse)

(mr/def ::pulse
  "A Pulse as selected from the app DB: every column of `:pulse`."
  [:merge
   ::pulse.update
   [:map {:closed true}
    [:id                  ::lib.schema.id/pulse]]])

(mr/def ::pulse.update
  "What an update (or insert) of a Pulse accepts: every column of `:pulse` except `id`, all optional, a dashboard
  subscription leaving the alert columns and the collection position nil when it holds them all."
  [:map {:closed true :decode/normalize {:leave check-dashboard-subscription}}
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
   [:archived_directly   {:optional true} [:maybe :boolean]]
   [:dashboard_id        {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:parameters          {:optional true} [:maybe [:sequential ::pulse.parameter]]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:disable_links       {:optional true} [:maybe :boolean]]])

(mr/def ::pulse-card.position
  ms/IntGreaterThanOrEqualToZero)

(mr/def ::pulse-card
  "A PulseCard as selected from the app DB: every column of `:pulse_card`."
  [:merge
   ::pulse-card.update
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::pulse-card.update
  "What an update (or insert) of a PulseCard accepts: every column of `:pulse_card` except `id`, all optional."
  [:map {:closed true}
   [:pulse_id          {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:card_id           {:optional true} [:maybe ::lib.schema.id/card]]
   [:position          {:optional true} ::pulse-card.position]
   [:include_csv       {:optional true} [:maybe :boolean]]
   [:include_xls       {:optional true} [:maybe :boolean]]
   [:dashboard_card_id {:optional true} [:maybe ::lib.schema.id/card]]
   [:entity_id         {:optional true} [:maybe :string]]
   [:format_rows       {:optional true} [:maybe :boolean]]
   [:pivot_results     {:optional true} [:maybe :boolean]]])

(def ^:private subject-max-length
  "Inboxes truncate long before this; it bounds what a client can store."
  255)

(mr/def ::email-subject
  "A dashboard subscription email subject: one line, not blank, at most 255 characters."
  [:and
   ms/NonBlankString
   [:string {:max subject-max-length}]
   ;; the value becomes a mail header, so a line break would let it inject headers
   [:re {:error/message "a single line"} #"\A[^\r\n]*\z"]])

(mr/def ::pulse-channel.details
  "The `:details` column of a PulseChannel, decoded. Shape varies by `:channel_type` (email carries
  `:emails` and `:subject`; slack carries `:channel`/`:channels`/`:channel_id`; both may carry `:include_pdf`/
  `:attachment_only`), so every key is optional here rather than modeled as a `:channel_type`-dispatched
  `:multi`."
  [:map {:closed true}
   [:channel         {:optional true} [:maybe :string]]
   [:channels        {:optional true} [:maybe :string]]
   [:channel_id      {:optional true} [:maybe :string]]
   [:include_pdf     {:optional true} [:maybe :boolean]]
   [:attachment_only {:optional true} [:maybe :boolean]]
   [:subject         {:optional true} [:maybe ::email-subject]]
   [:emails          {:optional true} [:maybe [:sequential :string]]]])

(mr/def ::pulse-channel.channel-type
  [:or [:enum "email" "slack" "http"] [:enum :email :slack :http]])

(mr/def ::pulse-channel.schedule-type-name
  [:enum "hourly" "daily" "weekly" "monthly"])

(mr/def ::pulse-channel.schedule-type
  [:or ::pulse-channel.schedule-type-name [:enum :hourly :daily :weekly :monthly]])

(mr/def ::pulse-channel.schedule-hour
  [:int {:min 0 :max 23}])

(mr/def ::pulse-channel.schedule-day
  [:enum "sun" "mon" "tue" "wed" "thu" "fri" "sat"])

(mr/def ::pulse-channel.schedule-frame-name
  [:enum "first" "mid" "last"])

(mr/def ::pulse-channel.schedule-frame
  [:or ::pulse-channel.schedule-frame-name [:enum :first :mid :last]])

(defn schedule-fits-type?
  "Whether the hour, day and frame of the PulseChannel `channel` are those its `:schedule_type` takes."
  [{:keys [schedule_type schedule_hour schedule_day schedule_frame]}]
  (let [frame (some-> schedule_frame keyword)
        hour? (and (integer? schedule_hour) (<= 0 schedule_hour 23))
        day?  (contains? #{"sun" "mon" "tue" "wed" "thu" "fri" "sat"} schedule_day)]
    (case (some-> schedule_type keyword)
      :hourly  true
      :daily   hour?
      :weekly  (and hour? day?)
      :monthly (and hour?
                    (contains? #{:first :mid :last} frame)
                    (or (not= :mid frame) (nil? schedule_day)))
      false)))

(defn check-schedule
  "Returns `channel`, throwing a 400 when it holds every schedule column and its hour, day and frame are not those its
  schedule type takes."
  [channel]
  (when (and (map? channel)
             (every? #(contains? channel %) [:schedule_type :schedule_hour :schedule_day :schedule_frame])
             (not (schedule-fits-type? channel)))
    (throw (ex-info (tru "Invalid schedule: the schedule type does not take this hour, day or week of the month.")
                    {:status-code 400})))
  channel)

(mr/def ::pulse-channel
  "A PulseChannel as selected from the app DB: every column of `:pulse_channel`."
  [:merge
   ::pulse-channel.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::pulse-channel.update
  "What an update (or insert) of a PulseChannel accepts: every column of `:pulse_channel` except `id`, all optional, its
  schedule fitting its type when it holds every schedule column."
  [:map {:closed true :decode/normalize {:leave check-schedule}}
   [:pulse_id       {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:channel_type   {:optional true} ::pulse-channel.channel-type]
   [:details        {:optional true} [:maybe ::pulse-channel.details]]
   [:schedule_type  {:optional true} ::pulse-channel.schedule-type]
   [:schedule_hour  {:optional true} [:maybe ::pulse-channel.schedule-hour]]
   [:schedule_day   {:optional true} [:maybe ::pulse-channel.schedule-day]]
   [:created_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at     {:optional true} [:maybe ms/TemporalInstant]]
   [:schedule_frame {:optional true} [:maybe ::pulse-channel.schedule-frame]]
   [:enabled        {:optional true} [:maybe :boolean]]
   [:entity_id      {:optional true} [:maybe :string]]
   [:channel_id     {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::pulse-channel-recipient
  "A PulseChannelRecipient as selected from the app DB: every column of `:pulse_channel_recipient`."
  [:merge
   ::pulse-channel-recipient.update
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::pulse-channel-recipient.update
  "What an update (or insert) of a PulseChannelRecipient accepts: every column of `:pulse_channel_recipient` except `id`, all optional."
  [:map {:closed true}
   [:pulse_channel_id {:optional true} [:maybe ms/PositiveInt]]
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]])
