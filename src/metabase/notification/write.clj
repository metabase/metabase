(ns metabase.notification.write
  "The full write of a Notification with its payload, subscriptions, handlers, templates and recipients, as the REST
  endpoints and the MCP and Metabot tools make it, with the mail those entry points send."
  (:require
   [clojure.data :refer [diff]]
   [metabase.api.common :as api]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.models.channel :as models.channel]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.util.spec-update :as models.u.spec-update]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Schemas -----------------------------------------------------

(defn- handler-api-input
  [handler-schema recipient-schema]
  [:merge
   handler-schema
   [:map {:closed true}
    [:template   {:optional true} [:multi {:dispatch map?}
                                   [true ::models.channel/ChannelTemplateUserProvided]
                                   [false :nil]]]
    [:channel    {:optional true} [:maybe ::models.channel/Channel]]
    [:recipients {:optional true} [:sequential recipient-schema]]]])

(mr/def ::CreateNotificationParams
  "Notification schema for a create request, or for sending one that was never saved. Like
  FullyHydratedNotification but restricts templates to user-provided types only (no handlebars-resource),
  and carries no ids since the body has no row of its own."
  (models.notification/hydrated-notification-schema
   (handler-api-input ::models.notification/CreateNotificationHandlerParams
                      ::models.notification/CreateNotificationRecipientParams)
   {:with-id? false}))

(mr/def ::NotificationApiUpdateInput
  "Notification schema for an update request, restricted to what `notification-update-spec` writes. On PUT
  the URL, not the body, identifies the target (RFC 9110 §9.3.4), so a client-sent id is stripped."
  (models.notification/hydrated-notification-schema
   (handler-api-input ::models.notification/NotificationHandler
                      ::models.notification/NotificationRecipient)
   {:with-id? true :update-input? true}))

;;; ------------------------------------------------------ Checks -------------------------------------------------------

(defn check-no-resource-templates!
  "Validate that no handler uses handlebars-resource templates. That type is internal only."
  [handlers]
  (doseq [{:keys [template]} handlers
          :when template
          :let [template-type (some-> template :details :type keyword)]]
    (when (= :email/handlebars-resource template-type)
      (throw (ex-info "invalid template" {:status-code 400})))))

(defn- handler-touches-template?
  [{:keys [template template_id]}]
  (or (map? template) (some? template_id)))

(defn check-handler-templates!
  "Validate the templates carried by a notification request's `handlers`: reject internal-only
  handlebars-resource templates (400), and require the same permission as writing a `ChannelTemplate`
  directly (403) for any template the request creates, overwrites, or deletes. `existing-handlers`
  (nil on create) hold templates an update may overwrite or delete, so a template on either side
  gates the write."
  ([handlers] (check-handler-templates! handlers nil))
  ([handlers existing-handlers]
   (check-no-resource-templates! handlers)
   (when (or (some handler-touches-template? handlers)
             (some handler-touches-template? existing-handlers))
     (api/check-403 (mi/can-write? (t2/hydrate (t2/instance :model/ChannelTemplate {}) :can_write))))))

;;; ------------------------------------------------------- Mail --------------------------------------------------------

(defn- card-notification?
  [notification]
  (= :notification/card (:payload_type notification)))

(defn- all-email-recipients [notification]
  (->> (:handlers notification)
       (filter #(= :channel/email ((comp keyword :channel_type) %)))
       (mapcat :recipients)
       (filter #(#{:notification-recipient/user :notification-recipient/raw-value} ((comp keyword :type) %)))
       (map (fn [recipient]
              (if (= :notification-recipient/user ((comp keyword :type) recipient))
                (or (-> recipient :user :email) (notification.db/user-email (:user_id recipient)))
                (-> recipient :details :value))))
       (remove nil?)
       set))

(defn- send-you-were-added-card-notification-email! [notification]
  (when (channel.settings/email-configured?)
    (let [current-user? #{(:email @api/*current-user*)}]
      (when-let [recipients-except-creator (->> (all-email-recipients notification)
                                                (remove current-user?)
                                                seq)]
        (messages/send-you-were-added-card-notification-email!
         (update notification :payload #(t2/hydrate % :card)) recipients-except-creator @api/*current-user*)))))

(defn- notify-notification-updates!
  "Send notification emails based on changes between updated and existing notification"
  [updated-notification existing-notification]
  (when (channel.settings/email-configured?)
    (let [was-active?  (:active existing-notification)
          is-active?   (:active updated-notification)
          current-user @api/*current-user*
          old-emails   (all-email-recipients existing-notification)
          new-emails   (all-email-recipients updated-notification)
          notification (update existing-notification :payload #(t2/hydrate % :card))]
      (cond
        ;; Notification was just archived - notify all users they were unsubscribed
        (and was-active? (not is-active?))
        (messages/send-you-were-removed-notification-card-email! notification old-emails current-user)

        ;; Notification was just unarchived - notify all users they were added
        (and (not was-active?) is-active?)
        (messages/send-you-were-added-card-notification-email! notification new-emails @api/*current-user*)

        (not= old-emails new-emails)
        (let [[removed-recipients added-recipients _] (diff old-emails new-emails)]
          (when (seq removed-recipients)
            (messages/send-you-were-removed-notification-card-email! notification removed-recipients current-user))
          (when (seq added-recipients)
            (messages/send-you-were-added-card-notification-email! notification added-recipients @api/*current-user*)))))))

(defn publish-notification-update!
  "Post-update side effects for a notification: recipient emails on `:active` transitions (or
  recipient diffs) + an `:event/notification-update` audit event. Shared between the self-service
  PUT endpoint and the admin bulk endpoint so the contract can't drift. Both args should be
  hydrated notifications (see [[models.notification/hydrate-notification]])."
  [updated-notification existing-notification]
  (when (card-notification? existing-notification)
    (notify-notification-updates! updated-notification existing-notification))
  (events/publish-event! :event/notification-update
                         {:object          updated-notification
                          :previous-object existing-notification
                          :user-id         api/*current-user-id*}))

;;; ------------------------------------------------------ Writes ------------------------------------------------------

(defn create-notification!
  "Create a new notification with `subsciptions`.
  Return the created notification."
  [notification subscriptions handlers+recipients]
  (models.notification/validate-email-handlers! handlers+recipients)
  (events/with-batched-events
    (let [payload-id      (case (:payload_type notification)
                            (:notification/system-event :notification/testing)
                            nil
                            :notification/card
                            (notification.db/insert-notification-card! (:payload notification)))
          notification    (-> notification
                              (assoc :payload_id payload-id)
                              (dissoc :payload))
          instance        (notification.db/insert-notification! notification)
          notification-id (:id instance)]
      (when (seq subscriptions)
        (notification.db/insert-subscriptions! (map #(assoc % :notification_id notification-id) subscriptions)))
      (doseq [{:keys [recipients template] :as handler} handlers+recipients]
        ;; assert can either template_id exists, then template but be nil, and vice versa
        (when (and template (not (map? template)))
          (throw (ex-info "Channel template must be a map" {:status-code 400})))
        (let [template-id (if template
                            (notification.db/insert-channel-template! template)
                            (:template_id handler))
              handler    (-> handler
                             (dissoc :recipients :template)
                             (assoc :notification_id notification-id
                                    :template_id template-id))
              handler-id (notification.db/insert-handler! handler)]
          (notification.db/insert-recipients! (map #(assoc % :notification_handler_id handler-id) recipients))))
      instance)))

(defn get-notification
  "Get a notification by id."
  [id]
  (-> (notification.db/notification id)
      api/check-404
      models.notification/hydrate-notification))

(mu/defn create-notification-with-perm-checks! :- ::models.notification/FullyHydratedNotification
  "Create a notification with permission checks, hydration, email notifications, and event publishing."
  [notification-info :- ::CreateNotificationParams]
  (api/create-check :model/Notification notification-info)
  (let [notification (models.notification/hydrate-notification
                      (create-notification!
                       (dissoc notification-info :handlers :subscriptions)
                       (:subscriptions notification-info)
                       (:handlers notification-info)))]
    (when (card-notification? notification)
      (send-you-were-added-card-notification-email! notification))
    notification))

(defn update-notification!
  "Update an existing notification with `new-notification`."
  [existing-notification new-notification]
  (models.notification/validate-email-handlers! (:handlers new-notification))
  (models.u.spec-update/do-update! existing-notification new-notification models.notification/notification-update-spec))

(defn- body-with-authoritative-ids
  "Set the URL notification's `:id` on `body`, and its payload's `:id` when the body carries a
  payload."
  [body {:keys [id payload_id]}]
  ;; without the ids the spec-update below would treat the body as a different row and delete +
  ;; recreate it, changing primary keys out from under the caller
  (cond-> (assoc body :id id)
    (and (:payload body) payload_id) (assoc-in [:payload :id] payload_id)))

(mu/defn update-notification-with-perm-checks!
  "Update notification `id` from `body` with the permission and handler-template checks and
  post-update side effects, and return the updated hydrated notification. `body` is a whole
  notification, not a patch: the update spec deletes the subscription and handler rows it doesn't
  find there."
  [id   :- ms/PositiveInt
   body :- ::NotificationApiUpdateInput]
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (check-handler-templates! (:handlers body) (:handlers existing-notification))
    (let [body (body-with-authoritative-ids body existing-notification)]
      (update-notification! existing-notification body)
      (u/prog1 (get-notification id)
        (publish-notification-update! <> existing-notification)))))

(defn unsubscribe-user!
  "Unsubscribe a user from a notification."
  [notification-id user-id]
  (let [notification (get-notification notification-id)]
    (api/check-403 (models.notification/current-user-is-recipient? notification))
    (notification.db/delete-user-recipients-for-notification! notification-id user-id)
    (u/prog1 (get-notification notification-id)
      (when (card-notification? <>)
        (u/ignore-exceptions
          (messages/send-you-unsubscribed-notification-card-email!
           (update <> :payload #(t2/hydrate % :card))
           [(:email @api/*current-user*)])))
      (events/publish-event! :event/notification-unsubscribe {:object {:id notification-id}
                                                              :user-id api/*current-user-id*}))))
