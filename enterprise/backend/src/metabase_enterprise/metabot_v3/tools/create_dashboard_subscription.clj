(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
  (:require
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- schedule->channel-fields
  "Convert a schedule map to the pulse channel schedule fields."
  [{:keys [frequency hour day-of-week day-of-month]}]
  {:schedule_type  frequency
   :schedule_hour  hour
   :schedule_day   (or (some-> day-of-week name (subs 0 3) u/lower-case-en)
                       (some->> day-of-month
                                name
                                u/lower-case-en
                                (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                second))
   :schedule_frame (some->> day-of-month name (re-find #"^(?:first|mid|last)"))})

(defn- make-email-channel
  "Build a pulse channel for email delivery."
  [schedule recipient-id]
  (merge {:channel_type :email
          :enabled      true
          :recipients   [{:id recipient-id}]}
         (schedule->channel-fields schedule)))

(defn- make-slack-channel
  "Build a pulse channel for Slack delivery."
  [schedule slack-channel]
  (merge {:channel_type :slack
          :enabled      true
          :details      {:channel slack-channel}}
         (schedule->channel-fields schedule)))

(defn- create-dashboard-subscription*
  "Private helper for create-dashboard-subscription (call that instead)."
  [{:keys [dashboard-id channel-type email slack-channel schedule]
    :or   {channel-type :email}}]
  (let [dashboard (some-> (t2/select-one :model/Dashboard dashboard-id)
                          api/read-check
                          (t2/hydrate [:dashcards :card]))
        cards (for [{:keys [id card]} (:dashcards dashboard)
                    :when (-> card :id int?)]
                (-> card
                    api/read-check
                    (select-keys [:id :name :collection_id :description :display :parameter_mappings])
                    (assoc :dashboard_card_id id :dashboard_id dashboard-id)))
        recipient-id (when (= channel-type :email)
                       (t2/select-one-fn :id :model/User :email email))
        pulse-data (-> dashboard
                       (select-keys [:collection_id :collection_position :name :parameters])
                       (assoc :dashboard_id  dashboard-id
                              :creator_id    api/*current-user-id*
                              :skip_if_empty false))]
    (cond
      (nil? dashboard)
      {:error "no dashboard with this dashboard_id found"}

      (and (= channel-type :email) (nil? recipient-id))
      {:error "no user with this email found"}

      (= channel-type :email)
      (do (pulse/create-pulse! (map pulse/card->ref cards)
                               [(make-email-channel schedule recipient-id)]
                               pulse-data)
          {:output "success"})

      (= channel-type :slack)
      (do (pulse/create-pulse! (map pulse/card->ref cards)
                               [(make-slack-channel schedule slack-channel)]
                               pulse-data)
          {:output "success"})

      :else
      {:error (str "unsupported channel_type: " (name channel-type))})))

(defn create-dashboard-subscription
  "Create a dashboard subscription."
  [{:keys [dashboard-id channel-type slack-channel _email _schedule]
    :or   {channel-type :email}
    :as   args}]
  (perms/check-has-application-permission :subscription false)
  (cond
    (not (int? dashboard-id))
    {:error "invalid dashboard_id"}

    (and (= channel-type :email) (not (channel.settings/email-configured?)))
    {:error "email is not configured. Ask an admin to set up email in Metabase settings."}

    (and (= channel-type :slack) (not (channel.settings/slack-configured?)))
    {:error "slack is not configured. Ask an admin to connect slack in Metabase settings."}

    (and (= channel-type :slack) (empty? slack-channel))
    {:error "slack_channel is required when channel_type is slack"}

    :else
    (create-dashboard-subscription* args)))
