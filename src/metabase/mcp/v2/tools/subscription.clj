(ns metabase.mcp.v2.tools.subscription
  "The v2 MCP `subscription_write` tool: scheduled delivery of a dashboard — \"send me this
   dashboard every Monday morning\".

   Backed by the pulse API, which is deprecated but live and still what the product's
   subscription sidebar uses; it is also the only option, since the notification API has no
   dashboard payload wired up. A future move to `/api/notification` changes the backing, not this
   tool's contract.

   The tool speaks one delivery target at a time — a channel type, a schedule, and a recipient
   list — while a Pulse is a list of channels. Writes therefore patch the one channel of the
   named type and leave the others alone, so a subscription the app created with both email and
   Slack survives an edit here. Permission enforcement, transactionality, and event publishing
   are inherited from [[metabase.pulse.api/create-pulse-with-perm-checks!]] and
   [[metabase.pulse.api/update-pulse-with-perm-checks!]] — the same fns the REST endpoints call."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.pulse.api :as pulse.api]
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Schedule -----------------------------------------------------

(defn- check-schedule!
  "Reject a schedule the pulse channel would reject. `create-pulse-channel!`'s validation is an
   assertion, so an incomplete schedule would otherwise surface as a generic internal error
   instead of a sentence naming the missing field."
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
                       "A monthly schedule with schedule_frame \"mid\" sends on the 15th, so it cannot also take a schedule_day — drop schedule_day, or use frame \"first\" or \"last\" to send on a particular weekday."))))))

;;; ------------------------------------------------- Channels -----------------------------------------------------

(defn- recipient-maps
  "Turn the tool's flat recipient list — user ids and raw email addresses — into the
   `{:id user-id}` / `{:email address}` maps a pulse channel stores."
  [recipients]
  (mapv (fn [recipient]
          (if (int? recipient)
            {:id recipient}
            {:email recipient}))
        recipients))

(defn- slack-details
  "The `details` map for a Slack channel: the cached channel's display name, which is what the
   sender reads. An unknown name is rejected here rather than at send time, hours later."
  [slack-channel]
  (when-not (channel.settings/slack-configured?)
    (common/throw-teaching-error
     "Slack is not connected to this Metabase — ask an admin to set it up in Admin settings, or use channel \"email\"."))
  (when (str/blank? slack-channel)
    (common/throw-teaching-error
     "channel \"slack\" needs a slack_channel — the name of the channel to post to, e.g. \"data-team\"."))
  (let [display-name (some-> slack-channel
                             channel.settings/find-cached-slack-channel-or-username
                             :display-name)]
    (when-not display-name
      (common/throw-teaching-error
       (format "Metabase can't see a Slack channel or user named %s, so a subscription to it would deliver nowhere — check the name, or invite the Metabase Slack app to the channel."
               (pr-str slack-channel))))
    {:channel display-name}))

(def ^:private schedule-keys
  [:schedule_type :schedule_hour :schedule_day :schedule_frame])

(defn- effective-schedule
  "The schedule the channel ends up on: the caller's when they sent one, otherwise the one
   `existing` already carries (stored as keywords, restated as the strings this tool speaks).
   Validated either way, so adding a channel to a subscription can't skip the check."
  [existing schedule]
  (let [s (if schedule
            (select-keys schedule schedule-keys)
            (-> (u/select-non-nil-keys existing schedule-keys)
                (u/update-if-exists :schedule_type name)
                (u/update-if-exists :schedule_frame name)))]
    (when (str/blank? (:schedule_type s))
      (common/throw-teaching-error
       "`schedule` is required to add a delivery channel — pass {schedule_type: \"hourly\" | \"daily\" | \"weekly\" | \"monthly\", …}."))
    (check-schedule! s)
    (u/select-non-nil-keys s schedule-keys)))

(defn- build-channel
  "Merge the caller's delivery arguments onto `existing` (the subscription's current channel of
   this type, or nil when there isn't one yet). Only the arguments actually present change, so a
   caller who sends just a schedule keeps the channel's recipients — and its row, since the
   preserved `:id` makes [[metabase.pulse.core/update-pulse!]] update rather than recreate it.

   `enabled?` must be the negation of the subscription's resulting `archived` state. A Pulse
   encodes \"archived\" by disabling every one of its channels, and the channel write lands after
   the Pulse write, so an `:enabled` that disagrees resurrects a trashed subscription: its Quartz
   send trigger is re-registered and it keeps delivering from the trash."
  [existing channel-type enabled? {:keys [schedule recipients slack_channel] :as args}]
  (when (and (= "slack" channel-type) (contains? args :recipients))
    (common/throw-teaching-error
     "A Slack subscription posts to a channel and has no recipient list — drop recipients, or use channel \"email\" to send to people."))
  (when (and (= "email" channel-type) (contains? args :recipients) (empty? recipients))
    (common/throw-teaching-error
     "An empty recipients list would deliver this subscription to nobody — pass at least one user id or email address, or omit recipients to leave the current recipients alone."))
  (merge {:channel_type channel-type
          :enabled      enabled?}
         (select-keys existing [:id])
         (effective-schedule existing schedule)
         (case channel-type
           "email" {:recipients (if (contains? args :recipients)
                                  (recipient-maps recipients)
                                  (or (:recipients existing)
                                      [{:id api/*current-user-id*}]))}
           "slack" {:details (if slack_channel
                               (slack-details slack_channel)
                               (or (not-empty (:details existing))
                                   (slack-details nil)))})))

(defn- target-channel-type
  "Which of the subscription's channels this call edits. Explicit `channel` wins; otherwise a
   subscription with exactly one channel is unambiguous. A subscription with several channels has
   to be told, rather than have one picked for it."
  [channel existing-channels]
  (or channel
      (when (= 1 (count existing-channels))
        (name (:channel_type (first existing-channels))))
      (common/throw-teaching-error
       (format "This subscription delivers to %d channels, so pass `channel` (\"email\" or \"slack\") to say which one to change."
               (count existing-channels)))))

(defn- channel-affecting?
  "Does `args` ask for a change to the delivery channel at all? An update that only touches
   `archived` or `parameters` must leave the channel list out of the payload entirely — sending
   it back would re-register the send trigger for no reason."
  [args]
  (boolean (some #(contains? args %) [:schedule :channel :slack_channel :recipients])))

;;; ------------------------------------------------ Parameters ----------------------------------------------------

(defn- resolve-parameters
  "Validate that every `{id, value}` names a parameter the dashboard actually has. A subscription
   stores only the id and value; the dashboard's own definition of the parameter is merged in at
   send time, so an id that matches nothing is stored and then silently ignored."
  [parameters dashboard-parameters]
  (let [known (into #{} (map (comp u/qualified-name :id)) dashboard-parameters)]
    (doseq [{param-id :id} parameters]
      (when-not (contains? known param-id)
        (common/throw-teaching-error
         (format "The dashboard has no parameter %s. Its parameter ids are: %s."
                 (pr-str param-id)
                 (if (seq known) (str/join ", " (sort known)) "(none)")))))
    (mapv #(select-keys % [:id :value]) parameters)))

;;; -------------------------------------------------- Create ------------------------------------------------------

(defn- subscription-cards
  "The pulse's `cards` list, assembled from the dashboard's dashcards as the subscription sidebar
   does: every card-backed dashcard, in layout order, tagged with the `dashboard_card_id` it came
   from. Virtual dashcards (text, headings, links) have no card and are skipped. Each card is
   read-checked, since subscribing to it delivers its results. A dashboard with no cards is a
   teaching error.

   This list does not decide what a send renders — the dashboard payload re-executes the whole
   dashboard by id. It exists because [[metabase.pulse.core/create-pulse!]] requires at least one
   card ref, and because `dashboard_card_id` is what the email channel matches per-card attachment
   flags against for visualizer dashcards."
  [dashboard]
  (let [cards (for [{dashcard-id :id :keys [card]} (sort-by (juxt #(or (:row %) 0) #(or (:col %) 0))
                                                            (:dashcards dashboard))
                    :when (int? (:id card))]
                (-> (api/read-check card)
                    (select-keys [:id :name :collection_id :description :display :parameter_mappings])
                    (assoc :dashboard_card_id dashcard-id :dashboard_id (:id dashboard))))]
    (when (empty? cards)
      (common/throw-teaching-error
       "This dashboard has no cards to send — a subscription needs at least one saved question, model, or metric on the dashboard."))
    (vec cards)))

(defn- create!
  [{:keys [dashboard_id channel parameters skip_if_empty] :as args}]
  (let [dashboard (-> (common/resolve-and-read :model/Dashboard dashboard_id
                                               (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
                      (t2/hydrate [:dashcards :card]))
        cards     (subscription-cards dashboard)
        channel   (build-channel nil (or channel "email") true args)
        ;; `collection_id` is deliberately nil rather than the dashboard's: the Pulse model derives
        ;; it from `dashboard_id`, and naming it here would make the create-check demand *write*
        ;; access to the dashboard's collection — anyone who can view a dashboard can subscribe to
        ;; it. Both collection keys must still be present, since the position reconciler requires
        ;; them.
        pulse     (pulse.api/create-pulse-with-perm-checks!
                   cards
                   [channel]
                   {:name                (:name dashboard)
                    :creator_id          api/*current-user-id*
                    :dashboard_id        (:id dashboard)
                    :collection_id       nil
                    :collection_position nil
                    :skip_if_empty       (boolean skip_if_empty)
                    :parameters          (resolve-parameters parameters (:parameters dashboard))})]
    (:id pulse)))

;;; -------------------------------------------------- Update ------------------------------------------------------

(defn- fetch-subscription
  "The subscription behind its read check, hydrated. Alerts share the Pulse id space but are a
   different concept with their own tool, so one collapses to not-found here."
  [id-or-eid]
  (common/resolve-and-read
   :model/Pulse id-or-eid
   (fn [id]
     (when (t2/exists? :model/Pulse :id id :alert_condition nil)
       (api/read-check (pulse/retrieve-pulse id))))))

(defn- patched-channels
  "The subscription's full channel list with the targeted one replaced (or appended). The pulse
   update path treats `:channels` as definitive — anything omitted is deleted — so the channels
   this call doesn't touch have to ride along unchanged, apart from `:enabled`: that one tracks
   the subscription's archived state for every channel, not just the edited one (see
   [[build-channel]])."
  [existing-channels channel enabled? args]
  (let [channel-type (target-channel-type channel existing-channels)
        same-type?   #(= channel-type (name (:channel_type %)))]
    (conj (mapv #(assoc % :enabled enabled?) (remove same-type? existing-channels))
          (build-channel (m/find-first same-type? existing-channels) channel-type enabled? args))))

(defn- update!
  [id-or-eid {:keys [channel parameters skip_if_empty archived] :as args}]
  (let [subscription (fetch-subscription id-or-eid)
        archived?    (if (contains? args :archived)
                       (boolean archived)
                       (boolean (:archived subscription)))
        updates      (cond-> {}
                       (contains? args :skip_if_empty) (assoc :skip_if_empty (boolean skip_if_empty))
                       (contains? args :archived)      (assoc :archived (boolean archived))

                       (contains? args :parameters)
                       (assoc :parameters
                              (resolve-parameters
                               parameters
                               (t2/select-one-fn :parameters :model/Dashboard :id (:dashboard_id subscription))))

                       (channel-affecting? args)
                       (assoc :channels (patched-channels (:channels subscription) channel
                                                          (not archived?) args)))]
    (when (empty? updates)
      (common/throw-teaching-error
       "Nothing to update — pass at least one of schedule, channel, slack_channel, recipients, parameters, skip_if_empty, or archived."))
    (pulse.api/update-pulse-with-perm-checks! (:id subscription) updates)
    (:id subscription)))

;;; -------------------------------------------------- Schema ------------------------------------------------------

(def ^:private schedule-schema
  [:map {:closed true
         :description "When to deliver. Metabase sends at the top of the hour, in the instance's report time zone."}
   [:schedule_type
    [:enum {:description "How often to send."} "hourly" "daily" "weekly" "monthly"]]
   [:schedule_hour {:optional true}
    [:maybe [:int {:min 0 :max 23
                   :description "Hour of the day to send, 0-23. Required for daily, weekly, and monthly."}]]]
   [:schedule_day {:optional true}
    [:maybe [:enum {:description (str "Day of the week. Required for weekly; with a monthly "
                                      "schedule_frame of \"first\" or \"last\" it picks that weekday "
                                      "of the month.")}
             "mon" "tue" "wed" "thu" "fri" "sat" "sun"]]]
   [:schedule_frame {:optional true}
    [:maybe [:enum {:description (str "Which part of the month to send on. Required for monthly. "
                                      "\"mid\" is the 15th and takes no schedule_day.")}
             "first" "mid" "last"]]]])

(def ^:private subscription-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" subscribes to the dashboard named by `dashboard_id`; "
                              "\"update\" edits the subscription named by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the subscription to update."}]
             [:string {:description "21-character entity_id of the subscription to update."}]]]]
   [:dashboard_id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the dashboard to deliver."}]
             [:string {:description "21-character entity_id of the dashboard to deliver."}]]]]
   [:schedule {:optional true} [:maybe schedule-schema]]
   [:channel {:optional true}
    [:maybe [:enum {:description (str "Where to deliver. Defaults to \"email\" on create; on update, "
                                      "to the subscription's channel when it has exactly one.")}
             "email" "slack"]]]
   [:slack_channel {:optional true}
    [:maybe [:string {:description "Slack channel or username to post to, e.g. \"data-team\". Required for channel \"slack\"."}]]]
   [:recipients {:optional true}
    [:maybe [:sequential {:description (str "Who gets the email: numeric user ids, or raw email "
                                            "addresses for people without a Metabase account. "
                                            "Defaults to you. On update this replaces the current list.")}
             [:or [:int {:description "Numeric id of a Metabase user."}]
              [:string {:min 1 :description "An email address."}]]]]]
   [:parameters {:optional true}
    [:maybe [:sequential {:description (str "Filter values applied to the dashboard before it is "
                                            "sent, making a filtered subscription. Only ids the "
                                            "dashboard actually has are accepted.")}
             [:map {:closed true}
              [:id [:string {:min 1 :description "Id of a dashboard parameter (from a dashboard read)."}]]
              [:value [:any {:description "Value to filter by: a scalar, or an array for a multi-select parameter."}]]]]]]
   [:skip_if_empty {:optional true}
    [:maybe [:boolean {:description "When true, no email is sent if every card comes back empty. Default false."}]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true pauses the subscription and moves it to "
                                         "the trash, false restores it. This is the only removal path.")}]]]])

(def ^:private subscription-write-entry
  {:create-required [:dashboard_id :schedule]})

(registry/deftool subscription-write
  "Create or update a dashboard subscription — scheduled delivery of a whole dashboard, e.g. \"send me this dashboard
  every Monday morning\". method: \"create\" requires dashboard_id and schedule; method: \"update\" requires id and
  accepts archived (true pauses and trashes it, false restores — there is no hard delete). The server assembles what
  gets sent from the dashboard's own cards, so you never list them. schedule is {schedule_type: \"hourly\" | \"daily\"
  | \"weekly\" | \"monthly\", schedule_hour?, schedule_day?, schedule_frame?} — daily and up need schedule_hour,
  weekly also needs schedule_day, monthly needs schedule_frame. channel is \"email\" (default) or \"slack\"; Slack
  needs slack_channel, email takes recipients (user ids or raw email addresses, defaulting to you). parameters
  ({id, value} pairs naming the dashboard's own filters) makes a filtered subscription. On update, only the fields
  you pass change: a schedule-only update keeps the recipients, and a recipients list replaces the current one.
  A subscription that already delivers to both email and Slack needs channel to say which to edit. This is for
  dashboards on a schedule — use alert_write for a question that fires on a condition. Requires read permission on
  the dashboard; only its creator (or an admin) can update it."
  {:name        "subscription_write"
   :scope       metabot.scope/agent-subscription-write
   :annotations {:readOnlyHint false :destructiveHint false}
   :args        subscription-write-args-schema}
  [args _]
  (let [[op a b] (common/dispatch-write subscription-write-entry args)
        id       (case op
                   :create (create! a)
                   :update (update! a b))]
    (common/success-content
     (projections/project :subscription :concise (projections/subscription-row (pulse/retrieve-pulse id))))))
