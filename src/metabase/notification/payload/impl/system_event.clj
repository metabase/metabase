(ns metabase.notification.payload.impl.system-event
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.urls :as urls]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.session.core :as session]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.users.models.user :as user]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]))

(defn- join-url
  [user-id redirect]
  ;; TODO: the reset token should come from the event-info, not generated here!
  (let [reset-token               (user/set-password-reset-token! user-id)
        should-link-to-login-page (and (sso/sso-enabled?)
                                       (not (session/enable-password-login)))]
    (if should-link-to-login-page
      (str (system/site-url) "/auth/login")
      ;; NOTE: the new user join url is a password reset route with an indicator that this is a first time user.
      (str (user/form-password-reset-url reset-token)
           (when redirect (str "?redirect=" redirect))
           "#new"))))

(defn- custom-payload
  "Returns a map of custom payload for a given topic and event-info.
  Custom are set of contexts that are specific to certain emails.
  Currently we need it to support usecases that our template engines doesn't support such as i18n,
  but ideally this should be part of the template."
  [topic event-info]
  (let [{user-id :id from-setup :is_from_setup} (:object event-info)]
    (case topic
      :event/user-invited
      {:user_invited_email_subject (trs "You''re invited to join {0}''s {1}" (appearance/site-name) (messages/app-name-trs))
       :user_invited_join_url      (join-url user-id (when from-setup "/admin/databases/create"))}
      :event/security-advisory-match
      (let [{:keys [severity match_status]} (:object event-info)]
        {:severity_label     (case severity
                               :critical (trs "Critical")
                               :high     (trs "High")
                               :medium   (trs "Medium")
                               :low      (trs "Low"))
         :severity_color     (case severity
                               :critical "#E65050"
                               :high     "#F0830E"
                               :medium   "#F0C431"
                               :low      "#509EE3")
         :status_label       (case match_status
                               :active (trs "Active")
                               :error  (trs "Error"))
         :security_center_url (urls/security-center-url)})
      {})))

(mu/defmethod notification.payload/payload :notification/system-event
  [notification-info :- ::notification.payload/Notification]
  (let [payload                          (:payload notification-info)
        {:keys [event_topic event_info]} payload]
    (assoc payload :custom (custom-payload event_topic event_info))))
