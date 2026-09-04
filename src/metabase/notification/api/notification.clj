(ns metabase.notification.api.notification
  "/api/notification endpoints"
  (:require
   [clojure.data :refer [diff]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.models.channel :as models.channel]
   [metabase.channel.settings :as channel.settings]
   [metabase.embedding.util :as embed.util]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defn- handler-api-input
  [handler-schema recipient-schema]
  [:merge
   handler-schema
   [:map
    [:template   {:optional true} [:multi {:dispatch map?}
                                   [true ::models.channel/ChannelTemplateUserProvided]
                                   [false :nil]]]
    [:channel    {:optional true} [:maybe ::models.channel/Channel]]
    [:recipients {:optional true} [:sequential recipient-schema]]]])

(mr/def ::NotificationApiInput
  "Notification schema for API input. Like FullyHydratedNotification but restricts templates
  to user-provided types only (no handlebars-resource)."
  (models.notification/hydrated-notification-schema
   (handler-api-input ::models.notification/NotificationHandler
                      ::models.notification/NotificationRecipient)))

(mr/def ::CreateNotificationParams
  "Notification schema for a create request."
  (models.notification/hydrated-notification-schema
   (handler-api-input ::models.notification/CreateNotificationHandlerParams
                      ::models.notification/CreateNotificationRecipientParams)
   {:with-id? false}))

(mr/def ::NotificationApiUpdateInput
  "::NotificationApiInput restricted to what `notification-update-spec` writes. On PUT the URL,
  not the body, identifies the target (RFC 9110 §9.3.4), so a client-sent id is stripped."
  (models.notification/hydrated-notification-schema
   (handler-api-input ::models.notification/NotificationHandler
                      ::models.notification/NotificationRecipient)
   {:with-id? true :update-input? true}))

(defn- check-no-resource-templates!
  "Validate that no handler uses handlebars-resource templates. That type is internal only."
  [handlers]
  (doseq [{:keys [template]} handlers
          :when template
          :let [template-type (some-> template :details :type keyword)]]
    (when (= :email/handlebars-resource template-type)
      (throw (ex-info "invalid template" {:status-code 400})))))

(defn- check-inline-channels!
  "Validate that an inline `:channel` handler requires the same permission as creating one."
  [handlers]
  (when (some :channel handlers)
    (api/check-403 (mi/can-write? :model/Channel))))

(defn- handler-touches-template?
  [{:keys [template template_id]}]
  (or (map? template) (some? template_id)))

(defn- check-handler-templates!
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
     (api/check-403 (mi/can-write? :model/ChannelTemplate)))))

(defn get-notification
  "Get a notification by id."
  [id]
  (-> (notification.db/notification id)
      api/check-404
      models.notification/hydrate-notification))

(defn- card-notification?
  [notification]
  (= :notification/card (:payload_type notification)))

(defn list-notifications
  "List notifications. See `GET /` for parameters."
  [{:keys [creator_id creator_or_recipient_id recipient_id card_id payload_type include_inactive legacy-active legacy-user-id]}]
  (->> (notification.db/notifications-matching
        {:creator-id               creator_id
         :creator-or-recipient-id  creator_or_recipient_id
         :recipient-id             recipient_id
         :card-id                  card_id
         :payload-type             payload_type
         :include-inactive?        include_inactive
         ;; legacy-active and legacy-user-id only used by alert api, will be removed soon
         :legacy-active            legacy-active
         :legacy-user-id           legacy-user-id})
       (into [] (comp
                 (map t2.realize/realize)
                 (filter mi/can-read?)))
       models.notification/hydrate-notification))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List notifications.
  - `creator_id`: if provided returns only notifications created by this user
  - `recipient_id`: if provided returns only notification that has recipient_id as a recipient
  - `creator_or_recipient_id`: if provided returns only notification that has user_id as creator or recipient
  - `card_id`: if provided returns only notification that has card_id as payload"
  [_route-params
   {:keys [creator_id creator_or_recipient_id recipient_id card_id include_inactive payload_type]} :-
   [:map
    [:creator_id              {:optional true} ms/PositiveInt]
    [:recipient_id            {:optional true} ms/PositiveInt]
    [:creator_or_recipient_id {:optional true} ms/PositiveInt]
    [:card_id                 {:optional true} ms/PositiveInt]
    [:include_inactive        {:optional true} ms/BooleanValue]
    [:payload_type            {:optional true} [:maybe (into [:enum] models.notification/notification-types)]]]]
  (list-notifications {:creator_id              creator_id
                       :recipient_id            recipient_id
                       :creator_or_recipient_id creator_or_recipient_id
                       :card_id                 card_id
                       :include_inactive        include_inactive
                       :payload_type            payload_type}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a notification by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (get-notification id)
      api/read-check))

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

(mu/defn create-notification! :- ::models.notification/FullyHydratedNotification
  "Create a notification with permission checks, hydration, email notifications, and event publishing."
  [notification-info :- ::models.notification/FullyHydratedNotification]
  (api/create-check :model/Notification notification-info)
  (let [notification (models.notification/hydrate-notification
                      (models.notification/create-notification!
                       (dissoc notification-info :handlers :subscriptions)
                       (:subscriptions notification-info)
                       (:handlers notification-info)))]
    (when (card-notification? notification)
      (send-you-were-added-card-notification-email! notification))
    (events/publish-event! :event/notification-create {:object notification :user-id api/*current-user-id*})
    notification))

(api.macros/defendpoint :post "/" :- ::models.notification/FullyHydratedNotification
  "Create a new notification, return the created notification."
  [_route _query body :- ::CreateNotificationParams request]
  (check-handler-templates! (:handlers body))
  (create-notification!
   (-> body
       (update :payload_type keyword)
       (assoc :creator_id api/*current-user-id*)
       (assoc-in [:payload :disable_links]
                 (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request)))))

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

(defn- body-with-authoritative-ids
  "Set the URL notification's `:id` on `body`, and its payload's `:id` when the body carries a
  payload."
  [body {:keys [id payload_id]}]
  ;; without the ids the spec-update below would treat the body as a different row and delete +
  ;; recreate it, changing primary keys out from under the caller
  (cond-> (assoc body :id id)
    (and (:payload body) payload_id) (assoc-in [:payload :id] payload_id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification.

  `creator_id` (owner) can be reassigned here only by superusers (e.g. the admin 'Edit alert'
  modal's owner picker). `mi/can-update?` rejects a non-superuser reassignment attempt with 403;
  the model's `before-update` hook is the backstop. Echoing back the unchanged value is fine."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- ::NotificationApiUpdateInput]
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (check-handler-templates! (:handlers body) (:handlers existing-notification))
    (let [body (body-with-authoritative-ids body existing-notification)]
      (models.notification/update-notification! existing-notification body)
      (u/prog1 (get-notification id)
        (publish-notification-update! <> existing-notification)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/send"
  "Send a notification by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   {:keys [handler_ids]} :- [:map [:handler_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (let [notification (cond-> (get-notification id)
                       (seq handler_ids)
                       (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers))))]
    ;; sending runs the notification's payload as its creator, so gate on write access rather than read access
    (api/write-check notification)
    (notification/send-notification! notification :notification/sync? true)))

(defn- promote-to-t2-instance
  [notification]
  (->  (t2/instance :model/Notification notification)
       (m/update-existing :handlers #(map (fn [x]
                                            (-> (t2/instance :model/NotificationHandler x)
                                                (m/update-existing :channel (fn [c] (t2/instance :model/Channel) c))
                                                (m/update-existing :template (fn [t] (t2/instance :model/ChannelTemplate) t))
                                                (m/update-existing :recipients (fn [recipients] (map (fn [r] (t2/instance :model/NotificationRecipient r)) recipients)))))
                                          %))
       (m/update-existing :subscriptions #(map (fn [x] (t2/instance :model/NotificationSubscription x)) %))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/send"
  "Send an unsaved notification."
  [_route _query body :- ::NotificationApiInput request]
  (check-no-resource-templates! (:handlers body))
  (check-inline-channels! (:handlers body))
  (api/create-check :model/Notification body)
  (models.notification/validate-email-handlers! (:handlers body))
  (let [notification (-> body
                         (assoc :creator_id api/*current-user-id*)
                         (assoc-in [:payload :disable_links]
                                   (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request))
                         promote-to-t2-instance)]
    (notification/send-notification! notification :notification/sync? true)))

(defn unsubscribe-user!
  "Unsubscribe a user from a notification."
  [notification-id user-id]
  (let [notification (get-notification notification-id)]
    (api/check-403 (models.notification/current-user-is-recipient? notification))
    (models.notification/unsubscribe-user! notification-id user-id)
    (u/prog1 (get-notification notification-id)
      (when (card-notification? <>)
        (u/ignore-exceptions
          (messages/send-you-unsubscribed-notification-card-email!
           (update <> :payload #(t2/hydrate % :card))
           [(:email @api/*current-user*)])))
      (events/publish-event! :event/notification-unsubscribe {:object {:id notification-id}
                                                              :user-id api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/unsubscribe"
  "Unsubscribe current user from a notification."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
