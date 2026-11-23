(ns metabase.queries.events.cards-notification-deleted-on-card-save
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/card-update.notification-deleted.card-archived ::event)
(events/derive! :event/card-update.notification-deleted.card-changed ::event)

(defn- recipient-emails
  "The email address of each recipient of the email handlers of `notifications`."
  [notifications]
  (->> notifications
       (mapcat :handlers)
       (filter #(= :channel/email (:channel_type %)))
       (mapcat :recipients)
       (keep (fn [recipient]
               (case (:type recipient)
                 :notification-recipient/user
                 (-> recipient :user :email)
                 :notification-recipient/raw-value
                 (-> recipient :details :value)
                 (throw (ex-info "Unknown recipient type" {:recipient recipient})))))))

(defn- send-alert-deleted-email!
  "Emails the recipients of `notifications`, the alerts of `card` that its save deleted."
  [topic card notifications actor]
  (try
    (let [send-message!            (case topic
                                     :event/card-update.notification-deleted.card-archived
                                     messages/send-alert-stopped-because-archived-email!

                                     :event/card-update.notification-deleted.card-changed
                                     messages/send-alert-stopped-because-changed-email!)
          recipients               (recipient-emails (filter #((complement true?) (get-in % [:payload :disable_links]))
                                                             notifications))
          recipients-with-no-links (recipient-emails (filter #(true? (get-in % [:payload :disable_links]))
                                                             notifications))]
      (send-message! card recipients recipients-with-no-links actor))
    (catch Throwable e
      (log/errorf "Error sending notification email: %s" (ex-message e)))))

(methodical/defmethod events/publish-event! ::event
  "Emails the recipients of the alerts that the save of Cards deleted, for each Card of the event's `:objects`; an event
  without them is one such Card."
  [topic {:keys [objects actor], :as event}]
  (doseq [{:keys [card notifications]} (or objects [event])]
    (send-alert-deleted-email! topic card notifications actor)))
