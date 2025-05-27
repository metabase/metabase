(ns metabase.notification.api.notification
  "/api/notification endpoints"
  (:require
   [clojure.data :refer [diff]]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.core :as channel]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.models.channel :as models.channel]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.template.core :as channel.template]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.payload.impl.system-event :as notification.system-event]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (com.github.jknack.handlebars HandlebarsException)))

(set! *warn-on-reflection* true)

(defn get-notification
  "Get a notification by id."
  [id]
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

(defn- card-notification?
  [notification]
  (= :notification/card (:payload_type notification)))

(defn list-notifications
  "List notifications. See `GET /` for parameters."
  [{:keys [creator_id creator_or_recipient_id recipient_id card_id
           payload_type include_inactive legacy-active legacy-user-id
           table_id]}]
  (->> (t2/reducible-select :model/Notification
                            (cond-> {:select-distinct [:notification.*]}
                              creator_id
                              (sql.helpers/where [:= :notification.creator_id creator_id])

                              recipient_id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:= :notification_recipient.user_id recipient_id]))

                              creator_or_recipient_id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:or [:= :notification_recipient.user_id creator_or_recipient_id]
                                                      [:= :notification.creator_id creator_or_recipient_id]]))

                              card_id
                              (-> (sql.helpers/left-join
                                   :notification_card
                                   [:and
                                    [:= :notification_card.id :notification.payload_id]
                                    [:= :notification.payload_type "notification/card"]])
                                  (sql.helpers/where [:= :notification_card.card_id card_id]))

                              table_id
                              (-> (sql.helpers/left-join
                                   :notification_system_event
                                   [:and
                                    [:= :notification_system_event.id :notification.payload_id]
                                    [:= :notification.payload_type "notification/system-event"]])
                                  (sql.helpers/where [:= :notification_system_event.table_id table_id]))

                              (and (nil? legacy-active) (not (true? include_inactive)))
                              (sql.helpers/where [:= :notification.active true])

                              payload_type
                              (sql.helpers/where [:= :notification.payload_type (u/qualified-name payload_type)])

                              ;; legacy-active and legacy-user-id only used by alert api, will be removed soon
                              (some? legacy-active)
                              (sql.helpers/where [:= :notification.active legacy-active])

                              legacy-user-id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:or
                                                      [:= :notification_recipient.user_id legacy-user-id]
                                                      [:= :notification.creator_id legacy-user-id]]))))

       (into [] (comp
                 (map t2.realize/realize)
                 (filter mi/can-read?)))
       models.notification/hydrate-notification))

(api.macros/defendpoint :get "/"
  "List notifications.
  - `creator_id`: if provided returns only notifications created by this user
  - `recipient_id`: if provided returns only notification that has recipient_id as a recipient
  - `creator_or_recipient_id`: if provided returns only notification that has user_id as creator or recipient
  - `card_id`: if provided returns only notification that has card_id as payload
  - `table_id`: if provided returns only system event notification that is associated with a table
  - `payload_type`: if provided returns only notification with this payload type"
  [_route-params
   {:keys [creator_id creator_or_recipient_id recipient_id card_id table_id include_inactive payload_type]} :-
   [:map
    [:creator_id              {:optional true} ms/PositiveInt]
    [:recipient_id            {:optional true} ms/PositiveInt]
    [:creator_or_recipient_id {:optional true} ms/PositiveInt]
    [:card_id                 {:optional true} ms/PositiveInt]
    [:table_id                {:optional true} ms/PositiveInt]
    [:include_inactive        {:optional true} ms/BooleanValue]
    [:payload_type            {:optional true} [:maybe (into [:enum] models.notification/notification-types)]]]]
  (list-notifications {:creator_id              creator_id
                       :recipient_id            recipient_id
                       :creator_or_recipient_id creator_or_recipient_id
                       :card_id                 card_id
                       :include_inactive        include_inactive
                       :payload_type            payload_type
                       :table_id                table_id}))

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
                (or (-> recipient :user :email) (t2/select-one-fn :email :model/User (:user_id recipient)))
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
         (update notification :payload t2/hydrate :card) recipients-except-creator @api/*current-user*)))))

(api.macros/defendpoint :post "/"
  "Create a new notification, return the created notification."
  [_route _query body :- ::models.notification/FullyHydratedNotification]
  (api/create-check :model/Notification body)
  (let [notification (models.notification/hydrate-notification
                      (models.notification/create-notification!
                       (-> body
                           (assoc :creator_id api/*current-user-id*)
                           (dissoc :handlers :subscriptions))
                       (:subscriptions body)
                       (:handlers body)))]
    (when (card-notification? notification)
      (send-you-were-added-card-notification-email! notification))
    (events/publish-event! :event/notification-create {:object notification :user-id api/*current-user-id*})
    notification))

(defn- sample-payload
  "Generate a sample payload for a notification."
  [notification channel-type]
  (case (:payload_type notification)
    :notification/system-event
    (channel/template-context (:payload_type notification)
                              channel-type
                              (notification.system-event/sample-payload notification))

    ;; else
    (binding [notification.payload.execute/*query-max-bare-rows* 2]
      (channel/template-context channel-type
                                (:payload_type notification)
                                (notification/notification-payload notification)))))

(api.macros/defendpoint :post "/payload"
  "Return the payload of a notification"
  [_route _query {:keys [notification channel_types]} :- [:map {:closed true}
                                                          [:notification ::models.notification/NotificationWithPayload]
                                                          [:channel_types [:sequential :string]]]]
  (api/create-check :model/Notification notification)
  (let [channel_types (map keyword channel_types)]
    (zipmap channel_types
            (map (fn [channel-type]
                   {:payload (sample-payload notification channel-type)
                    :schema  (api.macros/schema->json-schema (notification/notification-payload-schema notification))})
                 channel_types))))

(defn- sample-recipient
  [channel-type]
  (case channel-type
    :channel/email
    {:type :notification-recipient/user
     :user_id 13371337
     :user    {:first_name "Bot"
               :last_name  "Meta"
               :email      "bot@metabase.com"}}

    :channel/slack
    {:type :notificaiton-recipient/raw-value
     :details {:value "#metabase-example-channel"}}))

(api.macros/defendpoint :post "/preview_template"
  "Preview a notification payload. Optionally can provide a custom input for rendering"
  [_route _query
   {:keys [notification template custom_context]} :- [:map
                                                      [:notification ::models.notification/NotificationWithPayload]
                                                      [:template ::models.channel/ChannelTemplate]
                                                      [:payload {:optional true} :any]]]
  (api/create-check :model/Notification notification)
  (let [sample-notification-context (if custom_context
                                      (api.macros/decode-and-validate-params
                                       :body
                                       (notification/notification-payload-schema notification)
                                       custom_context)
                                      (sample-payload notification (:channel_type template)))
        rendered                    (try
                                      (first (channel/render-notification
                                              (:channel_type template)
                                              (:payload_type notification)
                                              sample-notification-context
                                              template
                                              [(sample-recipient (:channel_type template))]))
                                      (catch HandlebarsException e
                                        (throw (ex-info (tru "Failed to render template: {0}" (channel.template/humanize-error-message e))
                                                        {:status-code 400})))
                                      (catch Throwable e
                                        (throw (ex-info (tru "Failed to render template: {0}" (ex-message e))
                                                        {:status-code 400}))))]

    {:context  sample-notification-context
     :rendered rendered}))

(defn- notify-notification-updates!
  "Send notification emails based on changes between updated and existing notification"
  [updated-notification existing-notification]
  (when (channel.settings/email-configured?)
    (let [was-active?  (:active existing-notification)
          is-active?   (:active updated-notification)
          current-user @api/*current-user*
          old-emails   (all-email-recipients existing-notification)
          new-emails   (all-email-recipients updated-notification)
          notification (update existing-notification :payload t2/hydrate :card)]
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

(api.macros/defendpoint :put "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- ::models.notification/FullyHydratedNotification]
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (models.notification/update-notification! existing-notification body)
    (when (card-notification? existing-notification)
      (notify-notification-updates! body existing-notification))
    (u/prog1 (get-notification id)
      (events/publish-event! :event/notification-update {:object          <>
                                                         :previous-object existing-notification
                                                         :user-id         api/*current-user-id*}))))

(api.macros/defendpoint :post "/:id/send"
  "Send a notification by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   {:keys [handler_ids]} :- [:map [:handler_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (let [notification (get-notification id)]
    (api/read-check notification)
    (cond-> notification
      (seq handler_ids)
      (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers)))

      true
      (notification/send-notification! :notification/sync? true))))

(api.macros/defendpoint :post "/default_template"
  "Get default templates for a notification."
  [_params
   _query
   {:keys [notification channel_types] :as _body} :- [:map
                                                      [:notification ::models.notification/NotificationWithPayload]
                                                      [:channel_types {:optional true} [:sequential :keyword]]]]
  (zipmap channel_types
          (map #(channel.template/default-template (:payload_type notification) (:payload notification) %) channel_types)))

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

(api.macros/defendpoint :post "/send"
  "Send an unsaved notification."
  [_route _query body :- ::models.notification/FullyHydratedNotification]
  (api/create-check :model/Notification body)
  (models.notification/validate-email-handlers! (:handlers body))
  (-> body
      (assoc :creator_id api/*current-user-id*)
      promote-to-t2-instance
      (notification/send-notification! :notification/sync? true)))

(defn unsubscribe-user!
  "Unsubscribe a user from a notification."
  [notification-id user-id]
  (let [notification (get-notification notification-id)]
    (api/check-403 (models.notification/current-user-is-recipient? notification))
    (models.notification/unsubscribe-user! notification-id user-id)
    (when (card-notification? notification)
      (u/ignore-exceptions
        (messages/send-you-unsubscribed-notification-card-email!
         notification
         [(:email @api/*current-user*)])))
    (events/publish-event! :event/notification-unsubscribe {:object {:id notification-id}
                                                            :user-id api/*current-user-id*})
    notification))

(api.macros/defendpoint :post "/:id/unsubscribe"
  "Unsubscribe current user from a notification."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
