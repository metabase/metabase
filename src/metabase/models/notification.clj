(ns metabase.models.notification
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Notification             [_model] :notification)
(methodical/defmethod t2/table-name :model/NotificationSubscription [_model] :notification_subscription)
(methodical/defmethod t2/table-name :model/NotificationHandler      [_model] :notification_handler)
(methodical/defmethod t2/table-name :model/NotificationRecipient    [_model] :notification_recipient)

(doseq [model [:model/Notification
               :model/NotificationSubscription
               :model/NotificationHandler
               :model/NotificationRecipient]]
  (doto model
    (derive :metabase/model)
    (derive (if (= model :model/NotificationSubscription)
              :hook/created-at-timestamped?
              :hook/timestamped?))))

;; ------------------------------------------------------------------------------------------------;;
;;                                       :model/Notification                                       ;;
;; ------------------------------------------------------------------------------------------------;;

(def notification-types
  "Set of valid notification types."
  #{:notification/system-event
    :notification/dashboard-subscription
    :notification/alert
    ;; for testing only
    :notification/testing})

(t2/deftransforms :model/Notification
  {:payload_type (mi/transform-validator mi/transform-keyword (partial mi/assert-enum notification-types))})

(methodical/defmethod t2/batched-hydrate [:model/Notification :subscriptions]
  "Batch hydration NotificationSubscriptions for a list of Notifications."
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationSubscription :notification_id [:in (map :id notifications)]))
   :id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/Notification :handlers]
  "Batch hydration NotificationHandlers for a list of Notifications"
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationHandler :notification_id [:in (map :id notifications)]))
   :id
   {:default nil}))

(defn- delete-trigger-for-subscription!
  [& args]
  (apply (requiring-resolve 'metabase.task.notification/delete-trigger-for-subscription!) args))

(t2/define-before-delete :model/Notification
  [instance]
  (doseq [subscription-ids (t2/select-pks-set :model/NotificationSubscription :notification_id (:id instance))]
    (delete-trigger-for-subscription! subscription-ids))
  instance)

;; ------------------------------------------------------------------------------------------------;;
;;                               :model/NotificationSubscription                                   ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private subscription-types
  #{:notification-subscription/system-event
    :notification-subscription/cron})

(t2/deftransforms :model/NotificationSubscription
  {:type       (mi/transform-validator mi/transform-keyword (partial mi/assert-enum subscription-types))
   :event_name (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "event"))})

(def ^:private NotificationSubscription
  [:merge [:map
           [:type            (apply ms/enum-keywords-and-strings subscription-types)]]
   [:multi {:dispatch (comp keyword :type)}
    [:notification-subscription/system-event
     [:map
      [:type                           [:enum :notification-subscription/system-event]]
      [:event_name                     [:or :keyword :string]]
      [:cron_schedule {:optional true} nil?]]]
    [:notification-subscription/cron
     [:map
      [:type                           [:enum :notification-subscription/cron]]
      [:cron_schedule                  :string]
      [:event_name    {:optional true} nil?]]]]])

(defn- validate-subscription
  "Validate a NotificationSubscription."
  [subscription]
  (mu/validate-throw NotificationSubscription subscription))

(t2/define-before-insert :model/NotificationSubscription
  [instance]
  (validate-subscription instance)
  instance)

(defn- update-subscription-trigger!
  [& args]
  (apply (requiring-resolve 'metabase.task.notification/update-subscription-trigger!) args))

(t2/define-after-insert :model/NotificationSubscription
  [instance]
  (update-subscription-trigger! instance)
  instance)

(t2/define-before-update :model/NotificationSubscription
  [instance]
  (validate-subscription instance)
  (update-subscription-trigger! instance)
  instance)

(t2/define-before-delete :model/NotificationSubscription
  [instance]
  (delete-trigger-for-subscription! (:id instance))
  instance)

;; ------------------------------------------------------------------------------------------------;;
;;                                  :model/NotificationHandler                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/NotificationHandler
  {:channel_type (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))})

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :channel]
  "Batch hydration Channels for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(t2/select-fn->fn :id identity :model/Channel
                      :id [:in (map :channel_id notification-handlers)]
                      :active true)
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :template]
  "Batch hydration ChannelTemplates for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(t2/select-fn->fn :id identity :model/ChannelTemplate
                      :id [:in (map :template_id notification-handlers)])
   :template_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :recipients]
  "Batch hydration NotificationRecipients for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers
   k
   #(group-by :notification_handler_id
              (let [recipients       (t2/select :model/NotificationRecipient
                                                :notification_handler_id [:in (map :id notification-handlers)])
                    type->recipients (group-by :type recipients)]
                (-> type->recipients
                    (m/update-existing :notification-recipient/user
                                       (fn [recipients]
                                         (t2/hydrate recipients :user)))
                    (m/update-existing :notification-recipient/group
                                       (fn [recipients]
                                         (t2/hydrate recipients [:permissions_group :members])))
                    vals
                    flatten)))
   :id
   {:default []}))

(defn- cross-check-channel-type-and-template-type
  [notification-handler]
  (when-let [template-id (:template_id notification-handler)]
    (let [channel-type  (keyword (:channel_type notification-handler))
          template-type (t2/select-one-fn :channel_type [:model/ChannelTemplate :channel_type] template-id)]
      (when (not= channel-type template-type)
        (throw (ex-info "Channel type and template type mismatch"
                        {:status        400
                         :channel-type  channel-type
                         :template-type template-type}))))))

(t2/define-before-insert :model/NotificationHandler
  [instance]
  (cross-check-channel-type-and-template-type instance)
  instance)

(t2/define-before-update :model/NotificationHandler
  [instance]
  (when (or (contains? (t2/changes instance) :channel_id)
            (contains? (t2/changes instance) :template_id))
    (cross-check-channel-type-and-template-type instance)
    instance))

;; ------------------------------------------------------------------------------------------------;;
;;                                   :model/NotificationRecipient                                  ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private notification-recipient-types
  #{:notification-recipient/user
    :notification-recipient/group
    :notification-recipient/external-email
    :notification-recipient/template})

(t2/deftransforms :model/NotificationRecipient
  {:type    (mi/transform-validator mi/transform-keyword (partial mi/assert-enum notification-recipient-types))
   :details mi/transform-json})

(def NotificationRecipient
  "Schema for :model/NotificationRecipient."
  [:merge [:map
           [:type (into [:enum] notification-recipient-types)]
           [:notification_handler_id ms/PositiveInt]]
   [:multi {:dispatch :type}
    [:notification-recipient/user
     [:map
      [:user_id                               ms/PositiveInt]
      [:permissions_group_id {:optional true} [:fn nil?]]
      [:details              {:optional true} [:fn empty?]]]]
    [:notification-recipient/group
     [:map
      [:permissions_group_id                  ms/PositiveInt]
      [:user_id              {:optional true} [:fn nil?]]
      [:details              {:optional true} [:fn empty?]]]]
    [:notification-recipient/external-email
     [:map
      [:details                               [:map {:closed true}
                                               [:email ms/Email]]]
      [:user_id              {:optional true} [:fn nil?]]
      [:permissions_group_id {:optional true} [:fn nil?]]]]
    [:notification-recipient/template
     [:map
      [:details                               [:map {:closed true}
                                               [:pattern                      :string]
                                               [:is_optional {:optional true} :boolean]]]
      [:user_id              {:optional true} [:fn nil?]]
      [:permissions_group_id {:optional true} [:fn nil?]]]]]])

(defn- check-valid-recipient
  [recipient]
  (mu/validate-throw NotificationRecipient recipient))

(t2/define-before-insert :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  instance)

(t2/define-before-update :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  instance)

;; ------------------------------------------------------------------------------------------------;;
;;                                         Public APIs                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defn notifications-for-event
  "Find all active notifications for a given event."
  [event-name]
  (t2/select :model/Notification
             {:select    [:n.*]
              :from      [[:notification :n]]
              :left-join [[:notification_subscription :ns] [:= :n.id :ns.notification_id]]
              :where     [:and
                          [:= :n.active true]
                          [:= :ns.event_name (u/qualified-name event-name)]
                          [:= :ns.type (u/qualified-name :notification-subscription/system-event)]]}))

(defn create-notification!
  "Create a new notification with `subsciptions`.
  Return the created notification."
  [notification subscriptions handlers+recipients]
  (t2/with-transaction [_conn]
    (let [instance (t2/insert-returning-instance! :model/Notification notification)
          id       (:id instance)]
      (when (seq subscriptions)
        (t2/insert! :model/NotificationSubscription (map #(assoc % :notification_id id) subscriptions)))
      (doseq [handler handlers+recipients]
        (let [recipients (:recipients handler)
              handler    (-> handler
                             (dissoc :recipients)
                             (assoc :notification_id id))
              handler-id (t2/insert-returning-pk! :model/NotificationHandler handler)]
          (t2/insert! :model/NotificationRecipient (map #(assoc % :notification_handler_id handler-id) recipients))))
      instance)))
