(ns metabase-enterprise.security-center.notification
  "Sends notifications for security advisories that match (active/error).
   Handles both the initial notification on status change and repeat
   notifications via the Quartz task.

   Rather than going through the seeded event→notification pipeline, this
   namespace constructs notifications directly so it can resolve recipients
   dynamically from the `security-center-email-recipients` setting (nil = all
   admins, non-nil = specific email list) and the `security-center-slack-channel`
   setting."
  (:require
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.send :as notification.send]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- advisory-event-info
  "Build the event-info map for a security advisory notification."
  [advisory]
  {:object (select-keys advisory [:advisory_id :severity :title :description
                                  :match_status :advisory_url :remediation
                                  :affected_versions])})

(def ^:private email-template
  "Inline template definition for the security advisory email."
  {:details {:type           "email/handlebars-resource"
             :subject        "[{{payload.custom.severity_label}}] Security Advisory: {{payload.event_info.object.title}}"
             :path           "metabase/channel/email/security_advisory.hbs"
             :recipient-type "cc"}})

(defn- email-recipients
  "Resolve email recipients from the `security-center-email-recipients` setting.
   nil → all admins (admin group). Non-nil → the specific email addresses."
  []
  (if-let [emails (settings/security-center-email-recipients)]
    (mapv (fn [email] {:type    :notification-recipient/raw-value
                       :details {:value email}})
          emails)
    [{:type                 :notification-recipient/group
      :permissions_group_id (:id (perms/admin-group))}]))

(defn- slack-recipients
  "Resolve Slack recipient from the `security-center-slack-channel` setting.
   Returns a vector with a single raw-value recipient, or empty if Slack is not configured."
  []
  (when-let [channel (settings/security-center-slack-channel)]
    (when (setting/get-value-of-type :boolean :slack-token-valid?)
      [{:type    :notification-recipient/raw-value
        :details {:value channel}}])))

(defn- build-handlers
  "Build the notification handlers (email + optional Slack) with dynamically resolved recipients."
  []
  (let [handlers [{:channel_type :channel/email
                   :template     email-template
                   :recipients   (email-recipients)}]]
    (if-let [slack-recipients (slack-recipients)]
      (conj handlers {:channel_type :channel/slack
                      :recipients   slack-recipients})
      handlers)))

(defn- build-notification
  "Build a notification map for a security advisory. This is a plain map (not a
   Toucan2 instance), so `send-notification!` skips DB hydration and uses it as-is."
  [advisory]
  {:payload_type :notification/system-event
   :payload      {:event_info  (advisory-event-info advisory)
                  :event_topic :event/security-advisory-match}
   :handlers     (build-handlers)})

(defn notify-advisory!
  "Send notifications for a security advisory and update `last_notified_at`.
   Publishes the system event for audit logging, then sends email (to admins or
   configured recipients) and Slack (to configured channel) via the notification
   pipeline."
  [advisory]
  (log/infof "Sending notification for advisory %s (severity=%s, status=%s)"
             (:advisory_id advisory) (name (:severity advisory)) (name (:match_status advisory)))
  ;; Publish event for audit log
  (events/publish-event! :event/security-advisory-match
                         (advisory-event-info advisory))
  ;; Send email + Slack via notification pipeline
  (notification.send/send-notification! (build-notification advisory))
  (t2/update! :model/SecurityAdvisory (:id advisory)
              {:last_notified_at (mi/now)}))
