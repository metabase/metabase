(ns metabase-enterprise.security-center.notification
  "Sends notifications for security advisories that match (active/error).
   Handles both the initial notification on status change and repeat
   notifications via the Quartz task.

   Rather than going through the seeded event→notification pipeline, this
   namespace constructs notifications directly so it can resolve recipients
   dynamically from the `security-center-email-recipients` setting and the
   `security-center-slack-channel` setting. The site admin email is always
   included as a recipient when set."
  (:require
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
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
  {:channel_type :channel/email
   :details      {:type           "email/handlebars-resource"
                  :subject        "[{{payload.custom.severity_label}}] Security Advisory: {{payload.event_info.object.title}}"
                  :path           "metabase/channel/email/security_advisory.hbs"
                  :recipient-type "bcc"}})

(defn- email-recipients
  "Resolve email recipients: configured recipients from the setting,
   plus the site admin email (if set) as a raw-value recipient."
  []
  (let [configured (or (some-> (settings/security-center-email-recipients)
                               (t2/hydrate :recipients-detail))
                       [])]
    (if-let [admin-email (system/admin-email)]
      (conj configured {:type    :notification-recipient/raw-value
                        :details {:value admin-email}})
      configured)))

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
  (let [handlers (when (channel.settings/email-configured?)
                   [{:channel_type :channel/email
                     :template     email-template
                     :recipients   (email-recipients)}])]
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

(def ^:private channel-type->name
  "Map channel_type keywords to short names for Snowplow tracking."
  {:channel/email "email"
   :channel/slack "slack"})

(defn- track-notification-sent!
  "Track a Snowplow event for each channel in the notification's handlers."
  [notification triggered-from result]
  (doseq [{:keys [channel_type]} (:handlers notification)]
    (snowplow/track-event! :snowplow/simple_event
                           {:event          "security_advisory_notification_sent"
                            :event_detail   (channel-type->name channel_type)
                            :triggered_from triggered-from
                            :result         result})))

(def ^:private test-advisory
  "A synthetic advisory used for test notifications so admins can verify delivery."
  {:advisory_id      "TEST-0000"
   :severity         :medium
   :title            "[TEST] Test Notification"
   :description      "This is a test notification from the Security Center. If you received this, your notification settings are working correctly. No action is required."
   :match_status     :active
   :advisory_url     nil
   :remediation      "No action required — this is only a test."
   :affected_versions []})

(defn send-test-notification!
  "Send a test notification through the configured channels so admins can verify
   delivery without waiting for a real advisory. Does NOT publish an audit event
   or update any advisory row."
  []
  (let [handlers (build-handlers)]
    (when (empty? handlers)
      (throw (ex-info "No notification channels are configured."
                      {:status-code 400})))
    (log/info "Sending test security center notification")
    (let [notif (build-notification test-advisory)]
      (try
        (notification/send-notification! notif :notification/sync? true)
        (track-notification-sent! notif "test" "success")
        (catch Exception e
          (track-notification-sent! notif "test" "failure")
          (throw e))))))

(defn notify-advisory!
  "Send notifications for a security advisory and update `last_notified_at`.
   Publishes the system event for audit logging, then sends email (to admins or
   configured recipients) and Slack (to configured channel) via the notification
   pipeline."
  ([advisory]
   (notify-advisory! advisory "scheduled"))
  ([advisory triggered-from]
   (log/infof "Sending notification for advisory %s (severity=%s, status=%s)"
              (:advisory_id advisory) (name (:severity advisory)) (name (:match_status advisory)))
   ;; Publish event for audit log
   (events/publish-event! :event/security-advisory-match
                          (advisory-event-info advisory))
   ;; Send email + Slack via notification pipeline
   ;; sync, so failure doesn't set last_notified_at
   (let [notif (build-notification advisory)]
     (try
       (notification/send-notification! notif :notification/sync? true)
       (track-notification-sent! notif triggered-from "success")
       (t2/update! :model/SecurityAdvisory (:id advisory)
                   {:last_notified_at (mi/now)})
       (catch Exception e
         (track-notification-sent! notif triggered-from "failure")
         (throw e))))))
