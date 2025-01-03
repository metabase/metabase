(ns metabase.notification.seed
  "Seed default notifications on startup.
  No-op if none of the notifications are changed.
  If a notification is changed, it will be replaced with a new one."
  (:require
   [metabase.models.notification :as models.notification]
   [metabase.models.permissions-group :as perms-group]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private model->compare-keys
  "A mapping of model to the keys that are used to check if a row is the same."
  {:model/Notification             [:payload_type :active]
   :model/NotificationSubscription [:type :event_name :cron_schedule]
   :model/NotificationHandler      [:channel_type :active]
   :model/NotificationRecipient    [:type :user_id :permissions_group_id :details]
   :model/Channel                  [:channel_type :details]
   :model/ChannelTemplate          [:channel_type :name :details]})

(defn- select-keys-nil-vals
  "Select keys from a map, missing keys are included with value = nil."
  [m ks]
  (merge (into {} (zipmap ks (repeat nil)))
         (select-keys m ks)))

(defn- sanitize-model
  [model data]
  (select-keys-nil-vals data (get model->compare-keys model)))

(defn- sanitize-notification
  [{:keys [subscriptions handlers] :as notification}]
  (assoc (sanitize-model :model/Notification notification)
         :subscriptions (set (mapv #(sanitize-model :model/NotificationSubscription %) subscriptions))
         :handlers      (set (mapv (fn [{:keys [channel template recipients] :as handler}]
                                     (assoc (sanitize-model :model/NotificationHandler handler)
                                            :channel    (sanitize-model :model/Channel channel)
                                            :template   (sanitize-model :model/ChannelTemplate template)
                                            :recipients (set (mapv #(sanitize-model :model/NotificationRecipient %) recipients))))
                                   handlers))))

;; use json to compare to avoid any difference like keywordizing vs string
(def ^:private serialize-notification (comp json/encode sanitize-notification))

(def ^:private default-notifications
  "List of notifications that are seeded into the database on startup.
  This list should only be modified or appended, never removed.
  In order to remove a notification, it should be marked as inactive."
  (delay [;; user invited
          {:internal_id   "system-event/user-invited"
           :active        true
           :payload_type  :notification/system-event
           :subscriptions [{:type       :notification-subscription/system-event
                            :event_name :event/user-invited}]
           :handlers      [{:active       true
                            :channel_type :channel/email
                            :channel_id   nil
                            :template     {:name         "User joined Email template"
                                           :channel_type :channel/email
                                           :details      {:type           "email/handlebars-resource"
                                                          :subject        "{{payload.custom.user_invited_email_subject}}"
                                                          :path           "metabase/email/new_user_invite.hbs"
                                                          :recipient-type "cc"}}
                            :recipients   [{:type    :notification-recipient/template
                                            :details {:pattern "{{payload.event_info.object.email}}"}}]}]}

          ;; alert new confirmation
          {:internal_id   "system-event/alert-new-confirmation"
           :active        true
           :payload_type  :notification/system-event
           :subscriptions [{:type       :notification-subscription/system-event
                            :event_name :event/alert-create}]
           :handlers      [{:active       true
                            :channel_type :channel/email
                            :channel_id   nil
                            :template     {:name         "Alert Created Email template"
                                           :channel_type "channel/email"
                                           :details      {:type "email/handlebars-resource"
                                                          :subject "You set up an alert"
                                                          :path "metabase/email/alert_new_confirmation.hbs"
                                                          :recipient-type "cc"}}
                            :recipients  [{:type    :notification-recipient/template
                                           :details {:pattern "{{payload.event_info.user.email}}"}}]}]}

          ;; slack token invalid
          {:internal_id   "system-event/slack-token-error"
           :active        true
           :payload_type  :notification/system-event
           :subscriptions [{:type       :notification-subscription/system-event
                            :event_name :event/slack-token-invalid}]
           :handlers      [{:active       true
                            :channel_type :channel/email
                            :channel_id   nil
                            :template     {:name         "Slack Token Error Email template"
                                           :channel_type "channel/email"
                                           :details      {:type "email/handlebars-resource"
                                                          :subject "Your Slack connection stopped working"
                                                          :path "metabase/email/slack_token_error.hbs"
                                                          :recipient-type "cc"}}
                            :recipients   [{:type    :notification-recipient/template
                                            :details {:pattern "{{context.admin_email}}" :is_optional true}}
                                           {:type                 :notification-recipient/group
                                            :permissions_group_id (:id (perms-group/admin))}]}]}]))

(defn- cleanup-notification!
  [internal-id existing-row]
  (t2/delete! :model/Notification :internal_id internal-id)
  (when-let [template-ids (->> existing-row :handlers (keep (comp :id :template)) seq)]
    (t2/delete! :model/ChannelTemplate :id [:in template-ids])))

(defn- create-notification!
  [notification]
  (let [handlers (for [handler (:handlers notification)]
                   (if-let [template (:template handler)]
                     (-> handler
                         (dissoc :template)
                         (assoc :template_id (t2/insert-returning-pk!
                                              :model/ChannelTemplate
                                              template)))
                     handler))]
    (models.notification/create-notification!
     (dissoc notification :handlers :subscriptions)
     (:subscriptions notification)
     handlers)))

(defn- replace-notification!
  "Replace an existing notification with a new one"
  [existing-row {:keys [internal_id] :as new-row}]
  (cleanup-notification! internal_id existing-row)
  (create-notification! new-row))

(defn- action
  [existing-row new-row]
  (cond
    (nil? existing-row)
    :create
    (not= (serialize-notification existing-row) (serialize-notification new-row))
    :replace
    :else
    :skip))

(defn- hydrate-notification
  [notification]
  (t2/hydrate notification
              :subscriptions
              [:handlers :channel :template :recipients]))

(defn- sync-notification!
  [{:keys [internal_id] :as row}]
  (let [existing-notification (some-> (t2/select-one :model/Notification :internal_id internal_id)
                                      hydrate-notification)]

    (u/prog1 (action existing-notification row)
      (case <>
        :create
        (do
          (log/debugf "Creating notification %s" internal_id)
          (create-notification! row))
        :replace
        (do
          (log/debugf "Replacing notification %s" internal_id)
          (replace-notification! existing-notification row))
        :skip
        (log/debugf "Skipping notification %s" internal_id)))))

(defn seed-notification!
  "Seed default notifications into the database.
  If a notification already exists, it'll be replaced if it's changed, otherwise it'll be skipped."
  []
  (log/info "Seeding default notifications")
  (let [actions (t2/with-transaction []
                  (doall (for [row @default-notifications]
                           (sync-notification! row))))
        summary (frequencies actions)]
    (log/infof "Seeded notifications: %s" summary)
    summary))
