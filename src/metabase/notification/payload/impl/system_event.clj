(ns metabase.notification.payload.impl.system-event
  (:require
   [clojure.string :as str]
   [metabase.appearance.core :as appearance]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.email.messages :as messages]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.session.core :as session]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.users.models.user :as user]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- join-url
  [user-id redirect]
  ;; TODO: the reset token should come from the event-info, not generated here!
  (let [reset-token               (auth-identity/create-password-reset! user-id)
        should-link-to-login-page (and (sso/sso-enabled?)
                                       (not (session/enable-password-login)))
        email (t2/select-one-fn :email [:model/User :email] user-id)]
    (if should-link-to-login-page
      (str (system/site-url) "/auth/login")
      ;; NOTE: the new user join url is a password reset route with an indicator that this is a first time user.
      (str (user/form-password-reset-url reset-token)
           "?"
           (str/join "&" (remove nil? [(when redirect (str "redirect=" redirect))
                                       (when email (str "email=" email))]))
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
      {})))

(mu/defmethod notification.payload/payload :notification/system-event
  [notification-info :- ::notification.payload/Notification]
  (let [payload                          (:payload notification-info)
        {:keys [event_topic event_info]} payload]
    (assoc payload :custom (custom-payload event_topic event_info))))
