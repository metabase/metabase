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

(defn- channel-recipient-count
  "How many destinations the PulseChannel `channel` reaches: its user recipients and email addresses for email, and
   one for a Slack channel or webhook with its destination set."
  [{:keys [id channel_type details channel_id]}]
  ;; The same destinations the send task checks before deleting a channel as having no recipients.
  (case channel_type
    :email (+ (count (pulse.db/pulse-channel-recipient-rows id)) (count (:emails details)))
    :slack (if (seq (:channel details)) 1 0)
    :http  (if channel_id 1 0)
    0))

(defn- delivery
  "The `:channels` that deliver the pulse with `pulse-id`, as channel types, and its `:recipient-count`, the
   destinations [[channel-recipient-count]] counts.
   Only enabled channels with a destination count."
  [pulse-id]
  (let [counts (for [channel (pulse.db/enabled-pulse-channels pulse-id)
                     :let    [n (channel-recipient-count channel)]
                     :when   (pos? n)]
                 [(:channel_type channel) n])]
    {:channels        (vec (distinct (map first counts)))
     :recipient-count (transduce (map second) + counts)}))

(defn- archived-subscription
  "What a caller may report about `broken-subscription`, from [[broken-subscription-data]], once it is archived:
   `{:id :creator-name :parameters :channels :recipient-count :already-broken?}`.
   The `:parameters` are the missing filters' ids and names.
   The `:channels` and `:recipient-count` are what [[delivery]] describes.
   The `:already-broken?` flag is true when none of the missing filters was on the dashboard before the update.
   It leaves out the recipients' names and emails and the filter values."
  [original-dashboard-params {:keys [pulse-id bad-parameters pulse-creator]}]
  (merge {:id              pulse-id
          :creator-name    (:common_name pulse-creator)
          ;; Without the values, which a caller could show to someone the subscription doesn't belong to.
          :parameters      (mapv #(select-keys % [:id :name]) bad-parameters)
          ;; A filter missing before this update, for example after a revision revert, which doesn't run this handler.
          :already-broken? (not-any? #(contains? original-dashboard-params (:id %)) bad-parameters)}
         (delivery pulse-id)))

(defn handle-broken-subscriptions!
  "Archive every subscription on `dashboard-id` whose parameters no longer exist on the dashboard
  and notify their creators. Must run after the update: it compares the dashboard's current
  resolved params against each pulse's stored params.
  Returns what [[archived-subscription]] describes for each archived subscription, in archive order.
  `original-dashboard-params` is the dashboard's `:resolved-params` from before the update."
  [dashboard-id original-dashboard-params]
  (mapv (fn [{:keys [pulse-id] :as broken-subscription}]
          ;; Described before archiving, so the description doesn't depend on what archiving leaves behind.
          (let [archived (archived-subscription original-dashboard-params broken-subscription)]
            ;; Archive the pulse
            (pulse/update-pulse! {:id pulse-id :archived true})
            ;; Let the pulse and subscription creator know about the broken pulse
            (messages/send-broken-subscription-notification! broken-subscription)
            archived))
        (broken-subscription-data dashboard-id original-dashboard-params)))
