(ns metabase.notification.payload.system-event
  (:require
   [java-time.api :as t]
   [metabase.email.messages :as messages]
   [metabase.models.user :as user]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.malli :as mu]))

(defn- join-url
  [new-user]
  (let [reset-token               (user/set-password-reset-token! (:id new-user))
        should-link-to-login-page (and (public-settings/sso-enabled?)
                                       (not (public-settings/enable-password-login)))]
    (if should-link-to-login-page
      (str (public-settings/site-url) "/auth/login")
      ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
      (str (user/form-password-reset-url reset-token) "#new"))))

(defn- extra-context
  "Returns a map of extra context for a given topic and event-info.
  Extra are set of contexts that are specific to a certain emails.
  Currently we need it to support usecases that our template engines doesn't support such as i18n,
  but ideally this should be part of the template."
  [topic event-info]
  (case topic
    :event/user-invited
    {:user-invited-today         (t/format "MMM'&nbsp;'dd,'&nbsp;'yyyy" (t/zoned-date-time))
     :user-invited-email-subject (trs "You''re invited to join {0}''s {1}" (public-settings/site-name) (messages/app-name-trs))
     :user-invited-join-url      (join-url (:object event-info))}

    :event/alert-create
    {:alert-create-condition-description (->> event-info :object
                                              messages/pulse->alert-condition-kwd
                                              (get messages/alert-condition-text))}
    {}))

(mu/defmethod notification.payload/payload :notification/system-event
  [notification-info :- notification.payload/Notification]
  (let [payload                          (:payload notification-info)
        {:keys [event-topic event-info]} payload]
    (assoc payload :extra-context (extra-context event-topic event-info))))
