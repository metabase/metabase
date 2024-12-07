(ns metabase.notification.seed
  "Seed default notifications on startup.
  Will truncate al notifications related tables then reinsert the default notifications."
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.db :as db]
   [metabase.models.notification :as models.notification]
   [metabase.models.permissions-group :as perms-group]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private model->id-keys
  {:model/Notification             [:internal_id :payload_type #_:handlers
                                    ;; hydrated keys
                                    #_:subscriptions]
   :model/NotificationSubscription [:type :event_name :cron_schedule]
   :model/NotificationHandler      [:channel_type #_:channel_id #_:template_id
                                    ;; hydrated keys
                                    #_:recipients]
   :model/NotificationRecipient    [:type :user_id :permissions_group_id :details]
   :model/Channel                  [:channel_type :details]
   :model/ChannelTemplate          [:channel_type :details]})

(defn- strip-data
  [data]
  (walk/postwalk
   (fn [x]
     (if (t2/instance? x)
       (let [model (t2/model x)]
         (t2/instance model (select-keys x (get model->id-keys model))))
       x))
   data))

(defn- select-keys-nil-vals
  "Select keys from a map, missing keys are included with value = nil."
  [m ks]
  (merge (into {} (zipmap ks (repeat nil)))
         (select-keys m ks)))

(defn strip-model
  [model data]
  (select-keys-nil-vals data (get model->id-keys model)))

(select-keys-nil-vals {:a 1} [:a :b])

(defn- sanitize-notification
  [{:keys [subscriptions handlers] :as notification}]
  (assoc (strip-model :model/Notification notification)
         :subscriptions (map #(strip-model :model/NotificationSubscription %) subscriptions)
         :handlers      (map (fn [{:keys [channel template recipients] :as handler}]
                               (assoc (strip-model :model/NotificationHandler handler)
                                      :channel (strip-model :model/Channel channel)
                                      :template (strip-model :model/ChannelTemplate template)
                                      :recipients (map #(strip-model :model/NotificationRecipient %) recipients)))
                             handlers)))
#_(clojure.test/is (= (sanitize-notification (t2/hydrate (t2/select-one :model/Notification)
                                                         :subscriptions
                                                         [:handlers :recipients :channel :template]))
                      (sanitize-notification (reshape (first @default-notifications)))))

(defn- reshape
  [{:keys [payload_type notification subscriptions handlers]}]
  (assoc notification
         :payload_type payload_type
         :subscriptions subscriptions
         :handlers handlers))

(def ^:private default-notifications
  (delay [;; user invited
          {:payload_type  :notification/system-event
           :subscriptions [{:type       :notification-subscription/system-event
                            :event_name :event/user-invited}]
           :handlers      [{:channel_type :channel/email
                            :channel_id   nil
                            :template     {:name "User joined Email template"
                                           :channel_type :channel/email
                                           :details
                                           {:type "email/handlebars-resource"
                                            :subject "{{payload.custom.user_invited_email_subject}}"
                                            :path "metabase/email/new_user_invite.hbs"
                                            :recipient-type "cc"}
                                           :created_at :%now
                                           :updated_at :%now}
                            :recipients   [{:type :notification-recipient/template
                                            :details {:pattern "{{payload.event_info.object.email}}"}}]}]}
          ;; alert new confirmation
          {:internal_id "system-event/alert-new-confirmation"
           :payload_type nil
           :subscriptions
           [{:type :notification-subscription/system-event
             :event_name :event/alert-create}]
           :handlers
           [{:channel_type :channel/email
             :channel_id nil
             :template
             {:name "Alert Created Email template"
              :channel_type "channel/email"
              :details
              {:type "email/handlebars-resource"
               :subject "You set up an alert"
               :path "metabase/email/alert_new_confirmation.hbs"
               :recipient-type "cc"}
              :created_at :%now
              :updated_at :%now}
             :recipients
             [{:type :notification-recipient/template
               :details {:pattern "{{payload.event_info.user.email}}"}}]}]}

          ;; slack token invalid
          {:internal_id "system-event/slack-token-error"
           :payload_type nil
           :subscriptions
           [{:type :notification-subscription/system-event
             :event_name :event/slack-token-invalid}]
           :handlers
           [{:channel_type :channel/email
             :channel_id nil
             :template
             {:name "Slack Token Error Email template"
              :channel_type "channel/email"
              :details
              {:type "email/handlebars-resource"
               :subject "Your Slack connection stopped working"
               :path "metabase/email/slack_token_error.hbs"
               :recipient-type :cc}
              :created_at :%now
              :updated_at :%now}
             :recipients
             [{:type :notification-recipient/template
               :details {:pattern "{{context.admin_email}}" :is_optional true}}
              {:type :notification-recipient/group :permissions_group_id (:id (perms-group/admin))}]}]}]))

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
