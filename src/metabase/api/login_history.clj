(ns metabase.api.login-history
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models.login-history :as login-history :refer [LoginHistory]]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as i18n]
            [toucan.db :as db]))

(defn- timezone-display-name [^java.time.ZoneId zone-id]
  (when zone-id
    (.getDisplayName zone-id
                     java.time.format.TextStyle/SHORT_STANDALONE
                     (i18n/user-locale))))

(defn- format-login-history
  "Return a human-friendly version of the info in a LoginHistory instance. Powers the login history API endpoint."
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

(defn login-history
  "Return complete login history (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  ;; TODO -- should this only return history in some window, e.g. last 3 months? I think for auditing purposes it's
  ;; nice to be able to see every log in that's every happened with an account. Maybe we should page this, or page the
  ;; API endpoint?
  (for [history-item (db/select [LoginHistory :timestamp :session_id :device_description :ip_address]
                                :user_id (u/the-id user-or-id)
                                {:order-by [[:timestamp :desc]]})]
    (format-login-history history-item)))

(api/defendpoint GET "/current"
  "Fetch recent logins for the current user."
  []
  (login-history api/*current-user-id*))

(api/define-routes)
