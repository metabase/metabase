(ns metabase.pulse.write
  "The full write of a Pulse with its PulseCards, PulseChannels and PulseChannelRecipients, as the REST endpoints and the
  MCP and Metabot tools make it."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.permissions.core :as perms]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- PulseChannel writes -----------------------------------------------

(defn update-recipients!
  "Update the `PulseChannelRecipients` for `pulse-CHANNEL`.
  `user-ids` should be a definitive collection of *all* IDs of users who should receive the pulse.

  *  If an ID in `user-ids` has no corresponding existing `PulseChannelRecipients` object, one will be created.
  *  If an existing `PulseChannelRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  [id user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (pulse.db/pulse-channel-recipient-user-ids id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:pulse_channel_id id} :user_id %) recipients+)]
        (pulse.db/insert-pulse-channel-recipients! vs)))
    (when (seq recipients-)
      (pulse.db/delete-pulse-channel-recipients-raw! id recipients-))))

(defn update-pulse-channel!
  "Updates an existing `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
  [{:keys [id channel_type enabled details recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? id)
         (m/boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))]
    (pulse.db/update-pulse-channel! id
                                    {:details        (cond-> details
                                                       (pulse-channel/supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                                     :enabled        enabled
                                     :schedule_type  schedule_type
                                     :schedule_hour  (when (not= schedule_type :hourly)
                                                       schedule_hour)
                                     :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                                       schedule_day)
                                     :schedule_frame (when (= schedule_type :monthly)
                                                       schedule_frame)})
    (when (pulse-channel/supports-recipients? channel_type)
      (update-recipients! id (or (get recipients-by-type true) [])))))

(defn create-pulse-channel!
  "Create a new `PulseChannel` along with all related data associated with the channel such as
  `PulseChannelRecipients`."
  [{:keys [channel_type channel_id details enabled pulse_id recipients schedule_type schedule_day schedule_hour schedule_frame]
    :or   {details          {}
           recipients       []}}]
  {:pre [(integer? pulse_id)
         (boolean? enabled)
         (coll? recipients)
         (every? map? recipients)]}
  (let [recipients-by-type (group-by integer? (filter identity (map #(or (:id %) (:email %)) recipients)))
        id                 (pulse.db/insert-pulse-channel!
                            {:pulse_id       pulse_id
                             :channel_type   channel_type
                             :channel_id     channel_id
                             :details        (cond-> details
                                               (pulse-channel/supports-recipients? channel_type) (assoc :emails (get recipients-by-type false)))
                             :enabled        enabled
                             :schedule_type  schedule_type
                             :schedule_hour  (when (not= schedule_type :hourly)
                                               schedule_hour)
                             :schedule_day   (when (contains? #{:weekly :monthly} schedule_type)
                                               schedule_day)
                             :schedule_frame (when (= schedule_type :monthly)
                                               schedule_frame)})]
    (when (and (pulse-channel/supports-recipients? channel_type) (seq (get recipients-by-type true)))
      (update-recipients! id (get recipients-by-type true)))
    id))

;;; ------------------------------------------------- Pulse writes ----------------------------------------------------

(mu/defn update-notification-cards!
  "Update the PulseCards for a given `notification-or-id`. `card-refs` should be a definitive collection of *all* Cards
  for the Notification in the desired order. They should have keys like `id`, `include_csv`, and `include_xls`.

  *  If a Card ID in `card-refs` has no corresponding existing `PulseCard` object, one will be created.
  *  If an existing `PulseCard` has no corresponding ID in CARD-IDs, it will be deleted.
  *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  [notification-or-id :- models.pulse/NotificationOrId
   card-refs           :- [:maybe [:sequential models.pulse/CardRef]]]
  (pulse.db/delete-pulse-cards-for-pulse! (u/the-id notification-or-id))
  (when (seq card-refs)
    (let [cards (map-indexed (fn [i {card-id :id :keys [include_csv include_xls format_rows pivot_results dashboard_card_id]}]
                               {:pulse_id          (u/the-id notification-or-id)
                                :card_id           card-id
                                :position          i
                                :include_csv       include_csv
                                :include_xls       include_xls
                                :format_rows       format_rows
                                :pivot_results     pivot_results
                                :dashboard_card_id dashboard_card_id})
                             card-refs)]
      (pulse.db/insert-pulse-cards! cards))))

(mu/defn update-notification-channels!
  "Update the PulseChannels for a given `notification-or-id`. `channels` should be a definitive collection of *all* of
  the channels for the Notification.

    * If a channel in the list has no existing `PulseChannel` object, one will be created.

    * If an existing `PulseChannel` has no corresponding entry in `channels`, it will be deleted.

    * All previously existing channels will be updated with their most recent information."
  [notification-or-id :- models.pulse/NotificationOrId
   channels           :- [:sequential models.pulse/PulseChannelInput]]
  (let [existing-channels   (pulse.db/pulse-channels-for-pulse (u/the-id notification-or-id))
        channels            (map-indexed
                             (fn [idx channel]
                               (assoc channel
                                      :channel_type   (keyword (:channel_type channel))
                                      :schedule_type  (keyword (:schedule_type channel))
                                      :schedule_frame (keyword (:schedule_frame channel))
                                      :pulse_id       (u/the-id notification-or-id)
                                      ;; for "new channels" we assign it with an negative id so that
                                      ;; row-diff will treat it as :to-create
                                      :id             (or
                                                       (:id channel)
                                                       (- (inc idx)))))
                             channels)
        {:keys [to-create
                to-update
                to-delete]} (u/row-diff existing-channels
                                        channels
                                        {:to-compare #(dissoc % :created_at :updated_at)})]
    (doseq [channel to-create]
      (create-pulse-channel! channel))
    (doseq [channel to-update]
      (assert (:id channel) "Cannot update a PulseChannel without an :id")
      (update-pulse-channel! channel))
    (binding [pulse-channel/*archive-parent-pulse-when-last-channel-is-deleted* false]
      (when (seq to-delete)
        (assert (every? :id to-delete) "Cannot delete a PulseChannel without an :id")
        (pulse.db/delete-pulse-channels! (map :id to-delete))))))

(mu/defn- create-notification-and-add-cards-and-channels!
  "Create a new Pulse/Alert with the properties specified in `notification`; add the `card-refs` to the Notification and
  add the Notification to `channels`. Returns the `id` of the newly created Notification."
  [notification :- ::pulse.schema/pulse.update
   card-refs    :- [:maybe [:sequential models.pulse/CardRef]]
   channels     :- [:sequential models.pulse/PulseChannelInput]]
  (t2/with-transaction [_conn]
    (let [notification (pulse.db/insert-pulse! notification)]
      (update-notification-cards! notification card-refs)
      (update-notification-channels! notification channels)
      (u/the-id notification))))

(mu/defn create-pulse!
  "Create a new Pulse by inserting it into the database along with all associated pieces of data such as:
  PulseCards, PulseChannels, and PulseChannelRecipients.

  Returns the newly created Pulse, or throws an Exception."
  [cards    :- [:sequential models.pulse/CardRef]
   channels :- [:sequential models.pulse/PulseChannelInput]
   kvs      :- [:map {:closed true}
                [:name                                 ms/NonBlankString]
                [:creator_id                           ms/PositiveInt]
                [:skip_if_empty       {:optional true} [:maybe :boolean]]
                [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                [:dashboard_id        {:optional true} [:maybe ms/PositiveInt]]
                [:parameters          {:optional true} [:maybe [:sequential ::pulse.schema/pulse.parameter]]]
                [:disable_links       {:optional true} [:maybe ms/BooleanValue]]]]
  (let [pulse-id (events/with-batched-events
                   (create-notification-and-add-cards-and-channels! kvs cards channels))]
    (models.pulse/retrieve-pulse pulse-id)))

(mu/defn- card-refs-have-changed? :- :boolean
  [notification-or-id :- models.pulse/NotificationOrId
   new-card-refs      :- [:sequential models.pulse/CardRef]]
  (not= (pulse.db/pulse-card-refs (u/the-id notification-or-id))
        new-card-refs))

(mu/defn- update-notification!
  "Update the supplied keys in a `notification`."
  [notification :- models.pulse/UpdateNotificationInput]
  (pulse.db/update-pulse! (u/the-id notification)
                          (u/select-keys-when notification
                                              :present [:collection_id :collection_position :archived]
                                              :non-nil [:name :alert_condition :alert_above_goal :alert_first_only :skip_if_empty :parameters]))
  (when (contains? notification :cards)
    (let [card-refs (map models.pulse/card->ref (:cards notification))]
      (when (card-refs-have-changed? notification card-refs)
        (update-notification-cards! notification card-refs))))
  (when (contains? notification :channels)
    (update-notification-channels! notification (:channels notification))))

(defn update-pulse!
  "Update an existing Pulse, including all associated data such as: PulseCards, PulseChannels, and
  PulseChannelRecipients.

  Returns the updated Pulse or throws an Exception."
  [pulse]
  (events/with-batched-events
    (update-notification! pulse))
  (models.pulse/retrieve-pulse (u/the-id pulse)))

;;; ------------------------------------------- Writes of the REST endpoints ------------------------------------------

(defn email-channel
  "Get email channel from an alert."
  [alert]
  (m/find-first #(= :email (keyword (:channel_type %))) (:channels alert)))

(defn- without-collection-for-dashboard-subscription
  "Set `:collection_id` and `:collection_position` in `pulse-data` to nil when it is a dashboard subscription.

  `before-insert` takes `:collection_id` from the dashboard only when the request sends none. Without this step, the
  permission check would demand write access to the collection in the request, even when it is the collection of the
  dashboard. A user with view access only would get a 403. `check-dashboard-subscription-collection-keys!` rejects
  any other collection."
  [{:keys [dashboard_id] :as pulse-data}]
  (cond-> pulse-data
    dashboard_id (assoc :collection_id nil :collection_position nil)))

(defn- check-dashboard-subscription-collection-keys!
  "Throw a 400 when the request is a dashboard subscription with a `:collection_position`, or with a non-nil
  `:collection_id` that is not the collection of its dashboard."
  [{:keys [dashboard_id collection_id collection_position]}]
  (when dashboard_id
    (api/check-400 (nil? collection_position)
                   (tru "A dashboard subscription cannot have a collection position."))
    (when (some? collection_id)
      (let [dashboard-collection-id (pulse.db/dashboard-collection-id dashboard_id)]
        (api/check-400 (= collection_id dashboard-collection-id)
                       (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                            dashboard-collection-id
                            collection_id))))))

(defn create-pulse-with-perm-checks!
  "Create a new Pulse with permissions checks.

  A dashboard subscription goes in the collection of its dashboard, and it has no pin position. After the permission
  checks, throw a 400 when `requested` has a `:collection_position`, or a non-nil `:collection_id` that is not the
  dashboard's. View access to the dashboard is enough to subscribe to it:
  https://github.com/metabase/metabase/pull/17722"
  [cards channels requested]
  (perms/check-has-application-permission :subscription false)
  (let [pulse-data (without-collection-for-dashboard-subscription requested)]
    (api/create-check :model/Pulse (assoc pulse-data :cards cards))
    ;; Check after the permission checks, so the error tells a caller nothing about a dashboard they cannot read.
    ;; Check `requested`, not `pulse-data`: for a dashboard subscription, `pulse-data` has both collection keys set
    ;; to nil.
    (check-dashboard-subscription-collection-keys! requested)
    (t2/with-transaction [_conn]
      ;; Adding a new pulse at `collection_position` could cause other pulses in this collection to change position,
      ;; check that and fix it if needed
      (api/maybe-reconcile-collection-position! (select-keys pulse-data [:collection_id :collection_position]))
      (api/check-500
       (create-pulse! (map models.pulse/card->ref cards) channels pulse-data)))))

(defn- maybe-add-recipients
  "Merge back the recipients the current user was not allowed to see before writing `pulse-updates`.

  The `:channels` submitted to an update are authoritative — [[update-notification-channels!]]
  deletes any recipient not present — so every recipient hidden on the read path must be restored on
  the write path, or a caller who reads a pulse and submits it back silently deletes recipients it
  never saw. Two read filters hide recipients, and each is compensated here:

  * sandboxed and connection-impersonated users see only themselves
    (see [[metabase.pulse.models.pulse/maybe-filter-pulses-recipients]]);
  * tenant-scoped users see only same-tenant users
    (see [[metabase.pulse.models.pulse/hidden-cross-tenant-recipients]]).

  Only Metabase-user recipients are merged back. Raw email addresses stay visible to these users
  under both filters, so they remain the caller's to add or remove."
  [pulse-updates pulse-before-update]
  (let [existing-recipients (:recipients (email-channel pulse-before-update))
        recipients-to-add   (concat
                             (when (perms/sandboxed-or-impersonated-user?)
                               (filter (fn [{id :id}] (and id (not= id api/*current-user-id*)))
                                       existing-recipients))
                             (models.pulse/hidden-cross-tenant-recipients existing-recipients))]
    (if (and (seq recipients-to-add) (seq (:channels pulse-updates)))
      (assoc pulse-updates :channels
             (for [channel (:channels pulse-updates)]
               ;; normalize like [[email-channel]]: :channel_type is a string over REST but a
               ;; keyword when this is called directly with a hydrated pulse
               (if (= :email (keyword (:channel_type channel)))
                 (assoc channel :recipients
                        (m/distinct-by (some-fn :id :email)
                                       (concat (:recipients channel) recipients-to-add)))
                 channel)))
      pulse-updates)))

(defn check-card-read-permissions
  "Users can only create a pulse for `cards` they have access to."
  [cards]
  (let [card-ids (mapv u/the-id cards)]
    (doseq [card-id card-ids]
      (assert (integer? card-id)))
    (let [id->card (into {} (map (juxt :id identity)) (t2/hydrate (pulse.db/cards card-ids) :can_read))]
      (doseq [card-id card-ids]
        (api/read-check (get id->card card-id))))))

(defn- drop-unchanged-collection-keys
  "Remove `:collection_id` and `:collection_position` from `pulse-updates` of a dashboard subscription.

  Throw a 400 when either key differs from its stored value in `pulse`."
  [pulse pulse-updates]
  (doseq [k [:collection_id :collection_position]
          :when (and (contains? pulse-updates k)
                     (not= (get pulse-updates k) (get pulse k)))]
    (throw (ex-info (tru "A dashboard subscription cannot change its {0}." (name k))
                    {:status-code 400})))
  (dissoc pulse-updates :collection_id :collection_position))

(defn update-pulse-with-perm-checks!
  "Apply `pulse-updates` to the Pulse with `id`, running the same permission checks `PUT /api/pulse/:id`
  runs: the subscription/monitoring application permission, `api/update-check` on the Pulse (write access and the
  advanced-permissions gate on adding recipients), read checks on any `:cards`, and the collection-change check.
  Returns the updated Pulse.

  A dashboard subscription stays in the collection of its dashboard, and it has no pin position. Throw a 400 when
  `pulse-updates` has a different `:collection_id` or `:collection_position`. Values equal to the stored ones are
  accepted and ignored."
  [id {:keys [cards] :as pulse-updates}]
  ;; Validate `:cards` up front so a bad card ref is a clean 400, not a 500. This fn is called
  ;; directly (e.g. from the agent API), not only through the PUT endpoint whose schema already
  ;; coerces `:cards` — without this, `check-card-read-permissions`'s `(assert (integer? card-id))`
  ;; throws a bare AssertionError (no :status-code) on a string id and surfaces as a 500.
  (when (some? cards)
    (when-not (mr/validate [:sequential models.pulse/CoercibleToCardRef] cards)
      (throw (ex-info (tru "Invalid :cards: each entry must be a card reference.")
                      {:status-code 400}))))
  (try
    (perms/check-has-application-permission :monitoring)
    (catch clojure.lang.ExceptionInfo _e
      (perms/check-has-application-permission :subscription false)))
  (let [pulse-before-update (api/check-404 (models.pulse/retrieve-pulse id))]
    (api/update-check pulse-before-update pulse-updates)
    (let [;; Drop the unchanged keys before every check below: the collection check would demand write access to the old
          ;; and the requested collection, and `before-update` throws on any change to `:collection_id`.
          pulse-updates (cond->> pulse-updates
                          (:dashboard_id pulse-before-update) (drop-unchanged-collection-keys pulse-before-update))]
      (check-card-read-permissions cards)
      (let [pulse-updates (maybe-add-recipients pulse-updates pulse-before-update)]
        (t2/with-transaction [_conn]
          ;; If the collection or position changed with this update, we might need to fixup the old and/or new collection,
          ;; depending on what changed.
          (api/maybe-reconcile-collection-position! (select-keys pulse-before-update [:collection_id :collection_position]) (select-keys pulse-updates [:collection_id :collection_position]))
          (update-pulse!
           (assoc (select-keys pulse-updates [:name :cards :channels :skip_if_empty :collection_id :collection_position
                                              :archived :parameters])
                  :id id))))))
  (models.pulse/retrieve-pulse id))
