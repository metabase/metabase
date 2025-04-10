(ns metabase.notification.payload.impl.system-event
  (:require
   [metabase.channel.email.messages :as messages]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.user :as user]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- join-url
  [user-id]
  ;; TODO: the reset token should come from the event-info, not generated here!
  (let [reset-token               (user/set-password-reset-token! user-id)
        should-link-to-login-page (and (public-settings/sso-enabled?)
                                       (not (public-settings/enable-password-login)))]
    (if should-link-to-login-page
      (str (public-settings/site-url) "/auth/login")
      ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
      (str (user/form-password-reset-url reset-token) "#new"))))

(defn- custom-payload
  "Returns a map of custom payload for a given topic and event-info.
  Custom are set of contexts that are specific to certain emails.
  Currently we need it to support usecases that our template engines doesn't support such as i18n,
  but ideally this should be part of the template."
  [topic event-info]
  (case topic
    :event/user-invited
    {:user_invited_email_subject (trs "You''re invited to join {0}''s {1}" (public-settings/site-name) (messages/app-name-trs))
     :user_invited_join_url      (-> event-info :object :id join-url)}
    {}))

(defn- dispatch-on-event-info
  [{notification-system-event :payload :as _notification-info}]
  (let [{:keys [event_info action]} notification-system-event]
    (if action [event_info action] event_info)))

(defmulti transform-event-info
  "Transform the event info to a format that is easier to work with in the templates.
  This is a multi-method because we want to be able to add more event types in the future."
  {:arglists '([notification-info])}
  dispatch-on-event-info)

(defmethod transform-event-info [:event/action.success :row/update]
  [notification-info]
  (lib.util.match/match
    notification-info
    {:event_info {:actor    {:first_name  ?first_name
                             :last_name   ?last_name
                             :email       ?email
                             :common_name ?common_name}
                  :result   {:table_id ?table_id
                             :table    {:name ?table_name}
                             :before   ?before
                             :after    ?after}}}
    {:editor  {:first_name  ?first_name
               :last_name   ?last_name
               :email       ?email
               :common_name ?common_name}
     :table   {:id   ?table_id
               :name ?table_name
               :url  (str (public-settings/site-url) "/table/" ?table_id)}
     :record  ?after
     :changes (into {} (for [[k v] ?after
                             :let [before-val (get ?before k)]
                             :when (not= v before-val)]
                         [k {:before before-val :after v}]))
     :settings (notification.payload/default-settings)}))

(defmethod transform-event-info :default
  [notification-info]
  (let [event-info (:event_info notification-info)]
    {:payload_type :notification/system-event
     :creator      (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification-info))
     :context      (notification.payload/default-settings)
     :payload      (assoc event-info
                          :event_name (-> notification-info :payload :event_name)
                          :custom (custom-payload (-> notification-info :payload :event_name) event-info))}))

(mu/defmethod notification.payload/notification-payload :notification/system-event
  [notification-info :- ::notification.payload/Notification]
  (transform-event-info notification-info))

