(ns metabase.notification.models
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [malli.core :as mc]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.core :as change-log]
   [metabase.channel.models.channel :as models.channel]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.notification.db :as notification.db]
   [metabase.notification.schema :as notification.schema]
   [metabase.notification.task.send-trigger :as notification.task.send-trigger]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [tru]]
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
    (derive :hook/worktree-id)
    (derive (if (= model :model/NotificationSubscription)
              :hook/created-at-timestamped?
              :hook/timestamped?))))

;; ------------------------------------------------------------------------------------------------;;
;;                                       :model/Notification                                       ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private RowTimestamp
  "A `created_at`/`updated_at` column: a `java.time` value on the way out, and -- because clients echo the
  notification they were handed back at us on update -- the ISO string it was encoded as on the way back in."
  [:maybe [:or ms/TemporalInstant ms/TemporalString]])

(mr/def ::EchoedUser
  "A hydrated User as a client hands it back on update: a `::users.schema/user` whose timestamps may be the ISO strings
  they were encoded as on the way out."
  [:merge
   ::users.schema/user
   [:map {:closed true}
    [:date_joined {:optional true} RowTimestamp]
    [:last_login  {:optional true} RowTimestamp]]])

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

(defn- notification-entries
  "Entries every notification map has, whatever its `:payload_type`."
  [{:keys [with-id?]}]
  (cond->> [[:payload_type                  (ms/enum-decode-keyword notification-types)]
            [:active       {:optional true} [:maybe :boolean]]
            [:internal_id  {:optional true} [:maybe :string]]
            [:creator_id   {:optional true} [:maybe ms/PositiveInt]]
            [:created_at   {:optional true} RowTimestamp]
            [:updated_at   {:optional true} RowTimestamp]]
    with-id? (into [[:id {:optional true} ms/PositiveInt]])))

(mr/def ::Notification
  [:merge
   (into [:map {:closed true}] (notification-entries {:with-id? true}))
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :payload_type)}
    [:notification/system-event
     [:map [:payload_id {:optional true} nil?]]]
    [:notification/card
     ;; both optional during creation
     [:map
      [:payload_id {:optional true} int?]
      [:creator_id {:optional true} int?]]]
    [:notification/testing :any]]])

(defn- validate-notification
  [notification]
  (mu/validate-throw ::Notification notification))

;;; ---------------------------------------------- Hooks ----------------------------------------------

(t2/define-before-insert :model/Notification
  [instance]
  (validate-notification instance)
  instance)

(t2/define-before-update :model/Notification
  [instance]
  (validate-notification instance)
  (let [changes (t2/changes instance)]
    (when-let [unallowed-key (some #{:payload_type :payload_id} (keys changes))]
      (throw (ex-info (format "Update %s is not allowed." (name unallowed-key))
                      {:status-code 400
                       :changes     changes}))))
  instance)

;;; ---------------------------------------------- Permissions ----------------------------------------------

(defn- payload-readable-fn
  "A function of a notification, whether the current user can read its payload, with the Cards of the payloads of
  `notifications` read together."
  [notifications]
  (let [card-ids       (into #{}
                             (comp (filter #(= :notification/card (:payload_type %)))
                                   (keep #(-> % :payload :card_id)))
                             notifications)
        readable-cards (into #{} (map :id) (when (seq card-ids) (mi/readable (notification.db/cards card-ids))))]
    (fn [notification]
      (case (:payload_type notification)
        :notification/card
        (contains? readable-cards (-> notification :payload :card_id))

        :notification/system-event
        (mi/superuser?)

        :notification/testing
        true))))

(defn current-user-can-read-payload?
  "Check if the current user can read the payload of a notification."
  [notification]
  (boolean ((payload-readable-fn [notification]) notification)))

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

(methodical/defmethod t2/batched-hydrate [:model/Notification :can_read]
  "Whether the current user reads each of `notifications`: a superuser, the creator or a recipient, the recipients
  answered together."
  [_model _k notifications]
  (let [rows          (remove nil? notifications)
        candidates    (when-not (mi/superuser?) (remove current-user-is-creator? rows))
        recipient-ids (into #{}
                            (comp (filter (fn [notification]
                                            (some #(some #{(mi/current-user-id)} (map :user_id (:recipients %)))
                                                  (:handlers notification))))
                                  (map :id))
                            (when (seq candidates) (t2/hydrate (vec candidates) [:handlers :recipients])))]
    (for [notification notifications]
      (when notification
        (vary-meta notification assoc :can_read
                   (boolean (or (mi/superuser?)
                                (current-user-is-creator? notification)
                                (contains? recipient-ids (:id notification)))))))))

(defmethod mi/can-create? :model/Notification
  [_ notification]
  (or (mi/superuser?)
      (and (current-user-can-read-payload? notification)
           ;; if advanced-permissions is enabled, we require users to have subscription permissions.
           (or (not (premium-features/enable-advanced-permissions?))
               (perms/current-user-has-application-permissions? :subscription)))))

(defmethod mi/can-update? :model/Notification
  [instance changes]
  (mi/can-update-all? :model/Notification [instance] changes))

(defmethod mi/can-update-all? :model/Notification
  [_model notifications changes]
  (let [allowed?  (fn [instance]
                    (and (or (not (contains? changes :creator_id))
                             (= (:creator_id changes) (:creator_id instance))
                             (mi/superuser?))
                         (mi/can-write? instance)))
        readable? (payload-readable-fn (when-not (mi/superuser?)
                                         (into [] (comp (filter allowed?) (map #(merge % changes))) notifications)))]
    (every? #(and (allowed? %)
                  (or (mi/superuser?) (readable? (merge % changes))))
            notifications)))

(methodical/defmethod t2/batched-hydrate [:model/Notification :can_write]
  "Whether the current user writes each of `notifications`: a superuser, or the creator with subscription permissions
  who can read the payload, as [[mi/can-update?]] asks, the payloads answered together."
  [_model _k notifications]
  (let [rows          (remove nil? notifications)
        candidates    (when-not (mi/superuser?) (filter current-user-is-creator? rows))
        subscription? (or (empty? candidates)
                          (not (premium-features/enable-advanced-permissions?))
                          (perms/current-user-has-application-permissions? :subscription))
        readable?     (payload-readable-fn (when subscription? candidates))]
    (for [notification notifications]
      (when notification
        (assoc notification :can_write
               (boolean (or (mi/superuser?)
                            (and (current-user-is-creator? notification)
                                 subscription?
                                 (readable? notification)))))))))

;;; ---------------------------------------------- Hydration ----------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Notification :subscriptions]
  "Batch hydration NotificationSubscriptions for a list of Notifications."
  [_model k notifications]
  (mi/instances-with-hydrated-data
   notifications k
   #(group-by :notification_id
              (notification.db/subscriptions-for-notifications (map :id notifications)))
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
                                           (let [notification-cards (t2/hydrate (notification.db/notification-cards payload-ids) :card)]
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
              (notification.db/handlers-for-notifications (map :id notifications)))
   :id
   {:default []}))

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

(defn- notification-subscription-schema
  [{:keys [with-id?]}]
  [:merge
   (into [:map {:closed true}]
         (cond->> [[:type                             (ms/enum-decode-keyword subscription-types)]
                   [:notification_id {:optional true} ms/PositiveInt]
                   [:ui_display_type {:optional true} [:maybe [:or :keyword :string]]]
                   [:created_at      {:optional true} RowTimestamp]]
           with-id? (into [[:id {:optional true} :int]])))
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :type)}
    [:notification-subscription/system-event
     [:map
      [:event_name                     [:or :keyword :string]]
      [:cron_schedule {:optional true} nil?]]]
    [:notification-subscription/cron
     [:map
      [:cron_schedule                    ::u.cron/CronScheduleString]
      [:event_name      {:optional true} nil?]
      ;; enum values can change depending on UI
      [:ui_display_type {:optional true} [:maybe (into [:enum] subscription-ui-display-types)]]]]]])

(mr/def ::NotificationSubscription
  "Schema for :model/NotificationSubscription."
  (notification-subscription-schema {:with-id? true}))

(mr/def ::CreateNotificationSubscriptionParams
  "Schema for :model/NotificationSubscription on a create request."
  (notification-subscription-schema {:with-id? false}))

(defn- validate-subscription
  "Validate a NotificationSubscription."
  [subscription]
  (mu/validate-throw ::NotificationSubscription subscription))

(t2/define-before-insert :model/NotificationSubscription
  [instance]
  (validate-subscription instance)
  instance)

(t2/define-before-update :model/NotificationSubscription
  [instance]
  (validate-subscription instance)
  instance)

;; ------------------------------------------------------------------------------------------------;;
;;                                  :model/NotificationHandler                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(t2/deftransforms :model/NotificationHandler
  {:channel_type (mi/transform-validator mi/transform-keyword (partial mi/assert-namespaced "channel"))})

(defn- notification-handler-schema
  [{:keys [with-id?]}]
  (into [:map {:closed true}]
        (cond->> [;; optional during insertion
                  [:notification_id {:optional true}       ms/PositiveInt]
                  [:channel_type    {:decode/json keyword} [:fn {:json-schema {:type "string"}} #(= "channel" (-> % keyword namespace))]]
                  [:channel_id      {:optional true}       [:maybe ms/PositiveInt]]
                  [:template_id     {:optional true}       [:maybe ms/PositiveInt]]
                  [:active          {:optional true}       [:maybe :boolean]]
                  [:created_at      {:optional true}       RowTimestamp]
                  [:updated_at      {:optional true}       RowTimestamp]]
          with-id? (into [[:id {:optional true} ms/PositiveInt]]))))

(mr/def ::NotificationHandler
  (notification-handler-schema {:with-id? true}))

(mr/def ::CreateNotificationHandlerParams
  "Schema for :model/NotificationHandler on a create request."
  (notification-handler-schema {:with-id? false}))

(defn- validate-notification-handler
  [notification-handler]
  (mu/validate-throw ::NotificationHandler notification-handler))

(t2/define-before-insert :model/NotificationHandler
  [instance]
  (validate-notification-handler instance)
  instance)

(t2/define-before-update :model/NotificationHandler
  [instance]
  (validate-notification-handler instance)
  instance)

;;; ---------------------------------------------- Hydration ----------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :channel]
  "Batch hydration Channels for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(when-let [channel-ids (seq (keep :channel_id notification-handlers))]
      (notification.db/active-channels-by-id channel-ids))
   :channel_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:default :template]
  "Batch hydration ChannelTemplates for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers k
   #(when-let [template-ids (seq (keep :template_id notification-handlers))]
      (notification.db/channel-templates-by-id template-ids))
   :template_id
   {:default nil}))

(methodical/defmethod t2/batched-hydrate [:model/NotificationHandler :recipients]
  "Batch hydration NotificationRecipients for a list of NotificationHandlers"
  [_model k notification-handlers]
  (mi/instances-with-hydrated-data
   notification-handlers
   k
   #(group-by :notification_handler_id
              (notification.db/recipients-for-handlers (map :id notification-handlers)))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :recipients-detail]
  "Batch hydration of details (user, group members) for NotificationRecipients.
  Only active users are attached as :user; deactivated users get :user nil so they
  don't receive notifications (GDGT-1927)."
  [_model _k recipients]
  (-> (group-by :type recipients)
      (m/update-existing :notification-recipient/user
                         (fn [recipients]
                           (let [id->user (when (seq recipients)
                                            (notification.db/active-users-by-id (map :user_id recipients)))]
                             (mapv #(assoc % :user (id->user (:user_id %))) recipients))))
      (m/update-existing :notification-recipient/group
                         (fn [recipients]
                           (t2/hydrate recipients [:permissions_group :members])))
      vals
      flatten))

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
   :details (mi/transform-encrypted-json "notification_recipient.details")})

(defn- notification-recipient-schema
  [{:keys [with-id?]}]
  [:merge
   (into [:map {:closed true}]
         (cond->> [[:type                                    (ms/enum-decode-keyword notification-recipient-types)]
                   [:notification_handler_id {:optional true} ms/PositiveInt]
                   [:created_at              {:optional true} RowTimestamp]
                   [:updated_at              {:optional true} RowTimestamp]]
           with-id? (into [[:id {:optional true} ms/PositiveInt]])))
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :type)}
    [:notification-recipient/user
     [:map
      [:user_id                               ms/PositiveInt]
      [:permissions_group_id {:optional true} :nil]
      [:details              {:optional true} [:fn {:json-schema {:anyOf [{:type "null"} {:type "object" :maxProperties 0}]}} empty?]]
      [:user                 {:optional true} [:maybe ::EchoedUser]]]]
    [:notification-recipient/group
     [:map
      [:permissions_group_id                  ms/PositiveInt]
      [:user_id              {:optional true} :nil]
      [:details              {:optional true} [:fn {:json-schema {:anyOf [{:type "null"} {:type "object" :maxProperties 0}]}} empty?]]
      [:permissions_group    {:optional true} [:maybe [:merge
                                                       ::permissions.schema/permissions-group
                                                       [:map {:closed true}
                                                        [:members {:optional true} [:sequential ::permissions.schema/permissions-group.member]]]]]]]]
    [:notification-recipient/raw-value
     [:map
      [:details                               [:map {:closed true}
                                               [:value :string]
                                               [:channel_id {:optional true} [:maybe :string]]]]
      [:user_id              {:optional true} :nil]
      [:permissions_group_id {:optional true} :nil]]]
    [:notification-recipient/template
     [:map
      [:details                               [:map {:closed true}
                                               [:pattern                      :string]
                                               [:is_optional {:optional true} :boolean]]]
      [:user_id              {:optional true} :nil]
      [:permissions_group_id {:optional true} :nil]]]]])

(mr/def ::NotificationRecipient
  "Schema for :model/NotificationRecipient."
  (notification-recipient-schema {:with-id? true}))

(mr/def ::CreateNotificationRecipientParams
  "Schema for :model/NotificationRecipient on a create request."
  (notification-recipient-schema {:with-id? false}))

(defn- check-valid-recipient
  [recipient]
  (mu/validate-throw ::NotificationRecipient recipient))

(defenterprise validate-email-domains!
  "Check that whether `email-addresses` are allowed based on the value of the [[subscription-allowed-domains]] Setting,
  if set. This function no-ops if `subscription-allowed-domains` is unset or if we do not have a premium token with the
  `:email-allow-list` feature." metabase-enterprise.advanced-config.models.notification
  [_email-addresses]
  nil)

(defn- validate-raw-value-email-domain!
  "Enforce the `subscription-allowed-domains` allow-list on any write of a raw-value email recipient. Must run on both
  insert and update so no write path (e.g. the unauthenticated unsubscribe-undo endpoint) can skip it."
  [instance]
  (when (and (= :notification-recipient/raw-value (:type instance))
             (u/email? (get-in instance [:details :value])))
    (validate-email-domains! [(get-in instance [:details :value])])))

(t2/define-before-insert :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  (validate-raw-value-email-domain! instance)
  instance)

(t2/define-before-update :model/NotificationRecipient
  [instance]
  (check-valid-recipient instance)
  (validate-raw-value-email-domain! instance)
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

(def ^:private notification-card-entries
  [[:card_id                          ms/PositiveInt]
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   ;; the hydrated Card, echoed back by clients on update; nothing here reads it
   [:card            {:optional true} [:maybe [:merge
                                               ::queries.schema/card
                                               [:map {:closed true}
                                                [:id                     ms/PositiveInt]
                                                ;; a metric's Card row describes its query on the way out of the database
                                                [:query_description      {:optional true} [:maybe :string]]
                                                [:created_at             {:optional true} RowTimestamp]
                                                [:updated_at             {:optional true} RowTimestamp]
                                                [:last_used_at           {:optional true} RowTimestamp]
                                                [:cache_invalidated_at   {:optional true} RowTimestamp]
                                                [:initially_published_at {:optional true} RowTimestamp]]]]]
   [:send_condition  {:optional true} (ms/enum-decode-keyword card-subscription-send-conditions)]
   [:send_once       {:optional true} :boolean]
   [:disable_links   {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} RowTimestamp]
   [:updated_at      {:optional true} RowTimestamp]])

(defn- notification-card-schema
  [{:keys [with-id?]}]
  (into [:map {:closed true}]
        (cond->> notification-card-entries
          ;; nil on an unsaved notification, e.g. the one POST /api/pulse/test builds to send a test alert
          with-id? (into [[:id {:optional true} [:maybe ms/PositiveInt]]]))))

(mr/def ::NotificationCard
  "Schema for :model/NotificationCard."
  (notification-card-schema {:with-id? true}))

(mr/def ::CreateNotificationCardParams
  "Schema for :model/NotificationCard on a create request."
  (notification-card-schema {:with-id? false}))

(t2/define-before-insert :model/NotificationCard
  [instance]
  (merge {:send_condition :has_result
          :send_once      false}
         instance))

;; ------------------------------------------------------------------------------------------------;;
;;                                          Update Spec                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(def ^:private update-columns
  "The keys of a Notification that an update of it uses."
  #{:active :creator_id :payload_type :internal_id :payload_id :payload :subscriptions :handlers})

(def ^:private card-update-columns
  "The columns of the NotificationCard payload that an update writes."
  [:send_condition :send_once :card_id])

(def ^:private subscription-columns
  "The columns of a NotificationSubscription that an update writes."
  [:notification_id :type :event_name :cron_schedule :ui_display_type])

(def ^:private handler-columns
  "The columns of a NotificationHandler that an update writes."
  [:notification_id :channel_type :channel_id :template_id :active])

(def ^:private recipient-columns
  "The columns of a NotificationRecipient that an update writes."
  [:notification_handler_id :type :user_id :permissions_group_id :details])

(def ^:private template-columns
  "The columns of a ChannelTemplate that an update writes."
  [:channel_type :name :details])

(defn- update-input-entries
  "Entries from `entries` whose key an update of a Notification uses."
  [entries]
  (filterv (comp update-columns first) entries))

(mr/def ::NotificationCardUpdate
  "::NotificationCard restricted to what the update writes - `:id` comes from the URL's notification."
  (into [:map {:closed true}]
        (filterv (comp (set card-update-columns) first) notification-card-entries)))

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
;;                                         Public APIs                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(mr/def ::event-topic
  "One of the event topics a `:notification/system-event` notification can be triggered for."
  [:enum
   :event/user-invited
   :event/notification-create
   :event/slack-token-invalid
   :event/comment-created
   :event/support-access-grant-created
   :event/transform-failed
   :event/transform-failure-digest
   :event/security-advisory-match])

(mr/def ::event-info.user-invited
  "The `:event_info` of an `:event/user-invited` system event: the invited User instance, plus the extra keys
  `create-and-invite-user!` stamps on it. `:object` is typed by instance, not by shape, since the extra keys are
  `assoc`ed onto the real Toucan row rather than replacing it."
  [:map {:closed true}
   [:object  [:merge
              ::users.schema/user
              [:map {:closed true}
               [:is_from_setup {:optional true} [:maybe :boolean]]
               [:invite_method {:optional true} [:maybe :string]]
               [:invite_target {:optional true} [:maybe users.schema/InviteTarget]]
               [:sso_source    {:optional true} [:maybe [:or :keyword :string]]]]]]
   [:details {:optional true}
    [:map {:closed true}
     [:invitor [:map {:closed true}
                [:email                       ms/Email]
                [:first_name {:optional true} [:maybe :string]]]]]]])

(mr/def ::event-info.security-advisory-match
  "The `:event_info` of an `:event/security-advisory-match` system event."
  [:map {:closed true}
   [:object [:map {:closed true}
             [:advisory_id       [:string {:min 1}]]
             [:severity          [:or :keyword :string]]
             [:title             :string]
             [:description       :string]
             [:match_status      [:or :keyword :string]]
             [:advisory_url      [:maybe :string]]
             [:remediation       :string]
             [:affected_versions [:sequential [:map {:closed true}
                                               [:min   [:re #"^\d+(?:\.\d+)*$"]]
                                               [:fixed [:re #"^\d+(?:\.\d+)*$"]]]]]]]])

(mr/def ::event-info.notification-create
  "The `:event_info` of an `:event/notification-create` system event."
  [:map {:closed true}
   [:object  [:ref ::FullyHydratedNotification]]
   [:user-id [:maybe ms/PositiveInt]]])

(mr/def ::event-info.comment-created
  "The `:event_info` of an `:event/comment-created` system event."
  [:map {:closed true}
   [:entity_type    :string]
   [:entity_title   [:maybe :string]]
   [:comment_href   :string]
   [:entity_href    :string]
   [:created_at     [:maybe ms/TemporalInstant]]
   [:author         [:maybe :string]]
   [:comment        [:maybe :string]]
   [:parent_author  [:maybe :string]]
   [:parent_comment [:maybe :string]]
   [:style          [:map {:closed true}
                     [:color_text_dark   :string]
                     [:color_text_light  :string]
                     [:color_text_medium :string]]]
   [:email          ms/Email]])

(mr/def ::event-info.support-access-grant-created
  "The `:event_info` of an `:event/support-access-grant-created` system event."
  [:map {:closed true}
   [:support_email      [:maybe ms/Email]]
   [:ticket_number      [:maybe :string]]
   [:duration_minutes   :int]
   [:grant_end_time     ms/TemporalInstant]
   [:password_reset_url :string]
   [:notes              [:maybe :string]]])

(mr/def ::event-info.transform-failed
  "The `:event_info` of an `:event/transform-failed` system event."
  [:map {:closed true}
   [:email         ms/Email]
   [:job_name      [:maybe :string]]
   [:job_href      :string]
   [:failure_count :int]
   [:skipped_count :int]
   [:failures      [:sequential [:map {:closed true}
                                 [:transform_name [:maybe :string]]
                                 [:transform_href :string]
                                 [:message        [:map {:closed true}
                                                   [:first_line :string]
                                                   [:details    [:sequential :string]]]]]]]])

(mr/def ::event-info.transform-failure-digest
  "The `:event_info` of an `:event/transform-failure-digest` system event."
  [:map {:closed true}
   [:job_count     :int]
   [:failure_count :int]
   [:jobs          [:sequential [:map {:closed true}
                                 [:job_name      [:maybe :string]]
                                 [:job_href      :string]
                                 [:failure_count :int]
                                 [:first_failed  [:maybe :string]]
                                 [:latest_error  [:maybe :string]]]]]])

(def event-topic->event-info-schema
  "The `:event_info` schema published for each supported system event topic (a literal keyword, not a `require`,
  to avoid a dependency cycle with the module that publishes each event)."
  {:event/user-invited                 ::event-info.user-invited
   :event/notification-create          ::event-info.notification-create
   :event/slack-token-invalid          [:map {:closed true}]
   :event/comment-created              ::event-info.comment-created
   :event/support-access-grant-created ::event-info.support-access-grant-created
   :event/transform-failed             ::event-info.transform-failed
   :event/transform-failure-digest     ::event-info.transform-failure-digest
   :event/security-advisory-match      ::event-info.security-advisory-match})

(mr/def ::SystemEventPayload.request
  "The `:payload` of a system event notification as a client may send it: the event topic, plus the `:disable_links`
  `POST /api/notification` stamps on. The event map itself is the server's to supply, so a request carries none."
  [:map {:closed true}
   [:event_topic   {:optional true} ::event-topic]
   [:disable_links {:optional true} [:maybe :boolean]]])

(mr/def ::SystemEventPayload
  "The `:payload` of a system event notification on its way to being sent: the event topic, plus the `:disable_links`
  `POST /api/notification` stamps on, plus the event map published under the topic, keyed the way
  [[metabase.events.core/publish-event!]] was handed it. A `:notification/testing` notification's payload is empty."
  (into [:multi {:dispatch :event_topic}]
        (concat
         (for [[topic info-schema] event-topic->event-info-schema]
           [topic [:map {:closed true}
                   [:event_topic   [:= topic]]
                   [:disable_links {:optional true} [:maybe :boolean]]
                   [:event_info    {:optional true} [:maybe info-schema]]]])
         [[::mc/default
           [:map {:closed true}
            [:event_topic   [:fn {:json-schema {:type "string"}} #(= "event" (-> % keyword namespace))]]
            [:disable_links {:optional true} [:maybe :boolean]]
            [:event_info    {:optional true} [:maybe [:map {:closed true}]]]]]])))

(defn hydrated-notification-schema
  "Schema for a notification hydrated with its creator, subscriptions and handlers, where each handler matches
  `handler-schema`. Callers supply the handler schema because API input accepts a narrower set of templates than what
  we hand back out. `:update-input? true` keeps only the entries an update uses."
  ([handler-schema]
   (hydrated-notification-schema handler-schema {:with-id? true}))
  ([handler-schema {:keys [with-id? update-input?] :as opts}]
   (let [entries (into (notification-entries opts)
                       (cond->> [[:subscriptions {:optional true} [:sequential [:ref (if with-id?
                                                                                       ::NotificationSubscription
                                                                                       ::CreateNotificationSubscriptionParams)]]]
                                 [:handlers      {:optional true} [:sequential handler-schema]]]
                         with-id? (into [;; the hydrated User a saved notification is read with. Create and send
                                         ;; requests don't declare it, so the API drops a client-sent copy.
                                         [:creator                 {:optional true} [:maybe ::EchoedUser]]
                                         [:payload_id              {:optional true} [:maybe int?]]
                                         [:triggering_subscription {:optional true} [:maybe ::NotificationSubscription]]])))
         entries (cond-> entries
                   update-input? update-input-entries)]
     [:merge
      (into [:map {:closed true}] entries)
      [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
               :dispatch         (comp keyword :payload_type)}
       [:notification/card [:map {:closed true}
                            [:payload [:ref (cond
                                              update-input? ::NotificationCardUpdate
                                              with-id?      ::NotificationCard
                                              :else         ::CreateNotificationCardParams)]]]]
       [::mc/default       [:map {:closed true}
                            [:payload {:optional true} [:maybe (if (or update-input? (not with-id?))
                                                                 ::SystemEventPayload.request
                                                                 ::SystemEventPayload)]]]]]])))

(mr/def ::FullyHydratedNotification
  "Fully hydrated notification."
  (hydrated-notification-schema
   [:merge
    ::NotificationHandler
    [:map
     [:template        {:optional true} [:maybe ::models.channel/ChannelTemplate]]
     [:channel         {:optional true} [:maybe ::models.channel/Channel]]
     [:recipients      {:optional true} [:sequential ::NotificationRecipient]]
     [:attachment_only {:optional true} [:maybe :boolean]]
     [:include_pdf     {:optional true} [:maybe :boolean]]]]))

(def ^:private NotificationWithInlinePayload
  "A Notification row as `send-notification!` is handed it before hydration: with the system event `:payload`
  `metabase.notification.events.notification` assocs on, or the `:triggering_subscription`
  `metabase.notification.task.send` assocs on."
  (mut/merge ::notification.schema/notification
             [:map {:closed true}
              [:payload                 {:optional true} [:maybe ::SystemEventPayload]]
              [:triggering_subscription {:optional true} [:maybe ::notification.schema/notification-subscription]]]))

(def ^:private NotificationWithRawHandlers
  "An unsaved Notification as `POST /api/notification/send` hands it to `send-notification!`: no id or timestamps of
  its own, but the raw (pre-hydration) `:handlers` and `:subscriptions` straight off the request body."
  (hydrated-notification-schema
   [:merge
    ::CreateNotificationHandlerParams
    [:map {:closed true}
     [:template   {:optional true} [:maybe ::models.channel/ChannelTemplateUserProvided]]
     [:channel    {:optional true} [:maybe ::models.channel/Channel]]
     [:recipients {:optional true} [:sequential ::CreateNotificationRecipientParams]]]]
   {:with-id? false}))

(mu/defn hydrate-notification :- [:or ::FullyHydratedNotification [:sequential ::FullyHydratedNotification]]
  "Fully hydrate notifictitons."
  [notification-or-notifications :- [:or NotificationWithInlinePayload
                                     NotificationWithRawHandlers
                                     [:ref ::FullyHydratedNotification]
                                     [:sequential ::notification.schema/notification]]]
  (t2/hydrate notification-or-notifications :creator :payload :subscriptions [:handlers :channel :template [:recipients :recipients-detail]]))

(mu/defn notifications-for-cards :- [:map-of ::lib.schema.id/card [:sequential ::FullyHydratedNotification]]
  "The active card notifications of the Cards with `card-ids`, fully hydrated, by the id of their Card."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (let [notifications (when (seq card-ids)
                        (notification.db/active-card-notifications-for-cards card-ids))]
    (if (seq notifications)
      (group-by (comp :card_id :payload) (hydrate-notification notifications))
      {})))

(defn notifications-for-event
  "Find all active notifications for a given event."
  [event-name]
  (notification.db/active-system-event-notifications (u/qualified-name event-name)))

;;; ---------------------------------------------- Writes ----------------------------------------------

(defn- throw-template-mismatch!
  "Throws the 400 for a handler of `channel-type` that has a template of `template-type`."
  [channel-type template-type]
  (throw (ex-info "Channel type and template type mismatch"
                  {:status-code   400
                   :channel-type  channel-type
                   :template-type template-type})))

(defn- check-handler-templates
  "Throw a 400 unless every one of `handlers`, rows with their `:template_id` and `:channel_type`, satisfies this rule:

  - its channel type matches the type of its ChannelTemplate"
  [handlers]
  (when-let [template-ids (not-empty (into #{} (keep :template_id) handlers))]
    (let [template-types (update-vals (notification.db/channel-templates-by-id (vec template-ids)) :channel_type)]
      (doseq [{:keys [template_id channel_type]} handlers
              :when template_id
              :let  [channel-type  (keyword channel_type)
                     template-type (some-> (get template-types template_id) keyword)]]
        (when (not= channel-type template-type)
          (throw-template-mismatch! channel-type template-type))))))

(defn- update-subscription-triggers!
  "Add, move or remove the Quartz trigger of each of the NotificationSubscriptions `subscriptions` of a Notification
  that is `active?`: inactive Notifications have none."
  [active? subscriptions]
  (doseq [subscription (filter #(= :notification-subscription/cron (:type %)) subscriptions)]
    (if active?
      (notification.task.send-trigger/update-subscription-trigger! subscription)
      (notification.task.send-trigger/delete-trigger-for-subscription! (:id subscription)))))

(mu/defn- create-notification-subscriptions! :- [:sequential ::notification.schema/notification-subscription]
  "Insert the NotificationSubscription `rows` and add the Quartz triggers of the cron ones, and return the inserted
  subscriptions."
  [rows :- [:sequential ::notification.schema/notification-subscription.create]]
  (if (seq rows)
    (let [subscriptions (notification.db/insert-subscriptions! rows)]
      (doseq [subscription subscriptions]
        (notification.task.send-trigger/update-subscription-trigger! subscription))
      subscriptions)
    []))

(mu/defn- create-notification-handlers! :- [:sequential ::notification.schema/notification-handler]
  "Insert the NotificationHandler `rows`, which must have the channel type of their templates, and return the inserted
  instances in the order of the rows."
  [rows :- [:sequential ::notification.schema/notification-handler.create]]
  (if (seq rows)
    (do
      (check-handler-templates rows)
      (notification.db/insert-handlers! rows))
    []))

(mu/defn create-notification-recipients! :- :nil
  "Insert the NotificationRecipient `rows`, publishing no event as a recipient joining is upkeep, not a change of its
  Notification."
  [rows :- [:sequential ::notification.schema/notification-recipient.create]]
  (when (seq rows)
    (notification.db/insert-recipients! rows))
  nil)

(defn- check-template-maps
  "Throws a 400 unless the inline `:template` of each of `handlers` is a map."
  [handlers]
  (doseq [{:keys [template]} handlers]
    (when (and template (not (map? template)))
      (throw (ex-info "Channel template must be a map" {:status-code 400})))))

(defn- check-new-notifications
  "Throws what inserting the Notifications of `rows` with their parts would throw for the first of them that is invalid,
  checking the parts of each in the order they are inserted: the Notification, its subscriptions, the templates of its
  handlers, its handlers, and their recipients."
  [rows]
  (let [template-ids   (into [] (comp (mapcat :handlers) (remove :template) (keep :template_id) (distinct)) rows)
        template-types (if (seq template-ids)
                         (update-vals (notification.db/channel-templates-by-id template-ids) :channel_type)
                         {})]
    (doseq [{:keys [subscriptions handlers] :as row} rows]
      (validate-notification (-> row
                                 (dissoc :subscriptions :handlers :payload)
                                 (assoc :payload_id (when (= :notification/card (:payload_type row)) 1))))
      (run! #(validate-subscription (assoc % :notification_id 1)) subscriptions)
      (models.channel/check-channel-templates (into [] (keep :template) handlers))
      (doseq [{:keys [template template_id channel_type]} handlers
              :when (or template template_id)
              :let  [channel-type  (keyword channel_type)
                     template-type (some-> (if template (:channel_type template) (get template-types template_id)) keyword)]]
        (when (not= channel-type template-type)
          (throw-template-mismatch! channel-type template-type)))
      (doseq [handler handlers]
        (validate-notification-handler (-> handler
                                           (dissoc :recipients :template)
                                           (assoc :notification_id 1
                                                  :template_id (if (:template handler) 1 (:template_id handler))))))
      (doseq [{:keys [recipients]} handlers
              recipient            recipients
              :let                 [recipient (assoc recipient :notification_handler_id 1)]]
        (check-valid-recipient recipient)
        (validate-raw-value-email-domain! recipient)))))

(mr/def ::notification-with-parts.create
  [:merge
   ::notification.schema/notification.create
   [:map {:closed true}
    [:subscriptions {:optional true} [:maybe [:sequential ::notification.schema/notification-subscription.create]]]
    [:handlers      {:optional true} [:maybe [:sequential ::notification.schema/notification-handler.create]]]]])

(defn- create-batch!
  "Insert the Notifications of `rows` with their parts, with one insert for each kind of row, and return them in order."
  [rows]
  (let [card-rows     (into [] (keep #(when (= :notification/card (:payload_type %)) (:payload %))) rows)
        cards         (when (seq card-rows) (notification.db/insert-notification-cards! card-rows))
        card-ids      (volatile! (map :id cards))
        payload-id!   (fn [row]
                        (when (= :notification/card (:payload_type row))
                          (u/prog1 (first @card-ids)
                            (vswap! card-ids rest))))
        instances     (notification.db/insert-notifications!
                       (mapv #(-> %
                                  (dissoc :subscriptions :handlers :payload)
                                  (assoc :payload_id (payload-id! %)))
                             rows))
        handlers      (vec (mapcat (fn [row instance]
                                     (map #(assoc % :notification_id (:id instance)) (:handlers row)))
                                   rows instances))
        _             (create-notification-subscriptions!
                       (vec (mapcat (fn [row instance]
                                      (map #(assoc % :notification_id (:id instance)) (:subscriptions row)))
                                    rows instances)))
        templates     (models.channel/create-channel-templates! (into [] (keep :template) handlers))
        template-ids  (zipmap (keep-indexed (fn [i handler] (when (:template handler) i)) handlers)
                              (map :id templates))
        created       (create-notification-handlers!
                       (vec (map-indexed (fn [i handler]
                                           (-> handler
                                               (dissoc :recipients :template)
                                               (assoc :template_id (or (get template-ids i) (:template_id handler)))))
                                         handlers)))]
    (create-notification-recipients!
     (vec (mapcat (fn [handler created-handler]
                    (map #(assoc % :notification_handler_id (:id created-handler)) (:recipients handler)))
                  handlers created)))
    instances))

(mu/defn create-notifications! :- [:sequential (ms/InstanceOf :model/Notification)]
  "Insert the Notifications of `rows`, each with the `:subscriptions` and `:handlers` (with their recipients and
  templates) it has, in batches with one insert for each kind of row across a batch, in one transaction, publishing one
  create event for all, and return them in order."
  [rows :- [:sequential ::notification-with-parts.create]]
  (when (some #(= :notification/system-event (keyword (:payload_type %))) rows)
    (mdb/check-default-worktree (tru "System event notifications can only be created in the default worktree.")))
  (doseq [{:keys [handlers]} rows]
    (validate-email-handlers! handlers)
    (check-template-maps handlers))
  (t2/with-transaction [_conn]
    (check-new-notifications rows)
    (let [instances (into [] (mapcat (comp create-batch! vec)) (partition-all mdb/create-partition-size rows))]
      (when (seq instances)
        (events/publish-event! :event/notification-row-create (events/create-event instances)))
      instances)))

(def ^:private part-models
  "The models of the parts of a Notification, which its update writes by its spec."
  [:model/NotificationCard :model/NotificationSubscription :model/NotificationHandler :model/NotificationRecipient])

(defn- parts
  "The rows of the parts of `notification`, as plain maps by id, by model."
  [notification]
  (let [notification-id (:id notification)
        handlers        (notification.db/handlers-for-notifications [notification-id])]
    (update-vals
     {:model/NotificationCard         (when (:payload_id notification)
                                        (notification.db/notification-cards #{(:payload_id notification)}))
      :model/NotificationSubscription (notification.db/subscriptions-for-notifications [notification-id])
      :model/NotificationHandler      handlers
      :model/NotificationRecipient    (when (seq handlers)
                                        (notification.db/recipients-for-handlers (mapv :id handlers)))}
     #(m/index-by :id (map (fn [row] (into {} row)) %)))))

(defn- log-part-changes!
  "Log to the change log the rows that an update of a Notification inserted, updated and deleted, from the `before` and
  `after` [[parts]] of the Notification."
  [before after]
  (doseq [model part-models
          :let  [old (get before model)
                 new (get after model)]]
    (change-log/log-changes! model :insert (vals (apply dissoc new (keys old))))
    (change-log/log-changes! model :update (for [[id row] new
                                                 :when    (and (contains? old id) (not= row (get old id)))]
                                             row))
    (change-log/log-changes! model :delete (vals (apply dissoc old (keys new))))))

(defn- replace-part-rows!
  "Make the rows of `model` that `existing` holds the `new-rows`, matched by id and compared on `columns`: one insert of
  the new rows, one delete of the missing ones, and one update for each distinct set of changes of the others."
  [model columns existing new-rows]
  (let [{:keys [to-create to-delete to-update]} (u/row-diff existing new-rows :to-compare #(select-keys % columns))]
    (when (seq to-create)
      (notification.db/insert-part-rows! model (mapv #(select-keys % columns) to-create)))
    (when (seq to-delete)
      (notification.db/delete-part-rows! model (mapv :id to-delete)))
    (notification.db/update-part-rows! model (map #(assoc (select-keys % columns) :id (:id %)) to-update))))

(defn- update-payload!
  "Make the NotificationCard `existing` the payload `new`: delete it when there is none, insert it when there was none or
  it has another id, update it when its columns differ."
  [existing new]
  (let [columns (select-keys new card-update-columns)]
    (cond
      (nil? new)                       (when existing
                                         (notification.db/delete-part-rows! :model/NotificationCard [(:id existing)]))
      (nil? existing)                  (notification.db/insert-part-rows! :model/NotificationCard [columns])
      (not= (:id new) (:id existing))  (do (notification.db/delete-part-rows! :model/NotificationCard [(:id existing)])
                                           (notification.db/insert-part-rows! :model/NotificationCard [columns]))
      (not= (select-keys new [:send_condition :send_once]) (select-keys existing [:send_condition :send_once]))
      (notification.db/update-part-rows! :model/NotificationCard [(assoc columns :id (:id existing))]))))

(defn- template-write
  "What the template `new` of a handler asks of its `existing` template: `:delete` the id of one to delete, `:create` the
  columns of one to insert, `:update` the columns of one to update, and `:id` the id the handler keeps."
  [existing new]
  (let [columns (select-keys new template-columns)]
    (cond
      (nil? new)                       {:delete (:id existing)}
      (nil? existing)                  {:create columns}
      (not= (:id new) (:id existing))  {:delete (:id existing) :create columns}
      (not= columns (select-keys existing template-columns))
      {:update (assoc columns :id (:id existing)) :id (:id existing)}
      :else                            {:id (:id existing)})))

(defn- write-templates!
  "Apply `writes`, [[template-write]]s, with one delete, one insert and one update for each changed template, and return
  the id of the template each of them leaves its handler."
  [writes]
  (let [deletes (into [] (keep :delete) writes)
        creates (into [] (keep :create) writes)]
    (when (seq deletes)
      (notification.db/delete-part-rows! :model/ChannelTemplate deletes))
    (let [created-ids (volatile! (map :id (when (seq creates)
                                            (notification.db/insert-part-rows! :model/ChannelTemplate creates))))]
      (notification.db/update-part-rows! :model/ChannelTemplate (keep :update writes))
      (mapv (fn [{:keys [create id]}]
              (if create
                (u/prog1 (first @created-ids)
                  (vswap! created-ids rest))
                id))
            writes))))

(defn- update-handlers!
  "Make the NotificationHandlers `existing`, with their `:recipients` and `:template`, the `new-handlers`: matched by id,
  with one statement of each kind for all of them and their recipients and templates."
  [existing new-handlers]
  (let [{:keys [to-create to-delete to-update to-skip]} (u/row-diff existing new-handlers
                                                                    :to-compare #(select-keys % handler-columns))
        stored      (u/index-by :id existing)
        rows        (vec (concat to-create to-update to-skip))
        template-ids (write-templates! (mapv #(template-write (:template (stored (:id %))) (:template %)) rows))
        with-refs   (mapv #(assoc %1 :template_id %2) rows template-ids)
        created     (when (seq to-create)
                      (notification.db/insert-part-rows! :model/NotificationHandler
                                                         (mapv #(select-keys % handler-columns) (take (count to-create) with-refs))))
        handler-ids (into (mapv :id created) (map :id) (drop (count to-create) rows))]
    (when (seq to-delete)
      (notification.db/delete-part-rows! :model/NotificationHandler (mapv :id to-delete)))
    (notification.db/update-part-rows!
     :model/NotificationHandler
     (into []
           (keep-indexed (fn [i [row row-with-refs]]
                           (when (or (< i (count to-update))
                                     (not= (select-keys (merge (stored (:id row)) (select-keys row-with-refs [:template_id])) handler-columns)
                                           (select-keys row handler-columns)))
                             (assoc (select-keys row-with-refs handler-columns) :id (:id row)))))
           (drop (count to-create) (map vector rows with-refs))))
    (let [diffs (for [[row handler-id] (map vector rows handler-ids)
                      :when            (contains? row :recipients)]
                  (u/row-diff (:recipients (stored (:id row)))
                              (map #(assoc % :notification_handler_id handler-id) (:recipients row))
                              :to-compare #(select-keys % recipient-columns)))
          to-create-recipients (mapcat :to-create diffs)
          to-delete-recipients (mapcat :to-delete diffs)]
      (when (seq to-create-recipients)
        (notification.db/insert-part-rows! :model/NotificationRecipient (mapv #(select-keys % recipient-columns) to-create-recipients)))
      (when (seq to-delete-recipients)
        (notification.db/delete-part-rows! :model/NotificationRecipient (mapv :id to-delete-recipients)))
      (notification.db/update-part-rows! :model/NotificationRecipient
                                         (map #(assoc (select-keys % recipient-columns) :id (:id %)) (mapcat :to-update diffs))))))

(defn- update-parts!
  "Make the Notification `existing` the `new` one: its columns, its payload, its subscriptions, and its handlers with their
  recipients and templates, each part by id, so that the statements do not grow with the parts."
  [existing new]
  (let [notification-id (:id existing)
        columns         [:active :creator_id :payload_type :internal_id :payload_id]]
    (when (not= (select-keys new [:active :creator_id]) (select-keys existing [:active :creator_id]))
      (notification.db/update-notification-columns! notification-id (select-keys new columns)))
    (update-payload! (:payload existing) (:payload new))
    (replace-part-rows! :model/NotificationSubscription subscription-columns (:subscriptions existing)
                        (map #(assoc % :notification_id notification-id) (:subscriptions new)))
    (update-handlers! (:handlers existing)
                      (map #(assoc % :notification_id notification-id) (:handlers new)))))

(mr/def ::update-opts
  [:maybe [:map {:closed true}
           [:notifications {:optional true} [:maybe [:sequential ::FullyHydratedNotification]]]]])

(mu/defn update-notification! :- :nil
  "Make the Notification with `notification-id` the one `changes` describes, columns and all its parts, as a whole rather
  than a patch: the subscriptions and handlers it omits are deleted. Publishes its update event last, or its touch when
  only its parts changed. `:notifications` in `opts` holds the Notification as the caller already read and hydrated it."
  ([notification-id :- ms/PositiveInt
    changes         :- [:map {:closed false}]]
   (update-notification! notification-id changes nil))
  ([notification-id :- ms/PositiveInt
    changes         :- [:map {:closed false}]
    opts            :- ::update-opts]
   (let [existing-notification (or (first (filter #(= notification-id (:id %)) (:notifications opts)))
                                   (some-> (notification.db/notification notification-id) hydrate-notification))
         new-notification      changes]
     (validate-email-handlers! (:handlers new-notification))
     (when existing-notification
       (t2/with-transaction [_conn]
         (let [notification-before (notification.db/notification notification-id)
               active-before?      (:active notification-before)
               parts-before        (parts notification-before)
               subscriptions-old   (get parts-before :model/NotificationSubscription)
               handlers-old        (get parts-before :model/NotificationHandler)]
           (update-parts! existing-notification new-notification)
           (let [notification-after (notification.db/notification notification-id)
                 parts-after        (parts notification-after)
                 active-after?      (:active notification-after)
                 subscriptions-new  (get parts-after :model/NotificationSubscription)
                 handlers-new       (vals (get parts-after :model/NotificationHandler))
                 handler-key        (juxt :channel_type :channel_id :template_id)]
             (log-part-changes! parts-before parts-after)
             (check-handler-templates (remove #(= (handler-key %) (some-> (get handlers-old (:id %)) handler-key))
                                              handlers-new))
             (when (not= (boolean active-before?) (boolean active-after?))
               (update-subscription-triggers! active-after? (vals subscriptions-old)))
             (doseq [id (remove subscriptions-new (keys subscriptions-old))]
               (notification.task.send-trigger/delete-trigger-for-subscription! id))
             (doseq [[id subscription] subscriptions-new
                     :when             (not= subscription (get subscriptions-old id))]
               (notification.task.send-trigger/update-subscription-trigger! subscription))
             (let [event (events/update-event {notification-id notification-before}
                                              [{:id notification-id}]
                                              {:objects {notification-id notification-after}})]
               (cond
                 (seq (:changes event))              (events/publish-event! :event/notification-row-update event)
                 (not= parts-before parts-after)     (events/publish-event! :event/notification-row-update
                                                                            (events/touch-event [notification-after])))))))))
   nil))

(defn- flipped-ids
  "The ids of the Notifications of `stored` whose `:active` the changes in `requested`, a map from id, flip."
  [stored requested]
  (filterv (fn [id]
             (let [changes (requested id)]
               (and (contains? changes :active)
                    (not= (boolean (:active (stored id))) (boolean (:active changes))))))
           (keys requested)))

(defn- update-triggers-of-flipped!
  "Add or remove the Quartz triggers of the cron subscriptions of the Notifications that `requested` activates or
  deactivates."
  [stored requested]
  (doseq [[active ids] (group-by #(boolean (:active (requested %))) (flipped-ids stored requested))]
    (update-subscription-triggers! active (notification.db/subscriptions-for-notifications (vec ids)))))

(defn- publish-notification-updates!
  "Add or remove the Quartz triggers of the cron subscriptions of the Notifications of `id->stored` that `updates` activate
  or deactivate, then publish the update event of the Notifications."
  [updates id->stored _id->updated]
  (update-triggers-of-flipped! id->stored (into {} (map (juxt :id #(dissoc % :id))) updates))
  (events/publish-event! :event/notification-row-update (events/update-event id->stored updates)))

(mu/defn update-notifications! :- :nil
  "Apply the changes in each of `rows`, the id of a Notification and the columns to change, in one transaction,
  publishing their update event, a change of `:active` adding or removing the Quartz triggers of their cron
  subscriptions."
  [rows :- [:sequential ::notification.schema/notification.update]]
  (mdb/update-batched! :model/Notification rows
                       {:before-update (fn [rows id->stored] (filterv (comp id->stored :id) rows))
                        :after-update  publish-notification-updates!}))

(defn- delete-cascades-and-publish!
  "Delete the Quartz triggers of the cron subscriptions of `notifications` and their NotificationCards, then publish
  their delete event."
  [notifications]
  (let [ids (mapv :id notifications)]
    (doseq [subscription (notification.db/subscriptions-for-notifications ids)
            :when        (= :notification-subscription/cron (:type subscription))]
      (notification.task.send-trigger/delete-trigger-for-subscription! (:id subscription)))
    (notification.db/delete-notification-cards-for-notifications! ids))
  (events/publish-event! :event/notification-row-delete (events/delete-event notifications)))

(mu/defn delete-notifications! :- :nil
  "Delete the Notifications with `notification-ids` along with the NotificationCards they hold and the Quartz triggers
  of their cron subscriptions, in one transaction, publishing their delete event right before the first Notification
  statement."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/Notification notification-ids {:before-delete delete-cascades-and-publish!}))

(mu/defn delete-notification-recipients! :- :nil
  "Delete the NotificationRecipients with `recipient-ids`, publishing no event as a recipient leaving is upkeep, not a
  change of its Notification."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (when (seq recipient-ids)
    (notification.db/delete-recipients! (vec recipient-ids)))
  nil)

(mu/defn delete-notification-recipients-for-users! :- :nil
  "Delete the NotificationRecipients of the Users with `user-ids`, as [[delete-notification-recipients!]] does."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (when (seq user-ids)
    (delete-notification-recipients! (mapv :id (notification.db/recipients-for-users user-ids))))
  nil)

(defn unsubscribe-user!
  "Unsubscribe a user from a notification by deleting its NotificationRecipients, as [[delete-notification-recipients!]]
  does."
  [notification-id user-id]
  (delete-notification-recipients! (mapv :id (notification.db/user-recipients-for-notification notification-id user-id))))

;;; ------------------------------------------------ Specs ------------------------------------------------

(defmethod app-db-copy/spec :model/Notification [_model]
  {:skip? false})

(defmethod change-log/spec :model/Notification [_model]
  {:track [:payload_type :active :internal_id :payload_id :creator_id]
   :skip  []})

(defmethod app-db-copy/spec :model/NotificationSubscription [_model]
  {:skip? false})

(defmethod change-log/spec :model/NotificationSubscription [_model]
  {:track [:notification_id :type :event_name :cron_schedule :ui_display_type]
   :skip  []})

(defmethod app-db-copy/spec :model/NotificationHandler [_model]
  {:skip? false})

(defmethod change-log/spec :model/NotificationHandler [_model]
  {:track [:channel_type :notification_id :channel_id :template_id :active]
   :skip  []})

(defmethod app-db-copy/spec :model/NotificationRecipient [_model]
  {:skip? false})

(defmethod change-log/spec :model/NotificationRecipient [_model]
  {:track [:notification_handler_id :type :user_id :permissions_group_id :details]
   :skip  []})

(defmethod app-db-copy/spec :model/NotificationCard [_model]
  {:skip? false})

(defmethod change-log/spec :model/NotificationCard [_model]
  {:track [:card_id :send_once :send_condition :disable_links]
   :skip  []})
