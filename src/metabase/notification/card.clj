(ns metabase.notification.card
  (:require
   [metabase.api.common :as api]
   [metabase.notification.models :as models.notification]
   [metabase.util.log :as log]))

(defn card-notifications
  "The notifications of the alerts on `card`."
  [card]
  (models.notification/notifications-for-card (:id card)))

(defn- recipient-email
  "The email address `recipient` of an email handler receives alerts at."
  [recipient]
  (case (:type recipient)
    :notification-recipient/user      (-> recipient :user :email)
    :notification-recipient/raw-value (-> recipient :details :value)
    (throw (ex-info "Unknown recipient type" {:recipient recipient}))))

(defn- email-recipients
  "The addresses that the email handlers of `notifications` send to."
  [notifications]
  (->> notifications
       (mapcat :handlers)
       (filter #(= :channel/email (:channel_type %)))
       (mapcat :recipients)
       (keep recipient-email)))

(defn notify-card-notifications-deleted!
  "Emails the recipients of `notifications`, the alerts of `card` that were deleted, that they stopped, because the
  Card was archived when `reason` is `:card-archived` and because it was changed when it is `:card-changed`. The email namespace is loaded on first use, since the channel
  module reaches the Card hooks that call this."
  [reason actor card notifications]
  (when (seq notifications)
    (try
      (let [send-message! (case reason
                            :card-archived (requiring-resolve 'metabase.channel.email.messages/send-alert-stopped-because-archived-email!)
                            :card-changed  (requiring-resolve 'metabase.channel.email.messages/send-alert-stopped-because-changed-email!))
            with-links    (remove #(true? (get-in % [:payload :disable_links])) notifications)
            without-links (filter #(true? (get-in % [:payload :disable_links])) notifications)]
        (send-message! card
                       (email-recipients with-links)
                       (email-recipients without-links)
                       (or actor (when api/*current-user-id* @api/*current-user*))))
      (catch Throwable e
        (log/errorf "Error sending notification email: %s" (ex-message e))))))
