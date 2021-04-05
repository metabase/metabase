(ns metabase.models.login-history
  (:require [clojure.tools.logging :as log]
            [metabase.email.messages :as email.messages]
            [metabase.models.setting :refer [defsetting]]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as i18n :refer [trs tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(defn- timezone-display-name [^java.time.ZoneId zone-id]
  (when zone-id
    (.getDisplayName zone-id
                     java.time.format.TextStyle/SHORT_STANDALONE
                     (i18n/user-locale))))

(defn human-friendly-info
  "Return a human-friendly version of the info in a LoginHistory instance. Powers the login history API endpoint and
  login on new device email."
  [history-item]
  (let [{location-description :description, timezone :timezone} (request.u/geocode-ip-address (:ip_address history-item))]
    (-> history-item
        (assoc :location location-description
               :timezone (timezone-display-name timezone))
        (update :timestamp (fn [timestamp]
                             (if (and timestamp timezone)
                               (u.date/with-time-zone-same-instant timestamp timezone)
                               timestamp)))
        (update :device_description request.u/describe-user-agent))))

(defsetting send-email-on-first-login-from-new-device
  ;; no need to i18n -- this isn't user-facing
  "Should we send users a notification email the first time they log in from a new device? (Default: true). This is
  currently only configurable via environment variable so users who gain access to an admin's credentials cannot
  disable this Setting and access their account without them knowing."
  :type       :boolean
  :visibility :internal
  :setter     :none
  :default    true)

(models/defmodel LoginHistory :login_history)

(defn- post-select [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> login-history
    (contains? login-history :session_id) (assoc :active (boolean session-id))
    true                                  (dissoc :session_id)))

(defn- first-login-ever? [{user-id :user_id}]
  (some-> (db/select [LoginHistory :id] :user_id user-id {:limit 2})
          count
          (= 1)))

(defn- first-login-on-this-device? [{user-id :user_id, device-id :device_id}]
  (some-> (db/select [LoginHistory :id] :user_id user-id, :device_id device-id, {:limit 2})
          count
          (= 1)))

(defn- post-insert [{user-id :user_id, device-id :device_id, :as login-history}]
  (when (and (send-email-on-first-login-from-new-device)
             (first-login-on-this-device? login-history)
             (not (first-login-ever? login-history)))
    (try
      (email.messages/send-login-from-new-device-email! (human-friendly-info login-history))
      (catch Throwable e
        (log/error e (trs "Error sending ''login from new device'' notification email")))))
  login-history)

(defn- pre-update [login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))

(extend (class LoginHistory)
  models/IModel
  (merge
   models/IModelDefaults
   {:post-select post-select
    :post-insert post-insert
    :pre-update  pre-update}))
