(ns metabase.pulse.broken-subscriptions
  "Detection, repair, and notification for dashboard subscriptions whose parameters no longer exist on
  the dashboard they belong to."
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as pulse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- bad-pulse-notification-data
  "Given a pulse and bad parameters, return relevant notification data:
  - The name of the pulse
  - Which selected parameter values are broken
  - The user info for the creator of the pulse
  - The users affected by the pulse"
  [{bad-pulse-id :id pulse-name :name :keys [parameters creator_id]}]
  (let [creator (pulse.db/user-name-and-email creator_id)
        bad-pulse-channels (pulse.db/pulse-channel-kinds-for-pulse bad-pulse-id)]
    {:pulse-id       bad-pulse-id
     :pulse-name     pulse-name
     :bad-parameters parameters
     :pulse-creator  creator
     :affected-users (into []
                           (comp
                            (filter #(contains? #{:email :slack} (:channel_type %)))
                            (mapcat (fn [{pulse-channel-id  :id
                                          channel-type      :channel_type
                                          {:keys [channel]} :details}]
                                      (case channel-type
                                        :email (let [pulse-channel-recipient-ids (map :user_id (pulse.db/pulse-channel-recipient-rows pulse-channel-id))
                                                     pulse-channel-recipients (when (seq pulse-channel-recipient-ids)
                                                                                (pulse.db/users-names-and-emails pulse-channel-recipient-ids))]
                                                 (map (fn [{:keys [common_name] :as recipient}]
                                                        (assoc recipient
                                                               :notification-type channel-type
                                                               :recipient common_name))
                                                      pulse-channel-recipients))
                                        :slack [{:notification-type channel-type
                                                 :recipient         channel}]))))
                           bad-pulse-channels)}))

(defn- broken-pulses
  "Identify and return any pulses used in a subscription that contain parameters that are no longer on the dashboard."
  [dashboard-id original-dashboard-params]
  (when (seq original-dashboard-params)
    (let [{:keys [resolved-params]} (t2/hydrate
                                     (pulse.db/dashboard-parameters dashboard-id)
                                     :resolved-params)
          dashboard-params (set (keys resolved-params))]
      ;; ordered so the notifications go out in a stable order rather than whatever order the rows come back in
      (->> (pulse.db/unarchived-pulses-for-dashboard dashboard-id)
           (keep (fn [{:keys [parameters] :as pulse}]
                   (let [bad-params (filterv
                                     (fn [{param-id :id}] (not (contains? dashboard-params param-id)))
                                     parameters)]
                     (when (seq bad-params)
                       (assoc pulse :parameters bad-params)))))
           seq))))

(defn- broken-subscription-data
  "Given a dashboard id and original parameters, return data (if any) on any broken subscriptions. This will be a seq
  of maps, each containing:
  - The pulse id that was broken
  - name and email data for the dashboard creator and pulse creator
  - Affected recipient information
  - Basic descriptive data on the affected dashboard, pulse, and parameters for use in downstream notifications"
  [dashboard-id original-dashboard-params]
  (when-some [broken-pulses (broken-pulses dashboard-id original-dashboard-params)]
    (let [{dashboard-name        :name
           dashboard-description :description
           dashboard-creator     :creator} (t2/hydrate
                                            (pulse.db/dashboard-name-description-creator dashboard-id)
                                            :creator)]
      (for [broken-pulse broken-pulses]
        (assoc
         (bad-pulse-notification-data broken-pulse)
         :dashboard-id dashboard-id
         :dashboard-name dashboard-name
         :dashboard-description dashboard-description
         :dashboard-creator (select-keys dashboard-creator [:first_name :last_name :email :common_name])
         ;; We will not include links to Metabase for subscriptions created in modular embeddings
         :disable_links (:disable_links broken-pulse))))))

(defn handle-broken-subscriptions!
  "Archive every subscription on `dashboard-id` whose parameters no longer exist on the dashboard
  and notify their creators. Must run after the update: it compares the dashboard's current
  resolved params against each pulse's stored params. Returns nil."
  [dashboard-id original-dashboard-params]
  (doseq [{:keys [pulse-id] :as broken-subscription}
          (broken-subscription-data dashboard-id original-dashboard-params)]
    ;; Archive the pulse
    (pulse/update-pulse! {:id pulse-id :archived true})
    ;; Let the pulse and subscription creator know about the broken pulse
    (messages/send-broken-subscription-notification! broken-subscription)))
