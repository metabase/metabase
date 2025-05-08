(ns metabase.notification.models
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.channel.models.channel :as models.channel]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.interface :as mi]
   [metabase.models.util.spec-update :as models.u.spec-update]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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

(t2/define-after-select :model/Notification
  [notification]
  (dissoc notification :internal_id))

(methodical/defmethod t2/batched-hydrate [:model/Notification :subscriptions]
  "Batch hydration NotificationSubscriptions for a list of Notifications."
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (t2/select :model/NotificationSubscription :notification_id [:in (map :id notifications)]))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :payload]
  "Batch hydration payloads for a list of Notifications."
  [_model k notifications]
  (let [payload-type->ids        (u/group-by :payload_type :payload_id
                                             conj #{}
                                             notifications)
        payload-type+id->payload (into {}
                                       (for [[payload-type payload-ids] payload-type->ids]
                                         (case payload-type
                                           :notification/card
                                           (let [notification-cards (t2/hydrate
                                                                     (t2/select :model/NotificationCard
                                                                                :id [:in payload-ids])
                                                                     :card)]
                                             (into {} (for [nc notification-cards]
                                                        [[:notification/card (:id nc)] nc])))
                                           {[payload-type nil] nil})))]

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

(mr/def ::Notification
  [:merge
   [:map
    [:payload_type (ms/enum-decode-keyword notification-types)]]
   [:multi {:dispatch (comp keyword :payload_type)}
    [:notification/system-event
     [:map
      [:payload_id {:optional true} nil?]]]
    [:notification/card
     [:map
      ;; optional during creation
      [:payload_id {:optional true} int?]
      [:creator_id {:optional true} int?]]]
    [:notification/testing :any]]])

(defn- validate-notification
  [notification]
  (mu/validate-throw ::Notification notification))

(t2/define-before-insert :model/Notification
  [instance]
  (validate-notification instance)
  instance)

(defn- update-subscription-trigger!
  [& args]
  (apply (requiring-resolve 'metabase.notification.task.send/update-subscription-trigger!) args))

(defn- delete-trigger-for-subscription!
  [& args]
  (apply (requiring-resolve 'metabase.notification.task.send/delete-trigger-for-subscription!) args))

(t2/define-before-update :model/Notification
  [instance]
  (validate-notification instance)
  (when-let [unallowed-key (some #{:payload_type :payload_id :creator_id} (keys (t2/changes instance)))]
    (throw (ex-info (format "Update %s is not allowed." (name unallowed-key))
                    {:status-code 400
                     :changes     (t2/changes instance)})))
  (when (contains? (t2/changes instance) :active)
    (let [subscriptions (t2/select :model/NotificationSubscription
                                   :notification_id (:id instance)
                                   :type :notification-subscription/cron)]
      (doseq [subscription subscriptions]
        (if (:active instance)
          (update-subscription-trigger! subscription)
          (delete-trigger-for-subscription! (:id subscription))))))
  instance)

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

(defmethod audit-log/model-details :model/Notification
  [{:keys [subscriptions handlers] :as fully-hydrated-notification} _event-type]
  (merge
   (select-keys fully-hydrated-notification [:id :payload_type :payload_id :creator_id :active])
   {:subscriptions (map #(dissoc % :id :created_at) subscriptions)
    :handlers      (map (fn [handler]
                          (merge (select-keys [:id :channel_type :channel_id :template_id :active]
                                              handler)
                                 {:recipients (map #(select-keys % [:id :type :user_id :permissions_group_id :details]) (:recipients handler))}))
                        handlers)}))

;; ------------------------------------------------------------------------------------------------;;
;;                               :model/NotificationSubscription                                   ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private subscription-types
  #{:notification-subscription/system-event
    :notification-subscription/cron})

(def ^:private subscription-ui-display-types
  #{:cron/raw
    :cron/builder
    nil})

(t2/deftransforms :model/NotificationSubscription
  {:type            (mi/transform-validator mi/transform-keyword (partial mi/assert-enum subscription-types))
   :event_name      (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "event"))
   :ui_display_type (mi/transform-validator mi/transform-keyword (partial mi/assert-enum subscription-ui-display-types))})

(mr/def ::NotificationSubscription
  "Schema for :model/NotificationSubscription."
  [:merge [:map
           [:type (ms/enum-decode-keyword subscription-types)]]

   [:multi {:dispatch (comp keyword :type)}
    [:notification-subscription/system-event
     [:map
      [:event_name                     [:or :keyword :string]]
      [:cron_schedule {:optional true} nil?]]]
    [:notification-subscription/cron
     [:map
      [:cron_schedule                    :string]
      [:event_name      {:optional true} nil?]
      ;; enum values can change depending on UI
      [:ui_display_type {:optional true} [:maybe (into [:enum] subscription-ui-display-types)]]]]]])

(defn- validate-subscription
  "Validate a NotificationSubscription."
  [subscription]
  (mu/validate-throw ::NotificationSubscription subscription))

(t2/define-before-insert :model/NotificationSubscription
  [instance]
  (validate-subscription instance)
  instance)

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

(methodical/defmethod t2/batched-hydrate [:default :channel]
  "Batch hydration Channels for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(when-let [channel-ids (seq (keep :channel_id notification-handlers))]
      (t2/select-fn->fn :id identity :model/Channel
                        :id [:in channel-ids]
                        :active true))
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:default :template]
  "Batch hydration ChannelTemplates for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(when-let [template-ids (seq (keep :template_id notification-handlers))]
      (t2/select-fn->fn :id identity :model/ChannelTemplate
                        :id [:in template-ids]))
   :template_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :recipients]
  "Batch hydration NotificationRecipients for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers
   k
   #(group-by :notification_handler_id
              (t2/select :model/NotificationRecipient
                         :notification_handler_id [:in (map :id notification-handlers)]))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :recipients-detail]
  "Batch hydration of details (user, group members) for NotificationRecipients"
  [_model _k recipients]
  (-> (group-by :type recipients)
      (m/update-existing :notification-recipient/user
                         (fn [recipients]
                           (t2/hydrate recipients :user)))
      (m/update-existing :notification-recipient/group
                         (fn [recipients]
                           (t2/hydrate recipients [:permissions_group :members])))
      vals
      flatten))

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

(mr/def ::NotificationHandler
  [:map
   ;; optional during insertion
   [:notification_id {:optional true}       ms/PositiveInt]
   [:channel_type    {:decode/json keyword} [:fn #(= "channel" (-> % keyword namespace))]]
   [:channel_id      {:optional true}       [:maybe ms/PositiveInt]]
   [:template_id     {:optional true}       [:maybe ms/PositiveInt]]
   [:active          {:optional true}       [:maybe :boolean]]])

(defn- validate-notification-handler
  [notification-handler]
  (mu/validate-throw ::NotificationHandler notification-handler))

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
    :notification-recipient/raw-value
    :notification-recipient/template})

(t2/deftransforms :model/NotificationRecipient
  {:type    (mi/transform-validator mi/transform-keyword (partial mi/assert-enum notification-recipient-types))
   :details mi/transform-json})

(mr/def ::NotificationRecipient
  "Schema for :model/NotificationRecipient."
  [:merge [:map
           [:type (ms/enum-decode-keyword notification-recipient-types)]
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
    [:notification-recipient/raw-value
     [:map
      [:details                               [:map {:closed true}
                                               [:value :any]]]
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
  (mu/validate-throw ::NotificationRecipient recipient))

(defenterprise validate-email-domains!
  "Check that whether `email-addresses` are allowed based on the value of the [[subscription-allowed-domains]] Setting, if set.
  This function no-ops if `subscription-allowed-domains` is unset or if we do not have a premium token with the `:email-allow-list` feature."
  metabase-enterprise.advanced-config.models.notification
  [_email-addresses]
  nil)

(t2/define-before-insert :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  instance)

(t2/define-before-update :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  (when (and (= :notification-recipient/raw-value (:type instance))
             (u/email? (get-in instance [:details :value])))
    (validate-email-domains! [(get-in instance [:details :value])]))
  instance)

;; ------------------------------------------------------------------------------------------------;;
;;                                     :model/NotificationCard                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(def card-subscription-send-conditions
  "Set of valid send conditions for NotificationCard."
  #{:has_result
    :goal_above
    :goal_below})

(t2/deftransforms :model/NotificationCard
  {:send_condition (mi/transform-validator mi/transform-keyword (partial mi/assert-enum card-subscription-send-conditions))})

(mr/def ::NotificationCard
  "Schema for :model/NotificationCard."
  [:map
   [:card_id                         ms/PositiveInt]
   [:card           {:optional true} [:maybe :map]]
   [:send_condition {:optional true} (ms/enum-decode-keyword card-subscription-send-conditions)]
   [:send_once      {:optional true} :boolean]])

(t2/define-before-insert :model/NotificationCard
  [instance]
  (merge {:send_condition :has_result
          :send_once      false}
         instance))

;; ------------------------------------------------------------------------------------------------;;
;;                                            Helpers                                              ;;
;; ------------------------------------------------------------------------------------------------;;

(defn validate-email-handlers!
  "Validate the domains of external emails for email handlers."
  [handlers]
  ;; validate email domain of all the external email recipients
  (some->> handlers
           (filter #(= :channel/email (:channel_type %)))
           (mapcat :recipients)
           (filter #(= :notification-recipient/raw-value (:type %)))
           (map #(get-in % [:details :value]))
           validate-email-domains!))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Permissions                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defn current-user-can-read-payload?
  "Check if the current user can read the payload of a notification."
  [notification]
  (case (:payload_type notification)
    :notification/card
    (mi/can-read? :model/Card (-> notification :payload :card_id))

    :notification/system-event
    (mi/superuser?)

    :notification/testing
    true))

(defn current-user-is-recipient?
  "Check if the current user is a recipient of a notification."
  [notification]
  (->> (:handlers (t2/hydrate notification [:handlers :recipients]))
       (mapcat :recipients)
       (map :user_id)
       distinct
       (some #{(mi/current-user-id)})
       boolean))

(defn current-user-is-creator?
  "Check if the current user is the creator of a notification."
  [notification]
  (= (:creator_id notification) (mi/current-user-id)))

(defmethod mi/can-read? :model/Notification
  ([notification]
   (or
    (mi/superuser?)
    (current-user-is-creator? notification)
    (current-user-is-recipient? notification)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Notification pk))))

(defmethod mi/can-create? :model/Notification
  [_ notification]
  (or (mi/superuser?)
      (and (current-user-can-read-payload? notification)
           ;; if advanced-permissions is enabled, we require users to have subscription permissions
           (or (not (premium-features/has-feature? :advanced-permissions))
               (perms/current-user-has-application-permissions? :subscription)))))

(defmethod mi/can-update? :model/Notification
  [instance _changes]
  (or
   (mi/superuser?)
   (and
    (current-user-is-creator? instance)
    ;; if advanced-permissions is enabled, we require users to have subscription permissions
    ;; and is the owner of the notification and can read the payload
    (or
     (not (premium-features/has-feature? :advanced-permissions))
     (perms/current-user-has-application-permissions? :subscription))
    (current-user-can-read-payload? instance))))

;; ------------------------------------------------------------------------------------------------;;
;;                                         Public APIs                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(mr/def ::FullyHydratedNotification
  "Fully hydrated notification."
  [:merge
   ::Notification
   [:map
    [:creator       {:optional true} [:maybe :map]]
    [:subscriptions {:optional true} [:sequential ::NotificationSubscription]]
    [:handlers      {:optional true} [:sequential [:merge
                                                   ::NotificationHandler
                                                   [:map
                                                    [:template   {:optional true} [:maybe ::models.channel/ChannelTemplate]]
                                                    [:channel    {:optional true} [:maybe ::models.channel/Channel]]
                                                    [:recipients {:optional true} [:sequential ::NotificationRecipient]]]]]]]
   [:multi {:dispatch (comp keyword :payload_type)}
    [:notification/card [:map
                         [:payload ::NotificationCard]]]
    [::mc/default       :any]]])

(mu/defn hydrate-notification :- [:or ::FullyHydratedNotification [:sequential ::FullyHydratedNotification]]
  "Fully hydrate notifictitons."
  [notification-or-notifications]
  (t2/hydrate notification-or-notifications
              :creator
              :payload
              :subscriptions
              [:handlers :channel :template [:recipients :recipients-detail]]))

(mu/defn notifications-for-card :- [:sequential ::FullyHydratedNotification]
  "Find all active card notifications for a given card-id."
  [card-id :- pos-int?]
  (hydrate-notification (t2/select :model/Notification
                                   :active true
                                   :payload_type :notification/card
                                   :payload_id [:in {:select [:id]
                                                     :from   [:notification_card]
                                                     :where  [:= :card_id card-id]}])))

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
  (validate-email-handlers! handlers+recipients)
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

(models.u.spec-update/define-spec notification-update-spec
  "Spec for updating a notification."
  {:model        :model/Notification
   :compare-cols [:active]
   :extra-cols   [:payload_type :internal_id :payload_id]
   :nested-specs {:payload       {:model        :model/NotificationCard
                                  :compare-cols [:send_condition :send_once]
                                  :extra-cols   [:card_id]}
                  :subscriptions {:model        :model/NotificationSubscription
                                  :fk-column    :notification_id
                                  :compare-cols [:notification_id :type :event_name :cron_schedule :ui_display_type]
                                  :multi-row?   true}
                  :handlers      {:model        :model/NotificationHandler
                                  :fk-column    :notification_id
                                  :compare-cols [:notification_id :channel_type :channel_id :template_id :active]
                                  :multi-row?   true
                                  :nested-specs {:recipients {:model        :model/NotificationRecipient
                                                              :fk-column    :notification_handler_id
                                                              :compare-cols [:notification_handler_id :type :user_id :permissions_group_id :details]
                                                              :multi-row?   true}}}}})

(defn update-notification!
  "Update an existing notification with `new-notification`."
  [existing-notification new-notification]
  (validate-email-handlers! (:handlers new-notification))
  (models.u.spec-update/do-update! existing-notification new-notification notification-update-spec))

(defn unsubscribe-user!
  "Unsubscribe a user from a notification."
  [notification-id user-id]
  (t2/delete! :model/NotificationRecipient
              :user_id user-id
              :notification_handler_id [:in {:select [:id]
                                             :from   [:notification_handler]
                                             :where  [:= :notification_id notification-id]}]))
