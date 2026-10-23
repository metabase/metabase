(ns metabase.metabot.tools.create-alert
  "Create alerts and check Slack delivery for alerts and dashboard subscriptions.

  The alert watches a saved question and posts to the Slack conversation that the request came from."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.notification.api :as notification.api]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- schedule->cron
  "Convert the tool schedule format to a Quartz cron string.
  The schedule comes in as e.g. {:frequency :daily :hour 9} and needs to be
  converted to a Quartz cron string like \"0 0 9 * * ? *\"."
  [schedule]
  (u.cron/schedule-map->cron-string (metabot.tools.u/schedule->schedule-map schedule)))

(defn check-slack-configured!
  "Throw an unrecoverable error when Slack isn't connected to Metabase, which only an admin can fix."
  []
  (when-not (channel.settings/slack-configured?)
    (tools/unrecoverable!
     ::slack-not-configured
     {:user-message (tru "Slack isn''t connected to Metabase. An admin can connect it in Admin settings.")})))

(defn current-slack-channel
  "Return the display name of the Slack conversation for the call in `ctx`.

  Alerts and subscriptions name their channel this way. Throws an unrecoverable error when the call didn't come
  from Slack, when Slack isn't connected, or when the conversation isn't in Metabase's cached list of channels.
  Slack posts each error's user message in the conversation, so none of them names a channel."
  [ctx]
  (let [channel-id (or (some-> (:memory-atom ctx) deref :context :slack_channel_id)
                       (tools/unrecoverable!
                        ::not-in-slack
                        {:user-message (tru "This can only be set up from a Slack conversation.")}))]
    (check-slack-configured!)
    (or (:display-name (channel.settings/find-cached-slack-channel-or-username channel-id))
        (tools/unrecoverable!
         ::unknown-slack-conversation
         {:user-message (tru "Metabase can''t send alerts or subscriptions to this conversation. It can send them to public channels and to private channels that the Metabase app has been added to. A channel created in the last few hours may not be available yet.")
          :data         {:channel-id channel-id}}))))

(defn do-with-refusal
  "Call `thunk`, and turn a 403 that it throws into the unrecoverable error `code` with `user-message`.

  Anything else that it throws passes through."
  [code user-message thunk]
  (try
    (thunk)
    (catch Throwable e
      (if (= 403 (:status-code (ex-data e)))
        (tools/unrecoverable! code {:user-message user-message :cause e})
        (throw e)))))

(defn- create-alert!
  "Create an alert on the card with `card-id` that posts to the Slack `channel`, and return it."
  [{:keys [card-id channel schedule send-condition send-once]}]
  (do-with-refusal
   ::no-alert-permission
   (tru "You don''t have permission to create alerts.")
   #(notification.api/create-notification!
     {:payload_type  :notification/card
      :active        true
      :creator_id    api/*current-user-id*
      :payload       {:card_id        card-id
                      :send_condition send-condition
                      :send_once      send-once}
      :subscriptions [{:type          :notification-subscription/cron
                       :cron_schedule (schedule->cron schedule)}]
      :handlers      [{:channel_type :channel/slack
                       :recipients   [{:type    :notification-recipient/raw-value
                                       :details {:value channel}}]}]})))

(def schedule-schema
  "Schedule schema shared with create-dashboard-subscription tool."
  [:or
   [:map {:closed true}
    [:frequency [:= "hourly"]]]
   [:map {:closed true}
    [:frequency [:= "daily"]]
    [:hour [:int {:min 0 :max 23}]]]
   [:map {:closed true}
    [:frequency [:= "weekly"]]
    [:day_of_week [:enum "sunday" "monday" "tuesday" "wednesday" "thursday" "friday" "saturday"]]
    [:hour [:int {:min 0 :max 23}]]]
   [:map {:closed true}
    [:frequency [:= "monthly"]]
    [:day_of_month [:enum "first-calendar-day"
                    "first-sunday" "first-monday" "first-tuesday" "first-wednesday"
                    "first-thursday" "first-friday" "first-saturday"
                    "middle-of-month"
                    "last-calendar-day"
                    "last-sunday" "last-monday" "last-tuesday" "last-wednesday"
                    "last-thursday" "last-friday" "last-saturday"]]
    [:hour [:int {:min 0 :max 23}]]]])

(def ^:private alert-schema
  [:map {:closed true}
   [:card_id :int]
   [:send_condition [:enum "has_result" "goal_above" "goal_below"]]
   [:schedule schedule-schema]
   [:send_once {:optional true :default false} :boolean]])

(def ^:private tool-description
  (str "Create an alert that notifies the user's current Slack channel based on a saved question's\n"
       "results on a recurring schedule. Alerts are for saved questions (cards), not dashboards; use\n"
       "the dashboard subscription tool for dashboard delivery.\n"
       "\n"
       "When the user asks to be alerted or notified about a saved question's results, you MUST call\n"
       "this tool; never claim an alert was created without calling it. If you are missing required\n"
       "information, ask the user for it rather than guessing.\n"
       "\n"
       "`card_id` is the ID of a saved question, from a prior search result or the conversation context.\n"
       "\n"
       "`send_condition` decides when the alert fires:\n"
       "- `has_result`: the question returns any rows. Default this when the user doesn't say.\n"
       "- `goal_above`: the result exceeds the goal line set on the question.\n"
       "- `goal_below`: the result drops below the goal line.\n"
       "`goal_above` and `goal_below` only work on questions that have a goal line configured.\n"
       "\n"
       "`schedule` is a frequency (hourly, daily, weekly, monthly) plus that frequency's time fields.\n"
       "`send_once` is optional (default false); when true the alert is deleted after it fires once."))

(defrecord CreateAlertTool []
  tools/Tool
  (declaration [_]
    {:name        "create_alert"
     :description tool-description
     :scope       scope/agent-alert-create
     :args        alert-schema})

  (handle [_ {:keys [card_id send_condition schedule send_once]} ctx]
    (let [channel (current-slack-channel ctx)
          card    (tools/with-entity {:kind :card :id card_id}
                    (api/read-check (metabot.db/card card_id)))
          alert   (create-alert! {:card-id        card_id
                                  :channel        channel
                                  :schedule       schedule
                                  :send-condition (keyword send_condition)
                                  :send-once      (boolean send_once)})]
      {:output (str "Created alert " (:id alert) " on " (name (:type card)) " \"" (:name card) "\" (ID " card_id
                    "), posting to " channel ".")})))

(def create-alert-tool
  "The `create_alert` tool."
  (->CreateAlertTool))
