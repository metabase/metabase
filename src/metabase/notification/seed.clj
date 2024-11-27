(ns metabase.notification.seed
  "Seed default notifications on startup.
  Will truncate al notifications related tables then reinsert the default notifications."
  (:require
   [metabase.db :as db]
   [metabase.models.notification :as models.notification]
   [metabase.models.permissions-group :as perms-group]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private default-notifications
  (delay [;; user invited
          {:notification  {:payload_type :notification/system-event}
           :subscriptions [{:type            :notification-subscription/system-event
                            :event_name      :event/user-invited}]
           :handlers      [{:channel_type :channel/email
                            :channel_id   nil
                            :template     {:name         "User joined Email template"
                                           :channel_type :channel/email
                                           :details      {:type           "email/handlebars-resource"
                                                          :subject        "{{payload.custom.user_invited_email_subject}}"
                                                          :path           "metabase/email/new_user_invite.hbs"
                                                          :recipient-type :cc}
                                           :created_at   :%now
                                           :updated_at   :%now}
                            :recipients   [{:type    :notification-recipient/template
                                            :details {:pattern "{{payload.event_info.object.email}}"}}]}]}
          ;; alert created
          {:notification  {:payload_type :notification/system-event}
           :subscriptions [{:type            :notification-subscription/system-event
                            :event_name      :event/alert-create}]
           :handlers      [{:channel_type :channel/email
                            :channel_id   nil
                            :template     {:name         "Alert Created Email template"
                                           :channel_type "channel/email"
                                           :details      {:type           "email/handlebars-resource"
                                                          :subject        "You set up an alert"
                                                          :path           "metabase/email/alert_new_confirmation.hbs"
                                                          :recipient-type :cc}
                                           :created_at   :%now
                                           :updated_at   :%now}
                            :recipients   [{:type    :notification-recipient/template
                                            :details {:pattern "{{payload.event_info.user.email}}"}}]}]}

          ;; slack token invalid
          {:notification  {:payload_type :notification/system-event}
           :subscriptions [{:type            :notification-subscription/system-event
                            :event_name      :event/slack-token-invalid}]
           :handlers      [{:channel_type    :channel/email
                            :channel_id      nil
                            :template        {:name         "Slack Token Error Email template"
                                              :channel_type "channel/email"
                                              :details      {:type           "email/handlebars-resource"
                                                             :subject        "Your Slack connection stopped working"
                                                             :path           "metabase/email/slack_token_error.hbs"
                                                             :recipient-type :cc}
                                              :created_at   :%now
                                              :updated_at   :%now}
                            :recipients      [{:type    :notification-recipient/template
                                               :details {:pattern     "{{context.admin_email}}"
                                                         :is_optional true}}
                                              {:type                 :notification-recipient/group
                                               :permissions_group_id (:id (perms-group/admin))}]}]}]))

(def ^:private notification-related-models
  [:model/Notification
   :model/NotificationHandler
   :model/NotificationSubscription
   :model/NotificationRecipient
   :model/ChannelTemplate])

(defn- truncate-table!
  "Truncate a table and restart the identity column."
  [table-name]
  (case (db/db-type)
    :postgres
    (t2/query {:truncate [table-name :restart :identity :cascade]})
    :mysql
    (do
      (t2/delete! table-name)
      (t2/query (format "ALTER TABLE `%s` AUTO_INCREMENT = 1" (name table-name))))
    (do
      (t2/delete! table-name)
      (t2/query {:alter-table [table-name {:alter-column [:id :restart :with 1]}]}))))

(defn- truncate-notification-related-tables!
  []
  (doseq [model notification-related-models
          :let [table (t2/table-name model)]]
    (log/infof "Truncating table %s" table)
    (truncate-table! table)))

(defn- create-notification!
  [{:keys [notification subscriptions handlers]}]
  (let [handlers (for [handler handlers]
                   (if-let [template (:template handler)]
                     (-> handler
                         (dissoc :template)
                         (assoc :template_id (t2/insert-returning-pk!
                                              :model/ChannelTemplate
                                              template)))
                     handler))]
    (models.notification/create-notification! notification subscriptions handlers)))

(defn- seed-notification!
  "Seed default notifications"
  []
  (log/info "Seeding default notifications")
  (doseq [row @default-notifications]
    (create-notification! row))
  (log/infof "Seeded %d notifications" (count @default-notifications)))

(defn truncate-then-seed-notification!
  "Truncate all notifications related tables then seed it with the default notifications.
  Runs on every deployment by metabase.task.seed_notification.

  We do this instead of migrations because we want to be able to modify the default notifications
  without having to write migrations.

  This is possible because as of now users can't modify notifications or channel template."
  []
  (t2/with-transaction []
    (truncate-notification-related-tables!)
    (seed-notification!)))
