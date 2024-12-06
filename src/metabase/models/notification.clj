(ns metabase.models.notification
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.models.spec-update :as models.spec-update]
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
(methodical/defmethod t2/table-name :model/NotificationCard         [_model] :notification_card)

(doseq [model [:model/Notification
               :model/NotificationSubscription
               :model/NotificationHandler
               :model/NotificationRecipient
               :model/NotificationCard]]
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
    :notification/dashboard
    :notification/card
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
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Notification :payload]
  "Batch hydration payloads for a list of Notifications."
  [_model k notifications]
  (let [payload-type->ids        (u/group-by :payload_type :payload_id
                                             conj #{}
                                             notifications)
        payload-type+id->payload (into {}
                                       (for [[payload-type payload-ids] payload-type->ids]
                                         (case payload-type
                                           :notification/system-event
                                           {[:notification/system-event nil] nil}
                                           :notification/card
                                           (t2/select-fn->fn (fn [x] [payload-type (:id x)]) identity
                                                             :model/NotificationCard :id [:in payload-ids]))))]

    (for [notification notifications]
      (assoc notification k
             (get payload-type+id->payload [(:payload_type notification)
                                            (:payload_id notification)])))))

(methodical/defmethod t2/batched-hydrate [:model/Notification :handlers]
  "Batch hydration NotificationHandlers for a list of Notifications"
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationHandler :notification_id [:in (map :id notifications)]))
   :id
   {:default []}))

(def ^:private Notification
  [:merge
   [:map
    [:payload_type (apply ms/enum-decode-keyword notification-types)]]
   [:multi {:dispatch (comp keyword :payload_type)}
    [:notification/system-event
     [:map
      [:payload_id {:optional true} nil?]]]
    [:notification/card
     [:map
      ;; optional during creation
      [:payload_id {:optional true} int?]
      [:creator_id int?]]]
    [:notification/testing :any]]])

(defn- validate-notification
  [notification]
  (mu/validate-throw Notification notification))

(t2/define-before-insert :model/Notification
  [instance]
  (validate-notification instance)
  instance)

(t2/define-before-update :model/Notification
  [instance]
  (validate-notification instance)
  (when (some #{:payload_type :payload_id} (keys (t2/changes instance)))
    (throw (ex-info "Update notification payload is not allowed."
                    {:status-code 400
                     :changes     (t2/changes instance)})))
  instance)

(defn- delete-trigger-for-subscription!
  [& args]
  (apply (requiring-resolve 'metabase.task.notification/delete-trigger-for-subscription!) args))

(t2/define-before-delete :model/Notification
  [instance]
  (doseq [subscription-id (t2/select-pks-set :model/NotificationSubscription
                                             :notification_id (:id instance)
                                             :type :notification-subscription/cron)]
    (delete-trigger-for-subscription! subscription-id))
  (when-let [payload-id (:payload_id instance)]
    (t2/delete! (case (:payload_type instance)
                  :notification/card
                  :model/NotificationCard)
                payload-id))
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
           [:type (apply ms/enum-decode-keyword subscription-types)]]
   [:multi {:dispatch (comp keyword :type)}
    [:notification-subscription/system-event
     [:map
      [:event_name                     [:or :keyword :string]]
      [:cron_schedule {:optional true} nil?]]]
    [:notification-subscription/cron
     [:map
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

(def ^:private NotificationHandler
  [:map
   ;; optional during insertion
   [:notification_id {:optional true} ms/PositiveInt]
   [:channel_type                     [:fn #(= "channel" (-> % keyword namespace))]]
   [:channel_id      {:optional true} [:maybe ms/PositiveInt]]
   [:template_id     {:optional true} [:maybe ms/PositiveInt]]
   [:active          {:optional true} [:maybe :boolean]]])

(defn- validate-notification-handler
  [notification-handler]
  (mu/validate-throw NotificationHandler notification-handler))

(t2/define-before-insert :model/NotificationHandler
  [instance]
  (cross-check-channel-type-and-template-type instance)
  (validate-notification-handler instance)
  instance)

(t2/define-before-update :model/NotificationHandler
  [instance]
  (validate-notification-handler instance)
  (when (some #{:channel_id :template_id :channel_type} (-> instance t2/changes keys))
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
           [:type (apply ms/enum-decode-keyword notification-recipient-types)]
           [:notification_handler_id {:optional true} ms/PositiveInt]]
   [:multi {:dispatch (comp keyword :type)}
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
;;                                     :model/NotificationCard                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private card-subscription-send-conditions
  #{:has_result
    :goal_above
    :goal_below})

(t2/deftransforms :model/NotificationCard
  {:send_condition (mi/transform-validator mi/transform-keyword (partial mi/assert-enum card-subscription-send-conditions))})

(def ^:private NotificationCard
  [:map
   [:card_id                         ms/PositiveInt]
   [:send_condition {:optional true} (apply ms/enum-decode-keyword card-subscription-send-conditions)]
   [:send_once      {:optional true} :boolean]])

(t2/define-before-insert :model/NotificationCard
  [instance]
  (merge {:send_condition :has_result
          :send_once      false}
         instance))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Public APIs                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(def FullyHydratedNotification
  "Fully hydrated notification."
  [:merge
   Notification
   [:map
    [:creator       {:optional true} [:maybe :map]]
    [:subscriptions {:optional true} [:sequential NotificationSubscription]]
    [:handlers      {:optional true} [:sequential [:merge
                                                   NotificationHandler
                                                   [:map
                                                    [:template   {:optional true} [:maybe :map]]
                                                    [:channel    {:optional true} [:maybe :map]]
                                                    [:recipients {:optional true} [:sequential NotificationRecipient]]]]]]]
   [:multi {:dispatch (comp keyword :payload_type)}
    [:notification/card [:map
                         [:payload NotificationCard]]]]])

(mu/defn hydrate-notification :- FullyHydratedNotification
  "Fully hydrate notifictitons."
  [notification-or-notifications]
  (t2/hydrate notification-or-notifications
              :creator
              :payload
              :subscriptions
              [:handlers :channel :template :recipients]))

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
    (let [payload-id      (case (:payload_type notification)
                            (:notification/system-event :notification/testing)
                            nil
                            :notification/card
                            (t2/insert-returning-pk! :model/NotificationCard (:payload notification)))
          notification    (-> notification
                              (assoc :payload_id payload-id)
                              (dissoc :payload))
          instance        (t2/insert-returning-instance! :model/Notification notification)
          notification-id (:id instance)]
      (when (seq subscriptions)
        (t2/insert! :model/NotificationSubscription (map #(assoc % :notification_id notification-id) subscriptions)))
      (doseq [handler handlers+recipients]
        (let [recipients (:recipients handler)
              handler    (-> handler
                             (dissoc :recipients)
                             (assoc :notification_id notification-id))
              handler-id (t2/insert-returning-pk! :model/NotificationHandler handler)]
          (t2/insert! :model/NotificationRecipient (map #(assoc % :notification_handler_id handler-id) recipients))))
      instance)))

(def ^:private notification-update-spec
  {:model        :model/Notification
   ;; a function that takes a row and returns a map of the columns to compare
   :compare-row  #(select-keys % [:active])
   :nested-specs {:payload       {:model        :model/NotificationCard
                                  :compare-row  #(select-keys % [:send_condition :send_once])}
                  :subscriptions {:model        :model/NotificationSubscription
                                  ;; the foreign key column in the nested model with respect to the parent model
                                  :fk-column    :notification_id
                                  :compare-row  #(select-keys % [:notification_id :type :event_name :cron_schedule])
                                  ;; whether this nested model is a sequentials with respect to the parent model
                                  :multi-row?   true}
                  :handlers      {:model        :model/NotificationHandler
                                  :fk-column    :notification_id
                                  :compare-row  #(select-keys % [:notification_id :channel_type :channel_id :template_id :active])
                                  :multi-row?   true
                                  :nested-specs {:recipients {:model       :model/NotificationRecipient
                                                              :fk-column   :notification_handler_id
                                                              :compare-row #(select-keys % [:notification_handler_id :type :user_id :permissions_group_id :details])
                                                              :multi-row?  true}}}}})

(defn update-notification!
  "Update an existing notification with `new-notification`."
  [existing-notification new-notification]
  (models.spec-update/do-update! existing-notification new-notification notification-update-spec))
