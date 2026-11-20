(ns metabase.notification.write
  "The write functions of Notifications and their NotificationCards, NotificationSubscriptions, NotificationHandlers and
  NotificationRecipients, through which every writer creates, updates and deletes them."
  (:require
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.db :as notification.db]
   [metabase.notification.schema :as notification.schema]
   [metabase.notification.task.send-trigger :as notification.task.send-trigger]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- clean-row-or-select
  "`row-or-id` when it is a row the caller loaded, else the row with that id, which `select-row` loads."
  [row-or-id select-row]
  (if (map? row-or-id) row-or-id (select-row row-or-id)))

(defn- with-updated-at
  "`changes` with the time of the update, unless they hold one."
  [changes]
  (cond-> changes
    (not (contains? changes :updated_at)) (assoc :updated_at (mi/now))))

;;; ----------------------------------------------- Shared checks ----------------------------------------------------

(defenterprise validate-email-domains!
  "Check that whether `email-addresses` are allowed based on the value of the [[subscription-allowed-domains]] Setting,
  if set. This function no-ops if `subscription-allowed-domains` is unset or if we do not have a premium token with the
  `:email-allow-list` feature." metabase-enterprise.advanced-config.models.notification
  [_email-addresses]
  nil)

(defn check-notification
  "Throws unless `notification` matches `:metabase.notification.models/Notification`."
  [notification]
  (mu/validate-throw :metabase.notification.models/Notification notification))

(defn check-subscription
  "Throws unless `subscription` matches `:metabase.notification.models/NotificationSubscription`."
  [subscription]
  (mu/validate-throw :metabase.notification.models/NotificationSubscription subscription))

(defn check-handler
  "Throws unless `handler` matches `:metabase.notification.models/NotificationHandler`."
  [handler]
  (mu/validate-throw :metabase.notification.models/NotificationHandler handler))

(defn cross-check-channel-type-and-template-type
  "Throws a 400 when the template of `notification-handler` is for another channel type than the handler is."
  [notification-handler]
  (when-let [template-id (:template_id notification-handler)]
    (let [channel-type  (keyword (:channel_type notification-handler))
          template-type (notification.db/channel-template-channel-type template-id)]
      (when (not= channel-type template-type)
        (throw (ex-info "Channel type and template type mismatch"
                        {:status-code   400
                         :channel-type  channel-type
                         :template-type template-type}))))))

(defn check-recipient
  "Throws unless `recipient` matches `:metabase.notification.models/NotificationRecipient` and, when it is a raw-value
  email address, the `subscription-allowed-domains` Setting allows it."
  [recipient]
  (mu/validate-throw :metabase.notification.models/NotificationRecipient recipient)
  (when (and (= :notification-recipient/raw-value (:type recipient))
             (u/email? (get-in recipient [:details :value])))
    (validate-email-domains! [(get-in recipient [:details :value])])))

;;; --------------------------------------------- NotificationCard ---------------------------------------------------

(mu/defn create-notification-card!
  "Insert the NotificationCard `row`, whose after-insert hook publishes its create event, returning its id; for
  `metabase.notification.models/create-notification!`."
  [row :- ::notification.schema/notification-card.update]
  (events/with-batched-events
    (notification.db/insert-notification-card! row)))

(mu/defn update-notification-card! :- :int
  "Apply `changes` to `card-or-id`, a NotificationCard the caller already loaded or the id of one, and publish its update
  event, returning the number updated; for generic writers."
  [card-or-id :- [:or ms/PositiveInt :map]
   changes    :- ::notification.schema/notification-card.changes
   _opts      :- ::notification.schema/write-opts]
  (let [card    (clean-row-or-select card-or-id notification.db/notification-card)
        changes (when card (changed card changes))]
    (if (empty? changes)
      0
      (let [changes (with-updated-at changes)]
        (events/with-batched-events
          (u/prog1 (notification.db/update-notification-card! (:id card) changes)
            (events/updated! :model/NotificationCard (merge card changes) card)))))))

(mu/defn delete-notification-cards! :- :int
  "Delete the NotificationCards with `ids` and publish their delete events, returning the number deleted; for the
  deletion of a card Notification and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::notification.schema/write-opts]
  (let [cards (when (seq ids) (notification.db/notification-cards (set ids)))]
    (if (empty? cards)
      0
      (events/with-batched-events
        (events/deleting! :model/NotificationCard cards
                          #(notification.db/delete-notification-cards! (mapv :id cards)))))))

;;; --------------------------------------------- Notification -------------------------------------------------------

(mu/defn create-notification!
  "Insert the Notification `row`, whose before-insert hook checks it and whose after-insert hook publishes its create
  event, returning the inserted Notification; for `metabase.notification.models/create-notification!`."
  [row :- ::notification.schema/notification.update]
  (events/with-batched-events
    (notification.db/insert-notification! row)))

(defn- check-notification-changes
  "Throws unless `changes` to a Notification, which leave it as `notification`, are an update a Notification allows."
  [notification changes]
  (check-notification notification)
  (when-let [unallowed-key (some #{:payload_type :payload_id} (keys changes))]
    (throw (ex-info (format "Update %s is not allowed." (name unallowed-key))
                    {:status-code 400
                     :changes     changes}))))

(defn- update-subscription-triggers!
  "Create or delete the Quartz triggers of the cron subscriptions of the Notification with `notification-id`, as it is
  `active?`."
  [notification-id active?]
  (doseq [subscription (notification.db/cron-subscriptions-for-notification notification-id)]
    (if active?
      (notification.task.send-trigger/update-subscription-trigger! subscription)
      (notification.task.send-trigger/delete-trigger-for-subscription! (:id subscription)))))

(defn- notification-changes
  "The `changes` to `notification` that change it, checked and with the time `now` of the update, or nil when there are
  none."
  [notification changes now]
  (let [changes (changed notification changes)]
    (when (seq changes)
      (check-notification-changes (merge notification changes) changes)
      (cond-> changes
        (not (contains? changes :updated_at)) (assoc :updated_at now)))))

(mu/defn update-notifications! :- :int
  "Apply `changes` to `notifications`, Notifications the caller already loaded, in one statement for those the changes
  update alike, publish their update events, and create or delete the Quartz triggers of the subscriptions of those
  whose `:active` changes, returning the number of Notifications updated; for the bulk endpoint of the admin API, the
  archive of a User's subscriptions and generic writers."
  [notifications :- [:sequential :map]
   changes       :- ::notification.schema/notification.changes
   _opts         :- ::notification.schema/write-opts]
  (let [now   (mi/now)
        plans (into [] (keep (fn [notification]
                               (when-let [final (notification-changes notification changes now)]
                                 [notification final])))
                    notifications)]
    (when (seq plans)
      (events/with-batched-events
        (doseq [[final group] (group-by second plans)]
          (when (contains? final :active)
            (run! (fn [[notification _]] (update-subscription-triggers! (:id notification) (:active final))) group))
          (notification.db/update-notifications! (mapv (comp :id first) group) final)
          (doseq [[notification _] group]
            (events/updated! :model/Notification (merge notification final) notification)))))
    (count plans)))

(mu/defn update-notification! :- :int
  "Apply `changes` to `notification-or-id`, a Notification the caller already loaded or the id of one, as
  [[update-notifications!]] does, returning the number of Notifications updated; for the REST API, the send task and
  user deactivation."
  [notification-or-id :- [:or ms/PositiveInt :map]
   changes            :- ::notification.schema/notification.changes
   opts               :- ::notification.schema/write-opts]
  (if-let [notification (clean-row-or-select notification-or-id notification.db/notification)]
    (update-notifications! [notification] changes opts)
    0))

(mu/defn update-card-notifications! :- :int
  "Apply `changes` to the card Notifications among `ids` as [[update-notifications!]] does, returning the number updated;
  for the bulk endpoint of the admin API."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::notification.schema/notification.changes
   opts    :- ::notification.schema/write-opts]
  (update-notifications! (if (seq ids) (notification.db/card-notifications ids) []) changes opts))

(defn- prepare-notification-deletion!
  "Delete the Quartz triggers of the cron subscriptions of `notification`, about to be deleted, and its card payload."
  [{:keys [id payload_id payload_type]}]
  (doseq [subscription-id (notification.db/cron-subscription-ids-for-notification id)]
    (notification.task.send-trigger/delete-trigger-for-subscription! subscription-id))
  (when payload_id
    (case payload_type
      :notification/card (delete-notification-cards! [payload_id] {}))))

(mu/defn delete-notifications! :- :int
  "Delete the Notifications with `ids`, their card payloads and the Quartz triggers of their subscriptions, and publish
  their delete events, returning the number deleted; for the REST API, the send task, the seed, the deletion of the
  alerts of a Card or Collection and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::notification.schema/write-opts]
  (let [notifications (when (seq ids) (notification.db/notifications-by-id ids))]
    (if (empty? notifications)
      0
      (events/with-batched-events
        (events/deleting! :model/Notification notifications
                          (fn []
                            (run! prepare-notification-deletion! notifications)
                            (notification.db/delete-notifications! (mapv :id notifications))))))))

;;; ---------------------------------------- NotificationSubscription -------------------------------------------------

(mu/defn create-notification-subscriptions!
  "Insert the NotificationSubscription `rows`, whose after-insert hook publishes their create events and creates their
  Quartz triggers, returning the number inserted; for `metabase.notification.models/create-notification!`."
  [rows :- [:sequential ::notification.schema/notification-subscription.update]]
  (events/with-batched-events
    (notification.db/insert-subscriptions! rows)))

(mu/defn update-notification-subscription! :- :int
  "Apply `changes` to `subscription-or-id`, a NotificationSubscription the caller already loaded or the id of one,
  publish its update event and move its Quartz trigger, returning the number updated; for generic writers."
  [subscription-or-id :- [:or ms/PositiveInt :map]
   changes            :- ::notification.schema/notification-subscription.update
   _opts              :- ::notification.schema/write-opts]
  (let [subscription (clean-row-or-select subscription-or-id notification.db/subscription)
        changes      (when subscription (changed subscription changes))]
    (if (empty? changes)
      0
      (let [updated (merge subscription changes)]
        (check-subscription updated)
        (events/with-batched-events
          (notification.task.send-trigger/update-subscription-trigger! updated)
          (u/prog1 (notification.db/update-subscription! (:id subscription) changes)
            (events/updated! :model/NotificationSubscription updated subscription)))))))

(mu/defn delete-notification-subscriptions! :- :int
  "Delete the NotificationSubscriptions with `ids` and their Quartz triggers, and publish their delete events, returning
  the number deleted; for generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::notification.schema/write-opts]
  (let [subscriptions (when (seq ids) (notification.db/subscriptions-with-ids ids))]
    (if (empty? subscriptions)
      0
      (events/with-batched-events
        (events/deleting! :model/NotificationSubscription subscriptions
                          (fn []
                            (run! #(notification.task.send-trigger/delete-trigger-for-subscription! (:id %)) subscriptions)
                            (notification.db/delete-subscriptions! (mapv :id subscriptions))))))))

;;; ------------------------------------------- NotificationHandler ----------------------------------------------------

(mu/defn create-notification-handler!
  "Insert the NotificationHandler `row`, whose before-insert hook checks it and whose after-insert hook publishes its
  create event, returning its id; for `metabase.notification.models/create-notification!`."
  [row :- ::notification.schema/notification-handler.update]
  (events/with-batched-events
    (notification.db/insert-handler! row)))

(mu/defn update-notification-handler! :- :int
  "Apply `changes` to `handler-or-id`, a NotificationHandler the caller already loaded or the id of one, and publish its
  update event, returning the number updated; for generic writers."
  [handler-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::notification.schema/notification-handler.changes
   _opts         :- ::notification.schema/write-opts]
  (let [handler (clean-row-or-select handler-or-id notification.db/handler)
        changes (when handler (changed handler changes))]
    (if (empty? changes)
      0
      (let [updated (merge handler changes)]
        (check-handler updated)
        (when (some #{:channel_id :template_id :channel_type} (keys changes))
          (cross-check-channel-type-and-template-type updated))
        (let [changes (with-updated-at changes)]
          (events/with-batched-events
            (u/prog1 (notification.db/update-handler! (:id handler) changes)
              (events/updated! :model/NotificationHandler (merge handler changes) handler))))))))

(mu/defn delete-notification-handlers! :- :int
  "Delete the NotificationHandlers with `ids` and publish their delete events, returning the number deleted; for generic
  writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::notification.schema/write-opts]
  (let [handlers (when (seq ids) (notification.db/handlers-with-ids ids))]
    (if (empty? handlers)
      0
      (events/with-batched-events
        (events/deleting! :model/NotificationHandler handlers
                          #(notification.db/delete-handlers! (mapv :id handlers)))))))

;;; ------------------------------------------ NotificationRecipient ---------------------------------------------------

(mu/defn create-notification-recipients!
  "Insert the NotificationRecipient `rows`, one map or a sequence, whose before-insert hook checks them and whose
  after-insert hook publishes their create events, returning the number inserted; for
  `metabase.notification.models/create-notification!` and unsubscribing."
  [rows :- [:or ::notification.schema/notification-recipient.update [:sequential ::notification.schema/notification-recipient.update]]]
  (events/with-batched-events
    (notification.db/insert-recipients! rows)))

(mu/defn update-notification-recipient! :- :int
  "Apply `changes` to `recipient-or-id`, a NotificationRecipient the caller already loaded or the id of one, and publish
  its update event, returning the number updated; for generic writers."
  [recipient-or-id :- [:or ms/PositiveInt :map]
   changes         :- ::notification.schema/notification-recipient.changes
   _opts           :- ::notification.schema/write-opts]
  (let [recipient (clean-row-or-select recipient-or-id notification.db/recipient)
        changes   (when recipient (changed recipient changes))]
    (if (empty? changes)
      0
      (let [updated (merge recipient changes)]
        (check-recipient updated)
        (let [changes (with-updated-at changes)]
          (events/with-batched-events
            (u/prog1 (notification.db/update-recipient! (:id recipient) changes)
              (events/updated! :model/NotificationRecipient (merge recipient changes) recipient))))))))

(mu/defn delete-notification-recipients! :- :int
  "Delete the NotificationRecipients with `ids` and publish their delete events, returning the number deleted; for
  unsubscribing, user deactivation and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::notification.schema/write-opts]
  (let [recipients (when (seq ids) (notification.db/recipients-with-ids ids))]
    (if (empty? recipients)
      0
      (events/with-batched-events
        (events/deleting! :model/NotificationRecipient recipients
                          #(notification.db/delete-recipients! (mapv :id recipients)))))))

(mu/defn delete-user-recipients-for-notification! :- :int
  "Delete the NotificationRecipients for the User with `user-id` on the Notification with `notification-id` as
  [[delete-notification-recipients!]] does, returning the number deleted."
  [notification-id :- ms/PositiveInt
   user-id         :- ms/PositiveInt]
  (delete-notification-recipients! (notification.db/user-recipient-ids-for-notification notification-id user-id) {}))

;;; ------------------------------------------------ ChannelTemplate -------------------------------------------------

(mu/defn delete-channel-templates! :- :int
  "Delete the ChannelTemplates with `ids` through the write functions of the model, returning the number deleted; for
  the seed."
  [ids :- [:maybe [:sequential ms/PositiveInt]]]
  ((:delete! (mi/write-fns :model/ChannelTemplate)) (vec ids) {}))

;;; ------------------------------------------------ Generic writers -------------------------------------------------

(defmethod mi/write-fns :model/Notification
  [_model]
  {:update!     update-notification!
   :update-all! update-notifications!
   :delete!     delete-notifications!})

(defmethod mi/write-fns :model/NotificationCard
  [_model]
  {:update! update-notification-card!
   :delete! delete-notification-cards!})

(defmethod mi/write-fns :model/NotificationSubscription
  [_model]
  {:update! update-notification-subscription!
   :delete! delete-notification-subscriptions!})

(defmethod mi/write-fns :model/NotificationHandler
  [_model]
  {:update! update-notification-handler!
   :delete! delete-notification-handlers!})

(defmethod mi/write-fns :model/NotificationRecipient
  [_model]
  {:update! update-notification-recipient!
   :delete! delete-notification-recipients!})
