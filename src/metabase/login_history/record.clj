(ns metabase.login-history.record
  (:require
   [metabase.analytics.snowplow :as snowplow]
   [metabase.events.core :as events]
   [metabase.login-history.models.login-history :as login-history]
   [metabase.login-history.settings :as login-history.settings]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.connection :as t2.conn]))

(defn- maybe-send-login-from-new-device-email
  "If set to send emails on first login from new devices, that is the case, and its not the users first login, send an
  email from a separate thread."
  [history-record]
  (when (and (login-history.settings/send-email-on-first-login-from-new-device)
             (login-history/first-login-on-this-device? history-record)
             (not (login-history/first-login-ever? history-record)))
    ;; if there's an existing open connection (and there seems to be one, but I'm not 100% sure why) we can't try to use
    ;; it across threads since it can close at any moment! So unbind it so the future can get its own thread.
    (binding [t2.conn/*current-connectable* nil]
      (future
        ;; off thread for both IP lookup and email sending. Either one could block and slow down user login (#16169)
        (try
          (let [[info] (login-history/human-friendly-infos [history-record])]
            (events/publish-event! :event/email.login-from-new-device {:login-history info}))
          (catch Throwable e
            (log/error e "Error sending 'login from new device' notification email")))))))

(mu/defn record-login-history!
  "Record login history for a user, and send them an email if this is their first time logging in from this device."
  [session-id  :- string?
   user        :- [:map
                   {:description ":model/User"}
                   [:id pos-int?]
                   [:last_login {:optional true} :any]]
   device-info :- request/DeviceInfo]
  (let [history-entry (login-history/record-login-history! session-id (u/the-id user) device-info)]
    (when-not (:embedded device-info)
      (maybe-send-login-from-new-device-email history-entry))
    (when-not (:last_login user)
      (snowplow/track-event! :snowplow/account {:event :new-user-created} (u/the-id user)))))
