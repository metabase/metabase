(ns metabase.models.login-history
  (:require
   [java-time.api :as t]
   [metabase.email.messages :as messages]
   [metabase.models.setting :refer [defsetting]]
   [metabase.server.request.util :as req.util]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defn- timezone-display-name [^java.time.ZoneId zone-id]
  (when zone-id
    (.getDisplayName zone-id
                     java.time.format.TextStyle/SHORT_STANDALONE
                     (i18n/user-locale))))

(defn human-friendly-infos
  "Return human-friendly versions of the info in one or more LoginHistory instances. Powers the login history API
  endpoint and login on new device email.

  This can potentially take a few seconds to complete, if the request to geocode the API request hangs for one reason
  or another -- keep that in mind when using this."
  [history-items]
  (let [ip-addresses (map :ip_address history-items)
        ip->info     (req.util/geocode-ip-addresses ip-addresses)]
    (for [history-item history-items
          :let         [{location-description :description, timezone :timezone} (get ip->info (:ip_address history-item))]]
      (-> history-item
          (assoc :location location-description
                 :timezone (timezone-display-name timezone))
          (update :timestamp (fn [timestamp]
                               (if (and timestamp timezone)
                                 (t/zoned-date-time (u.date/with-time-zone-same-instant timestamp timezone) timezone)
                                 timestamp)))
          (update :device_description req.util/describe-user-agent)))))

(defsetting send-email-on-first-login-from-new-device
  ;; no need to i18n -- this isn't user-facing
  "Should we send users a notification email the first time they log in from a new device? (Default: true). This is
  currently only configurable via environment variable so users who gain access to an admin's credentials cannot
  disable this Setting and access their account without them knowing."
  :type       :boolean
  :visibility :internal
  :setter     :none
  :default    true
  :doc "This variable also controls the geocoding service that Metabase uses to know the location of your logged in users.
        Setting this variable to false also disables this reverse geocoding functionality.")

(def LoginHistory
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/LoginHistory)

(methodical/defmethod t2/table-name :model/LoginHistory [_model] :login_history)

(doto :model/LoginHistory
  (derive :metabase/model))

(t2/define-after-select :model/LoginHistory
  [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> (t2.realize/realize login-history)
    (contains? login-history :session_id) (assoc :active (boolean session-id))
    true                                  (dissoc :session_id)))

(defn- first-login-ever? [{user-id :user_id}]
  (some-> (t2/select [LoginHistory :id] :user_id user-id {:limit 2})
          count
          (= 1)))

(defn- first-login-on-this-device? [{user-id :user_id, device-id :device_id}]
  (some-> (t2/select [LoginHistory :id] :user_id user-id, :device_id device-id, {:limit 2})
          count
          (= 1)))

(defn- maybe-send-login-from-new-device-email
  "If set to send emails on first login from new devices, that is the case, and its not the users first login, send an
  email from a separate thread."
  [login-history]
  (when (and (send-email-on-first-login-from-new-device)
             (first-login-on-this-device? login-history)
             (not (first-login-ever? login-history)))
    ;; if there's an existing open connection (and there seems to be one, but I'm not 100% sure why) we can't try to use
    ;; it across threads since it can close at any moment! So unbind it so the future can get its own thread.
    (binding [t2.conn/*current-connectable* nil]
      (future
        ;; off thread for both IP lookup and email sending. Either one could block and slow down user login (#16169)
        (try
          (let [[info] (human-friendly-infos [login-history])]
            (messages/send-login-from-new-device-email! info))
          (catch Throwable e
            (log/error e "Error sending 'login from new device' notification email")))))))

(t2/define-after-insert :model/LoginHistory
  [login-history]
  (maybe-send-login-from-new-device-email login-history)
  login-history)

(t2/define-before-update :model/LoginHistory [_login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))
