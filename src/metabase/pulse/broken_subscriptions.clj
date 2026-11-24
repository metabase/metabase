(ns metabase.pulse.broken-subscriptions
  "Detection, repair, and notification for dashboard subscriptions whose parameters no longer exist on
  the dashboard they belong to."
  (:require
   [clojure.string :as str]
   [metabase.channel.email.messages :as messages]
   [metabase.models.interface :as mi]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as pulse]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- bad-pulse-notification-data
  "Given a pulse and bad parameters, return relevant notification data:
  - The name of the pulse
  - Which selected parameter values are broken
  - The user info for the creator of the pulse (if active)
  - The users affected by the pulse
  - The pulse's channels, hydrated with `:recipients`
  `user-id->user` is the creator and recipient users by id, `channel-id->user-ids` the recipient user ids by channel
  id."
  [user-id->user channel-id->user-ids {bad-pulse-id :id pulse-name :name :keys [parameters creator_id]} channels]
  {:pulse-id       bad-pulse-id
   :pulse-name     pulse-name
   :bad-parameters parameters
   :pulse-creator  (user-id->user creator_id)
   :channels       channels
   :affected-users (into []
                         (comp
                          (filter #(contains? #{:email :slack} (:channel_type %)))
                          (mapcat (fn [{pulse-channel-id  :id
                                        channel-type      :channel_type
                                        {:keys [channel]} :details}]
                                    (case channel-type
                                      :email (for [user-id (sort (channel-id->user-ids pulse-channel-id))
                                                   :let    [{:keys [common_name] :as recipient} (user-id->user user-id)]
                                                   :when   recipient]
                                               (assoc recipient
                                                      :notification-type channel-type
                                                      :recipient common_name))
                                      :slack [{:notification-type channel-type
                                               :recipient         channel}]))))
                         channels)})

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
  - name and email data for the dashboard creator and pulse creator (if active)
  - Affected recipient information
  - Basic descriptive data on the affected dashboard, pulse, and parameters for use in downstream notifications"
  [dashboard-id original-dashboard-params]
  (when-some [broken-pulses (broken-pulses dashboard-id original-dashboard-params)]
    (let [{dashboard-name        :name
           dashboard-description :description
           dashboard-creator-id  :creator_id} (pulse.db/dashboard-name-description-creator dashboard-id)
          pulse-id->channels   (group-by :pulse_id (t2/hydrate (pulse.db/pulse-channels-for-pulses (map :id broken-pulses))
                                                               :recipients))
          channel-ids          (into [] (comp cat (map :id)) (vals pulse-id->channels))
          channel-id->user-ids (if (seq channel-ids)
                                 (-> (group-by :pulse_channel_id (pulse.db/pulse-channel-recipients-for-channels channel-ids))
                                     (update-vals #(map :user_id %)))
                                 {})
          user-id->user        (pulse.db/users-names-and-emails-by-id
                                (distinct
                                 (concat (keep :creator_id broken-pulses)
                                         [dashboard-creator-id]
                                         (sequence cat (vals channel-id->user-ids)))))]
      (for [broken-pulse broken-pulses]
        (assoc
         (bad-pulse-notification-data user-id->user channel-id->user-ids broken-pulse
                                      (get pulse-id->channels (:id broken-pulse) []))
         :dashboard-id dashboard-id
         :dashboard-name dashboard-name
         :dashboard-description dashboard-description
         :dashboard-creator (user-id->user dashboard-creator-id)
         ;; We will not include links to Metabase for subscriptions created in modular embeddings
         :disable_links (:disable_links broken-pulse))))))

(defn- channel-recipient-count
  "The number of destinations the PulseChannel `channel`, hydrated with `:recipients`, reaches.
   An email channel reaches its recipients: its active user recipients and its email addresses.
   A Slack channel or webhook reaches one when its destination is set, and any other type reaches none."
  [{:keys [channel_type details channel_id recipients]}]
  ;; The same destinations the send task delivers to, and checks before deleting a channel as having no recipients.
  (case channel_type
    :email (count recipients)
    :slack (if (seq (:channel details)) 1 0)
    :http  (if channel_id 1 0)
    0))

(defn- delivery
  "Returns `{:channels :recipient-count}` for the enabled `channels` of a pulse, hydrated with `:recipients` and already
   filtered as the read path filters them: the distinct types of those that reach a destination, and the destinations
   [[channel-recipient-count]] counts for them."
  [channels]
  (let [counts (for [channel channels
                     :let    [n (channel-recipient-count channel)]
                     :when   (pos? n)]
                 [(:channel_type channel) n])]
    {:channels        (vec (distinct (map first counts)))
     :recipient-count (transduce (map second) + counts)}))

(defn- visible-enabled-channels
  "The enabled channels of the readable pulses in `broken`, by pulse id, with the recipients a sandboxed or
  tenant-scoped user isn't shown left out."
  [broken readable-ids]
  (let [pulses (for [{:keys [pulse-id channels]} broken
                     :when (contains? readable-ids pulse-id)]
                 {:id pulse-id, :channels (filter :enabled channels)})]
    (into {} (map (juxt :id :channels)) (pulse/maybe-filter-pulses-recipients pulses))))

(defn- archived-subscription
  "What a caller may report about `broken-subscription`, from [[broken-subscription-data]], once it is archived:
   `{:id :creator-name :parameters :channels :recipient-count :already-broken? :readable?}`.
   The `:parameters` are the missing filters the update removed, or every missing filter when it removed none.
   A removed filter is named as the dashboard named it before the update, or by its id when that name is blank.
   An already-missing filter keeps the name the subscription stored.
   An unreadable subscription's filters carry only their ids.
   The `:channels` and `:recipient-count` are what [[delivery]] describes for `pulse-id->channels`.
   The `:already-broken?` flag is true when the update removed none of the missing filters.
   The `:readable?` flag says whether the current user can read the subscription, from `readable-ids`.
   An unreadable one leaves out `:creator-name`, `:channels` and `:recipient-count`.
   It always leaves out the recipients' names and emails and the filter values."
  [original-dashboard-params readable-ids pulse-id->channels {:keys [pulse-id bad-parameters pulse-creator]}]
  (let [readable?        (contains? readable-ids pulse-id)
        ;; A filter can be missing from before this update, for example after a revision revert, which doesn't run
        ;; this handler. Listing it with the ones the update removed would blame the update for it.
        removed          (filterv #(contains? original-dashboard-params (:id %)) bad-parameters)
        already-broken?  (empty? removed)
        missing          (if already-broken? bad-parameters removed)
        ;; The subscription's stored names are a snapshot from when it was saved, so a filter renamed since then would
        ;; show by its old name. The dashboard's name from before the update is the one the user just removed.
        dashboard-filter (fn [{:keys [id]}]
                           (let [filter-name (get-in original-dashboard-params [id :name])]
                             {:id id, :name (if (str/blank? filter-name) id filter-name)}))]
    (cond-> {:id              pulse-id
             ;; Without the values, which a caller could show to someone the subscription doesn't belong to, and
             ;; without the names when the user can't read the subscription.
             :parameters      (cond
                                (not readable?) (mapv #(select-keys % [:id]) missing)
                                already-broken? (mapv #(select-keys % [:id :name]) missing)
                                :else           (mapv dashboard-filter missing))
             :already-broken? already-broken?
             :readable?       readable?}
      readable? (merge {:creator-name (:common_name pulse-creator)} (delivery (get pulse-id->channels pulse-id))))))

(defn- readable-pulse-ids
  "The ids among `pulse-ids` of the Pulses the current user can read."
  [pulse-ids]
  (if (seq pulse-ids)
    (into #{} (map :id) (mi/readable (pulse.db/pulses-with-ids pulse-ids)))
    #{}))

(defn handle-broken-subscriptions!
  "Archive every subscription on `dashboard-id` whose parameters no longer exist on the dashboard, and email affected users
  Must run after the update: it compares the dashboard's current resolved params against each pulse's stored params.
  Takes the dashboard's `:resolved-params` from before the update as `original-dashboard-params`.
  Returns what [[archived-subscription]] describes for each archived subscription, in archive order."
  [dashboard-id original-dashboard-params]
  (let [broken       (broken-subscription-data dashboard-id original-dashboard-params)
        readable-ids (readable-pulse-ids (map :pulse-id broken))
        channels     (visible-enabled-channels broken readable-ids)
        archived     (mapv #(archived-subscription original-dashboard-params readable-ids channels %) broken)]
    (pulse/update-pulses! (mapv #(hash-map :id (:pulse-id %) :archived true) broken))
    (run! messages/send-broken-subscription-notification! broken)
    archived))
