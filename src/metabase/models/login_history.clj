(ns metabase.models.login-history
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.email.messages :as email.messages]
            [metabase.models.setting :refer [defsetting]]
            [metabase.server.request.util :as request.u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as i18n :refer [trs tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

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
        ip->info     (request.u/geocode-ip-addresses ip-addresses)]
    (for [history-item history-items
          :let         [{location-description :description, timezone :timezone} (get ip->info (:ip_address history-item))]]
      (-> history-item
          (assoc :location location-description
                 :timezone (timezone-display-name timezone))
          (update :timestamp (fn [timestamp]
                               (if (and timestamp timezone)
                                 (t/zoned-date-time (u.date/with-time-zone-same-instant timestamp timezone) timezone)
                                 timestamp)))
          (update :device_description request.u/describe-user-agent)))))

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

(defn- maybe-send-login-from-new-device-email
  "If set to send emails on first login from new devices, that is the case, and its not the users first login, send an
  email from a separate thread."
  [{user-id :user_id, device-id :device_id, :as login-history}]
  (when (and (send-email-on-first-login-from-new-device)
             (first-login-on-this-device? login-history)
             (not (first-login-ever? login-history)))
    (future
      ;; off thread for both IP lookup and email sending. Either one could block and slow down user login (#16169)
      (try
        (let [[info] (human-friendly-infos [login-history])]
          (email.messages/send-login-from-new-device-email! info))
        (catch Throwable e
          (log/error e (trs "Error sending ''login from new device'' notification email")))))))

(defn- post-insert [login-history]
  (maybe-send-login-from-new-device-email login-history)
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
