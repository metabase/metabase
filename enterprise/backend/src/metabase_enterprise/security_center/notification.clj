(ns metabase-enterprise.security-center.notification
  "Sends notifications for security advisories that match (active/error).
   Handles both the initial notification on status change and repeat
   notifications via the Quartz task.

   Rather than going through the seeded event→notification pipeline, this
   namespace constructs notifications directly so it can resolve recipients
   dynamically from the `security-center-email-recipients` setting and the
   `security-center-slack-channel` setting. The site admin email is included
   as a recipient when set, but only if `security-center-email-recipients`
   targets the admin group (i.e. \"Send to all instance admins\" is on)."
  (:require
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.analytics.core :as analytics]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.permissions.core :as perms]
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

(defn- sends-to-all-admins?
  "True if the recipient list targets the admin group — i.e. \"Send to all
   instance admins\" is on. Checked against the un-hydrated recipients so we
   don't depend on hydration ordering."
  [recipients]
  (let [admin-group-id (:id (perms/admin-group))]
    (boolean
     (some (fn [{:keys [type permissions_group_id]}]
             (and (= type :notification-recipient/group)
                  (= permissions_group_id admin-group-id)))
           recipients))))

(defn- compute-email-recipients
  "Resolve email recipients from the given configured list. When that list
   targets the admin group (\"Send to all instance admins\" is on) and the
   site admin email is set, the admin email is appended as a raw-value
   recipient. When the toggle is off, only the explicitly configured
   recipients are used."
  [configured-recipients]
  (let [raw         (or configured-recipients [])
        configured  (or (some-> (not-empty raw) (t2/hydrate :recipients-detail))
                        [])
        admin-email (system/admin-email)]
    (if (and admin-email (sends-to-all-admins? raw))
      (conj (vec configured) {:type    :notification-recipient/raw-value
                              :details {:value admin-email}})
      configured)))

(defn- compute-slack-recipients
  "Resolve Slack recipient from the given channel name.
   Returns a vector with a single raw-value recipient, or nil if Slack is not configured."
  [channel]
  (when (and channel (setting/get-value-of-type :boolean :slack-token-valid?))
    [{:type    :notification-recipient/raw-value
      :details {:value channel}}]))

(defn- build-handlers
  "Build the notification handlers (email + optional Slack) from the given
   configured email recipients and Slack channel."
  [{:keys [email-recipients slack-channel]}]
  (let [handlers (when (channel.settings/email-configured?)
                   [{:channel_type :channel/email
                     :template     email-template
                     :recipients   (compute-email-recipients email-recipients)}])]
    (if-let [slack-recipients (compute-slack-recipients slack-channel)]
      (conj handlers {:channel_type :channel/slack
                      :recipients   slack-recipients})
      handlers)))

(defn- build-notification
  "Build a notification map for a security advisory. This is a plain map (not a
   Toucan2 instance), so `send-notification!` skips DB hydration and uses it as-is."
  [advisory config]
  {:payload_type :notification/system-event
   :payload      {:event_info  (advisory-event-info advisory)
                  :event_topic :event/security-advisory-match}
   :handlers     (build-handlers config)})

(def ^:private channel-type->name
  "Map channel_type keywords to short names for Snowplow tracking."
  {:channel/email "email"
   :channel/slack "slack"})

(defn- track-notification-sent!
  "Track a Snowplow event for each channel in the notification's handlers."
  [notification triggered-from result]
  (doseq [{:keys [channel_type]} (:handlers notification)]
    (analytics/track-event! :snowplow/simple_event
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

(defn- saved-config
  "Read the email recipients and Slack channel from the persisted settings."
  []
  {:email-recipients (settings/security-center-email-recipients)
   :slack-channel    (settings/security-center-slack-channel)})

(defn send-test-notification!
  "Send a test notification through the given channels so admins can verify
   delivery without waiting for a real advisory. Does NOT publish an audit event
   or update any advisory row.

   `config` is a map of `{:email-recipients [...] :slack-channel \"...\"}`
   reflecting the (possibly unsaved) form state in the notification config dialog."
  [config]
  (let [notif (build-notification test-advisory config)]
    (when (empty? (:handlers notif))
      (throw (ex-info "No notification channels are configured."
                      {:status-code 400})))
    (log/info "Sending test security center notification")
    (try
      (notification/send-notification! notif :notification/sync? true)
      (track-notification-sent! notif "test" "success")
      (catch Exception e
        (track-notification-sent! notif "test" "failure")
        (throw e)))))

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
   (let [notif (build-notification advisory (saved-config))]
     (try
       (notification/send-notification! notif :notification/sync? true)
       (track-notification-sent! notif triggered-from "success")
       (t2/update! :model/SecurityAdvisory (:id advisory)
                   {:last_notified_at (mi/now)})
       (catch Exception e
         (track-notification-sent! notif triggered-from "failure")
         (throw e))))))
