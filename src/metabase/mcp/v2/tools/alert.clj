(ns metabase.mcp.v2.tools.alert
  "The v2 MCP `alert_write` tool: condition-triggered notifications on a saved question, backed by
   the notification API's `notification/card` payload. The tool's own work is translating the
   agent-facing vocabulary into the notification shape — a ScheduleMap compiled to cron (agents
   never author cron), a channel plus recipients compiled to one handler, a condition compiled to
   `send_condition`/`send_once` — and then handing the assembled notification to the same
   create/update fns the REST endpoints call, so permission enforcement is inherited.

   Update is a patch, but the notification update spec is not: it deletes the subscription and
   handler rows a body omits. So every update reads the stored notification first and writes it
   back whole, with only the caller's fields replaced."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.notification.api :as notification.api]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- schedule ----------------------------------------------------

(defn- check-schedule!
  "Reject an incomplete schedule by naming the field it is missing. The cron util would otherwise
   fill an omitted hour with midnight, silently picking a send time the caller never asked for, and
   fail the other shapes as an opaque error. Kept in step with `subscription_write`'s check of the
   same vocabulary, so an agent that has learned one tool's schedule has learned the other's."
  [{:keys [schedule_type schedule_hour schedule_day schedule_frame]}]
  (letfn [(require! [v field explanation]
            (when (nil? v)
              (common/throw-teaching-error
               (format "A %s schedule needs %s — %s." schedule_type field explanation))))]
    (case schedule_type
      "hourly"  nil
      "daily"   (require! schedule_hour "schedule_hour" "the hour of the day to send, 0-23")
      "weekly"  (do (require! schedule_hour "schedule_hour" "the hour of the day to send, 0-23")
                    (require! schedule_day "schedule_day" "the day of the week, e.g. \"mon\""))
      "monthly" (do (require! schedule_hour "schedule_hour" "the hour of the day to send, 0-23")
                    (require! schedule_frame "schedule_frame" "\"first\", \"mid\", or \"last\"")
                    (when (and (= "mid" schedule_frame) schedule_day)
                      (common/throw-teaching-error
                       (str "A monthly schedule with schedule_frame \"mid\" sends on the 15th, so it cannot also "
                            "take a schedule_day — drop schedule_day, or use frame \"first\" or \"last\" to send "
                            "on a particular weekday.")))))))

(defn- schedule->cron
  "Compile a ScheduleMap to the cron string the notification API stores, once
   [[check-schedule!]] has ruled out the shapes the util can't express."
  [schedule]
  (check-schedule! schedule)
  (try
    (u.cron/schedule-map->cron-string schedule)
    (catch Exception _
      (common/throw-teaching-error
       (format "Metabase can't schedule %s — check schedule_type against the other schedule fields."
               (pr-str schedule))))))

(defn- cron-subscription
  [schedule]
  [{:type            :notification-subscription/cron
    :cron_schedule   (schedule->cron schedule)
    ;; The alert was authored through the schedule picker's vocabulary, so mark it as such: the
    ;; product's alert modal then edits it in the picker rather than as a raw cron string.
    :ui_display_type :cron/builder}])

;;; -------------------------------------------------- condition ---------------------------------------------------

(def ^:private goal-conditions #{"goal_above" "goal_below"})

(defn- check-goal-line!
  "A goal condition compares results to the question's goal line; without one the notification
   backend can only fail at send time, silently. Reject it here instead, mirroring
   [[metabase.util.ui-logic/find-goal-value]]'s reading of where a goal lives per display."
  [card]
  (case (keyword (:display card))
    (:area :bar :line)
    (when-not (get-in card [:visualization_settings :graph.goal_value])
      (common/throw-teaching-error
       (format (str "Question %d has no goal line, so a \"goal_above\"/\"goal_below\" alert can never fire — "
                    "set a goal on the chart, or use the \"has_result\" condition.")
               (:id card))))

    :progress
    nil

    (common/throw-teaching-error
     (format (str "Question %d is displayed as a %s, which has no goal line — \"goal_above\"/\"goal_below\" "
                  "alerts need a line, area, bar, or progress chart. Use the \"has_result\" condition instead.")
             (:id card) (u/qualified-name (:display card))))))

;;; --------------------------------------------------- handlers ---------------------------------------------------

(defn- email-recipient
  "One email-handler recipient: an integer is a Metabase user, a string is a bare email address."
  [recipient]
  (cond
    (int? recipient)
    (do
      (when-not (t2/exists? :model/User :id recipient :is_active true)
        (common/throw-teaching-error
         (format "No active user with id %d — pass a user id from the people list, or an email address."
                 recipient)))
      {:type :notification-recipient/user :user_id recipient})

    (u/email? recipient)
    {:type :notification-recipient/raw-value :details {:value recipient}}

    :else
    (common/throw-teaching-error
     (format "Recipient %s is neither a user id nor an email address." (pr-str recipient)))))

(defn- slack-recipient
  "The single raw-value recipient a slack handler carries: the channel's display name plus its
   Slack id, resolved from the cached channel list the product's channel picker also reads."
  [slack-channel]
  (when-not (channel.settings/slack-configured?)
    (common/throw-teaching-error
     "Slack is not configured — ask an admin to set up Slack in Metabase settings, or use channel \"email\"."))
  (let [channel (or (channel.settings/find-cached-slack-channel-or-username slack-channel)
                    (common/throw-teaching-error
                     (format "No Slack channel or user named %s — pass a channel name like \"#data-team\"."
                             (pr-str slack-channel))))]
    {:type    :notification-recipient/raw-value
     :details {:value (:display-name channel) :channel_id (:id channel)}}))

(defn- build-handler
  "The one handler an alert delivers through. `existing` is the alert's stored handler (nil at
   create). When the channel type is unchanged the new handler is built *onto* the stored row, so
   editing recipients patches that handler rather than deleting and recreating it; switching
   channels drops the old row instead."
  [{:keys [channel slack_channel recipients]} existing]
  (let [existing-type (some-> (:channel_type existing) u/qualified-name)
        channel-type  (or channel
                          (some-> existing-type (str/replace #"^channel/" ""))
                          "email")
        base          (if (= (str "channel/" channel-type) existing-type) existing {})]
    (when-not (#{"email" "slack"} channel-type)
      (common/throw-teaching-error
       (format (str "This alert delivers over %s, which alert_write doesn't manage — edit it in Metabase, "
                    "or leave channel, slack_channel, and recipients out to keep it as it is.")
               existing-type)))
    ;; An empty list reads as "clear the recipients", which the cond below would silently answer
    ;; with the caller (at create) or the stored list (at update).
    (when (and recipients (empty? recipients))
      (common/throw-teaching-error
       (str "`recipients` can't be empty — an alert with nobody to send to would never reach anyone. "
            "Pass at least one user id or email address, or leave recipients out: a new alert then "
            "goes to you, and an existing one keeps the recipients it has.")))
    (case channel-type
      "slack"
      (do
        (when (seq recipients)
          (common/throw-teaching-error
           "A Slack alert posts to a channel, so it takes slack_channel rather than recipients."))
        (assoc base
               :channel_type :channel/slack
               :recipients   (cond
                               slack_channel            [(slack-recipient slack_channel)]
                               (seq (:recipients base)) (:recipients base)
                               :else (common/throw-teaching-error
                                      "`slack_channel` is required when channel is \"slack\"."))))

      "email"
      (assoc base
             :channel_type :channel/email
             :recipients   (cond
                             (seq recipients)         (mapv email-recipient recipients)
                             (seq (:recipients base)) (:recipients base)
                             :else [{:type    :notification-recipient/user
                                     :user_id api/*current-user-id*}])))))

;;; ---------------------------------------------------- create ----------------------------------------------------

(defn- resolve-card
  "Resolve `card_id` behind the card's read check. The notification model gates creation on the
   same read, but resolving here lets the goal-line check see the card and collapses a missing
   card into the shared not-found error."
  [card-id]
  (common/resolve-and-read :model/Card card-id
                           (fn [id]
                             (when-let [card (t2/select-one :model/Card :id id)]
                               (when (mi/can-read? card)
                                 card)))))

(defn- alert-response
  [notification]
  (projections/project :alert :concise
                       (projections/notification-row
                        (projections/hydrate-notification-row notification))))

(defn- create!
  [{:keys [card_id condition schedule active] :as args}]
  (let [condition      (m/remove-vals nil? condition)
        card           (resolve-card card_id)
        send-condition (or (:type condition) "has_result")]
    (when (goal-conditions send-condition)
      (check-goal-line! card))
    (alert-response
     (notification.api/create-notification!
      {:payload_type  :notification/card
       :active        (if (some? active) (boolean active) true)
       :creator_id    api/*current-user-id*
       :payload       {:card_id        (:id card)
                       :send_condition (keyword send-condition)
                       :send_once      (boolean (:send_once condition))}
       :subscriptions (cron-subscription schedule)
       :handlers      [(build-handler args nil)]}))))

;;; ---------------------------------------------------- update ----------------------------------------------------

(defn- fetch-alert
  "Fetch the stored alert as the whole hydrated notification an update writes back. Notifications
   have no entity_id column, so a non-numeric id is a teaching error rather than a lookup."
  [id]
  (when-not (int? id)
    (common/throw-teaching-error "Alerts take a numeric id — they have no entity_id."))
  (let [notification (t2/select-one :model/Notification :id id :payload_type :notification/card)]
    (when-not (and notification (mi/can-read? notification))
      (common/throw-not-found :alert id))
    (notification.api/get-notification id)))

(defn- update!
  [id {:keys [condition schedule active] :as args}]
  (when (contains? args :card_id)
    (common/throw-teaching-error
     "`card_id` can't be changed on an existing alert — create a new alert on the other question instead."))
  (let [condition   (m/remove-vals nil? condition)
        existing    (fetch-alert id)
        delivery?   (boolean (some #(contains? args %) [:channel :slack_channel :recipients]))
        payload     (cond-> (:payload existing)
                      (:type condition)              (assoc :send_condition (keyword (:type condition)))
                      (some? (:send_once condition)) (assoc :send_once (boolean (:send_once condition))))]
    ;; Only re-check the goal line when the caller is setting the condition: an alert whose chart
    ;; lost its goal since it was created must still be pausable.
    (when (goal-conditions (:type condition))
      (check-goal-line! (resolve-card (:card_id payload))))
    (when (and delivery? (< 1 (count (:handlers existing))))
      (common/throw-teaching-error
       (str "This alert delivers over more than one channel, and alert_write writes a single one — "
            "editing its delivery here would silently drop the others. Edit it in Metabase instead.")))
    (alert-response
     (notification.api/update-notification!
      id
      (cond-> (assoc existing :payload payload)
        (some? active) (assoc :active (boolean active))
        schedule       (assoc :subscriptions (cron-subscription schedule))
        delivery?      (assoc :handlers [(build-handler args (first (:handlers existing)))]))))))

;;; ----------------------------------------------------- tool -----------------------------------------------------

(def ^:private alert-write-args-schema
  [:map {:closed true}
   [:method [:enum "create" "update"]]
   [:id {:optional true} [:maybe [:or :int :string]]]
   [:card_id {:optional true} [:maybe [:or :int :string]]]
   [:condition {:optional true}
    [:maybe [:map {:closed true}
             [:type {:optional true} [:maybe [:enum "has_result" "goal_above" "goal_below"]]]
             [:send_once {:optional true} [:maybe :boolean]]]]]
   [:schedule {:optional true}
    [:maybe [:map {:closed true}
             [:schedule_type [:enum "hourly" "daily" "weekly" "monthly"]]
             [:schedule_hour {:optional true} [:maybe [:int {:min 0 :max 23}]]]
             [:schedule_minute {:optional true} [:maybe [:int {:min 0 :max 59}]]]
             [:schedule_day {:optional true} [:maybe [:enum "mon" "tue" "wed" "thu" "fri" "sat" "sun"]]]
             [:schedule_frame {:optional true} [:maybe [:enum "first" "mid" "last"]]]]]]
   [:channel {:optional true} [:maybe [:enum "email" "slack"]]]
   [:slack_channel {:optional true} [:maybe [:string {:min 1}]]]
   [:recipients {:optional true} [:maybe [:sequential [:or :int [:string {:min 1}]]]]]
   [:active {:optional true} [:maybe :boolean]]])

(registry/deftool alert-write
  "Create or update an alert: a notification sent on a schedule when a saved question's results meet a condition.
  method: \"create\" requires card_id (the question) and schedule; method: \"update\" requires id and changes only the
  fields you pass. schedule is {schedule_type: \"hourly\" | \"daily\" | \"weekly\" | \"monthly\", schedule_hour?
  (0-23, required for daily, weekly, and monthly), schedule_minute? (0-59), schedule_day? (\"mon\"…\"sun\", required
  for weekly, and picks the weekday for a monthly \"first\" or \"last\" frame), schedule_frame? (\"first\" | \"mid\"
  | \"last\", required for monthly — \"mid\" is the 15th and takes no schedule_day)} — never a cron string. condition is {type: \"has_result\" (default) |
  \"goal_above\" | \"goal_below\", send_once?: boolean} — the goal conditions need a goal line on the question's chart,
  and send_once deletes the alert after it fires. Delivery is one channel: \"email\" (default) with recipients, a list
  mixing user ids and email addresses that defaults to you, or \"slack\" with slack_channel, a channel name like
  \"#data-team\" (recipients don't apply). Passing any of channel, slack_channel, or recipients on update replaces the
  alert's delivery; omit them all to leave it alone. active: false pauses an alert and true resumes it — alerts have no
  archived state, and this tool cannot delete one. An alert's question is fixed at creation. Alerts are for saved
  questions; use subscription_write to schedule a whole dashboard."
  {:name        "alert_write"
   :scope       metabot.scope/agent-alert-write
   :annotations {:readOnlyHint false :destructiveHint false}
   :args        alert-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [[op a b] (common/dispatch-write
                  {:tool-name       "alert_write"
                   :create-required [:card_id :schedule]}
                  token-scopes args)]
    (common/success-content (case op
                              :create (create! a)
                              :update (update! a b)))))
