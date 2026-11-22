(ns metabase.notification.models
  "A notification have:
  - a payload
  - more than one subscriptions
  - more than one handlers where each handler has a channel, optionally a template, and more than one recpients."
  (:require
   [clojure.set :as set]
   [malli.core :as mc]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.channel.models.channel :as models.channel]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.util.spec-update :as models.u.spec-update]
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
  (and
   (or (not (contains? changes :creator_id))
       (= (:creator_id changes) (:creator_id instance))
       (mi/superuser?))
   (mi/can-write? instance)
   (or (mi/superuser?)
       (current-user-can-read-payload? (merge instance changes)))))

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

(models.u.spec-update/define-spec notification-update-spec
  "Spec for updating a notification."
  {:model        :model/Notification
   :compare-cols [:active :creator_id]
   :extra-cols   [:payload_type :internal_id :payload_id]
   :nested-specs [[:payload       {:model        :model/NotificationCard
                                   :compare-cols [:send_condition :send_once]
                                   :extra-cols   [:card_id]}]
                  [:subscriptions {:model        :model/NotificationSubscription
                                   :fk-column    :notification_id
                                   :compare-cols [:notification_id :type :event_name :cron_schedule :ui_display_type]
                                   :multi-row?   true}]
                  [:handlers      {:model        :model/NotificationHandler
                                   :fk-column    :notification_id
                                   :compare-cols [:notification_id :channel_type :channel_id :template_id :active]
                                   :multi-row?   true
                                   :nested-specs [[:recipients {:model        :model/NotificationRecipient
                                                                :fk-column    :notification_handler_id
                                                                :compare-cols [:notification_handler_id :type :user_id :permissions_group_id :details]
                                                                :multi-row?   true}]
                                                  [:template   {:model         :model/ChannelTemplate
                                                                :ref-in-parent :template_id
                                                                :compare-cols  [:channel_type :name :details]}]]}]]})

(defn- update-input-entries
  "Entries from `entries` whose key `spec` uses on update."
  [entries {:keys [compare-cols extra-cols nested-specs multi-row? id-col]}]
  (let [allowed (into (set (concat compare-cols extra-cols (map first nested-specs)))
                      ;; multi-row rows are matched by their body-supplied id, so keep the id entry
                      (when multi-row? [id-col]))]
    (filterv (comp allowed first) entries)))

(mr/def ::NotificationCardUpdate
  "::NotificationCard restricted to what the update spec writes - `:id` comes from the URL's notification."
  (into [:map {:closed true}]
        (update-input-entries notification-card-entries
                              (second (m/find-first (comp #{:payload} first)
                                                    (:nested-specs notification-update-spec))))))

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
  we hand back out. `:update-input? true` keeps only the entries `notification-update-spec` uses."
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
                   update-input? (update-input-entries notification-update-spec))]
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

(mu/defn notifications-for-card :- [:sequential ::FullyHydratedNotification]
  "Find all active card notifications for a given card-id."
  [card-id :- pos-int?]
  (hydrate-notification (notification.db/active-card-notifications-for-card card-id)))

(defn notifications-for-event
  "Find all active notifications for a given event."
  [event-name]
  (notification.db/active-system-event-notifications (u/qualified-name event-name)))

;;; ---------------------------------------------- Writes ----------------------------------------------

(defn- check-handler-templates!
  "Throws a 400 unless the channel type of each of `handlers`, rows with their `:template_id` and `:channel_type`,
  matches the type of its ChannelTemplate."
  [handlers]
  (when-let [template-ids (not-empty (into #{} (keep :template_id) handlers))]
    (let [template-types (update-vals (notification.db/channel-templates-by-id (vec template-ids)) :channel_type)]
      (doseq [{:keys [template_id channel_type]} handlers
              :when template_id
              :let  [channel-type  (keyword channel_type)
                     template-type (some-> (get template-types template_id) keyword)]]
        (when (not= channel-type template-type)
          (throw (ex-info "Channel type and template type mismatch"
                          {:status-code   400
                           :channel-type  channel-type
                           :template-type template-type})))))))

(defn- update-subscription-triggers!
  "Add, move or remove the Quartz trigger of each of the NotificationSubscriptions `subscriptions` of a Notification
  that is `active?`: inactive Notifications have none."
  [active? subscriptions]
  (doseq [subscription (filter #(= :notification-subscription/cron (:type %)) subscriptions)]
    (if active?
      (notification.task.send-trigger/update-subscription-trigger! subscription)
      (notification.task.send-trigger/delete-trigger-for-subscription! (:id subscription)))))

(mu/defn- create-notification-subscriptions! :- [:sequential :map]
  "Insert the NotificationSubscription `rows` and add the Quartz triggers of the cron ones, and return the inserted
  subscriptions."
  [rows :- [:sequential ::notification.schema/notification-subscription.create]]
  (if (seq rows)
    (let [subscriptions (notification.db/insert-subscriptions! rows)]
      (doseq [subscription subscriptions]
        (notification.task.send-trigger/update-subscription-trigger! subscription))
      subscriptions)
    []))

(defn- insert-grouped
  "Insert `rows` with `insert`, a function of a vector of them returning the inserted instances in their order, one
  statement for each distinct set of columns that the rows give, returning the instances in the order of `rows`."
  [insert rows]
  (let [indexed  (map-indexed vector rows)
        inserted (into {}
                       (mapcat (fn [group]
                                 (map vector (map first group) (insert (mapv second group)))))
                       (vals (group-by (comp set keys second) indexed)))]
    (mapv inserted (range (count rows)))))

(mu/defn- create-notification-handlers! :- [:sequential :map]
  "Insert the NotificationHandler `rows`, which must have the channel type of their templates, and return the inserted
  instances in the order of the rows."
  [rows :- [:sequential ::notification.schema/notification-handler.create]]
  (if (seq rows)
    (do
      (check-handler-templates! rows)
      (insert-grouped notification.db/insert-handlers! rows))
    []))

(mu/defn create-notification-recipients! :- :nil
  "Insert the NotificationRecipient `rows`. A recipient joining is upkeep, not a change of its Notification, which
  publishes no event."
  [rows :- [:sequential ::notification.schema/notification-recipient.create]]
  (when (seq rows)
    (insert-grouped notification.db/insert-recipients! rows))
  nil)

(defn- check-template-maps!
  "Throws a 400 unless the inline `:template` of each of `handlers` is a map."
  [handlers]
  (doseq [{:keys [template]} handlers]
    (when (and template (not (map? template)))
      (throw (ex-info "Channel template must be a map" {:status-code 400})))))

(mu/defn create-notification!
  "Create a new notification with `subsciptions`, publishing its create event last. Return the created notification."
  [notification         :- ::notification.schema/notification.create
   subscriptions        :- [:maybe [:sequential ::notification.schema/notification-subscription.create]]
   handlers+recipients  :- [:maybe [:sequential ::notification.schema/notification-handler.create]]]
  (validate-email-handlers! handlers+recipients)
  (check-template-maps! handlers+recipients)
  (t2/with-transaction [_conn]
    (let [card            (case (:payload_type notification)
                            (:notification/system-event :notification/testing)
                            nil
                            :notification/card
                            (notification.db/insert-notification-card! (:payload notification)))
          notification    (-> notification
                              (assoc :payload_id (:id card))
                              (dissoc :payload))
          instance        (notification.db/insert-notification! notification)
          notification-id (:id instance)
          _               (create-notification-subscriptions! (map #(assoc % :notification_id notification-id) subscriptions))
          templates       (models.channel/create-channel-templates! (into [] (keep :template) handlers+recipients))
          template-ids    (zipmap (keep-indexed (fn [i handler] (when (:template handler) i)) handlers+recipients)
                                  (map :id templates))
          handler-rows    (vec (map-indexed (fn [i handler]
                                              (-> handler
                                                  (dissoc :recipients :template)
                                                  (assoc :notification_id notification-id
                                                         :template_id (or (get template-ids i) (:template_id handler)))))
                                            handlers+recipients))
          handlers        (create-notification-handlers! handler-rows)]
      (create-notification-recipients!
       (into []
             (mapcat (fn [[{:keys [recipients]} handler]]
                       (map #(assoc % :notification_handler_id (:id handler)) recipients)))
             (map vector handlers+recipients handlers)))
      (events/publish-event! :event/notification-row-create (events/create-event [instance]))
      instance)))

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

(defn- missing-ids
  "The ids of the `existing` rows that the `new` rows do not list."
  [existing new]
  (set/difference (into #{} (keep :id) existing) (into #{} (keep :id) new)))

(defn- dropped-ids
  "The ids of the parts of `existing-notification` that `new-notification` does not list, by model: the rows that the
  update spec deletes, a handler taking its recipients along."
  [existing-notification new-notification]
  (let [new-handlers (m/index-by :id (:handlers new-notification))
        replaced?    (and (contains? new-notification :payload)
                          (some? (:payload_id existing-notification))
                          (not= (:payload_id existing-notification) (:id (:payload new-notification))))
        handlers     (when (contains? new-notification :handlers) (:handlers existing-notification))
        dropped      (remove (comp new-handlers :id) handlers)]
    {:model/NotificationCard         (when replaced? #{(:payload_id existing-notification)})
     :model/NotificationSubscription (when (contains? new-notification :subscriptions)
                                       (missing-ids (:subscriptions existing-notification) (:subscriptions new-notification)))
     :model/NotificationHandler      (into #{} (map :id) dropped)
     :model/NotificationRecipient    (into (into #{} (comp (mapcat :recipients) (map :id)) dropped)
                                           (mapcat (fn [{:keys [id recipients]}]
                                                     (when-let [new-handler (get new-handlers id)]
                                                       (when (contains? new-handler :recipients)
                                                         (missing-ids recipients (:recipients new-handler))))))
                                           handlers)}))

(defn- log-dropped-parts!
  "Log to the change log the deletes of the rows of `dropped`, by model, before the update that makes them."
  [dropped]
  (doseq [[model ids] dropped
          :when       (seq ids)]
    (change-log/log-rows! model :delete :id [:in (vec ids)])))

(defn- log-changed-parts!
  "Log to the change log the rows that an update of a Notification inserted and updated, from the `before` and `after`
  [[parts]] of the Notification."
  [before after]
  (doseq [model part-models
          :let  [old      (get before model)
                 new      (get after model)
                 inserted (vec (remove #(contains? old %) (keys new)))
                 updated  (vec (filter #(and (contains? old %) (not= (get old %) (get new %))) (keys new)))]]
    (when (seq inserted)
      (change-log/log-rows! model :insert :id [:in inserted]))
    (when (seq updated)
      (change-log/log-rows! model :update :id [:in updated]))))

(mu/defn update-notification! :- :nil
  "Update an existing notification with `new-notification`, publishing its update event last, or its touch when only its
  parts changed."
  [existing-notification :- ::FullyHydratedNotification
   new-notification      :- [:map {:closed false} [:id ms/PositiveInt]]]
  (validate-email-handlers! (:handlers new-notification))
  (let [notification-id (:id existing-notification)]
    (t2/with-transaction [_conn]
      (let [notification-before (notification.db/notification notification-id)
            active-before?      (:active notification-before)
            parts-before        (parts notification-before)
            subscriptions-old   (get parts-before :model/NotificationSubscription)
            handlers-old        (get parts-before :model/NotificationHandler)
            dropped             (dropped-ids existing-notification new-notification)]
        (log-dropped-parts! dropped)
        (models.u.spec-update/do-update! existing-notification new-notification notification-update-spec)
        (let [notification-after (notification.db/notification notification-id)
              parts-after        (parts notification-after)
              active-after?      (:active notification-after)
              subscriptions-new  (get parts-after :model/NotificationSubscription)
              handlers-new       (vals (get parts-after :model/NotificationHandler))
              handler-key        (juxt :channel_type :channel_id :template_id)]
          (log-changed-parts! parts-before parts-after)
          (check-handler-templates! (remove #(= (handler-key %) (some-> (get handlers-old (:id %)) handler-key))
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
                                                                         (events/touch-event [notification-after]))))))))
  nil)

(mu/defn update-notifications! :- :int
  "Apply `changes` to the Notifications with `notification-ids`, publishing the events of the writes, and return the
  number updated. A change of `:active` adds or removes the Quartz triggers of their cron subscriptions."
  [notification-ids :- [:sequential ms/PositiveInt]
   changes          :- (mut/select-keys ::notification.schema/notification.update [:active :creator_id])]
  (if (seq notification-ids)
    (t2/with-transaction [_conn]
      (let [notifications (notification.db/notifications-by-id notification-ids)
            flipped       (when (contains? changes :active)
                            (map :id (remove #(= (boolean (:active %)) (boolean (:active changes))) notifications)))]
        (notification.db/update-notifications! notification-ids changes)
        (when (seq flipped)
          (update-subscription-triggers! (:active changes)
                                         (notification.db/subscriptions-for-notifications (vec flipped))))
        (events/publish-event! :event/notification-row-update
                               (events/update-event (u/index-by :id notifications)
                                                    (mapv #(assoc changes :id (:id %)) notifications)))
        (count notifications)))
    0))

(mu/defn delete-notifications! :- :int
  "Delete the Notifications with `notification-ids` along with the NotificationCards they hold and the Quartz triggers
  of their cron subscriptions, publishing the events of the writes, and return the number deleted."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (if (seq notification-ids)
    (t2/with-transaction [_conn]
      (let [notifications (notification.db/notifications-by-id notification-ids)]
        (doseq [subscription (notification.db/subscriptions-for-notifications notification-ids)
                :when        (= :notification-subscription/cron (:type subscription))]
          (notification.task.send-trigger/delete-trigger-for-subscription! (:id subscription)))
        (let [payload-ids (not-empty (into #{} (keep #(when (= :notification/card (:payload_type %)) (:payload_id %)))
                                           notifications))
              cards       (when payload-ids (notification.db/notification-cards payload-ids))]
          (when (seq cards)
            (notification.db/delete-notification-cards! (mapv :id cards)))
          (events/publish-event! :event/notification-row-delete (events/delete-event notifications))
          (notification.db/delete-notifications! notification-ids)
          (count notifications))))
    0))

(mu/defn delete-notification-recipients! :- :nil
  "Delete the NotificationRecipients with `recipient-ids`. A recipient leaving is upkeep, not a change of its
  Notification, which publishes no event."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (when (seq recipient-ids)
    (notification.db/delete-recipients! (vec recipient-ids)))
  nil)

(mu/defn delete-notification-recipients-for-user! :- :nil
  "Delete the NotificationRecipients of the User with `user-id`, as [[delete-notification-recipients!]] does."
  [user-id :- ::lib.schema.id/user]
  (delete-notification-recipients! (mapv :id (notification.db/recipients-for-user user-id))))

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
