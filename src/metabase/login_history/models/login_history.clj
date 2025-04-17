(ns metabase.login-history.models.login-history
  (:require
   [java-time.api :as t]
   [metabase.request.core :as request]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
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
        ip->info     (request/geocode-ip-addresses ip-addresses)]
    (for [history-item history-items
          :let         [{location-description :description, timezone :timezone} (get ip->info (:ip_address history-item))]]
      (-> history-item
          (assoc :location location-description
                 :timezone (timezone-display-name timezone))
          (update :timestamp (fn [timestamp]
                               (if (and timestamp timezone)
                                 (t/zoned-date-time (u.date/with-time-zone-same-instant timestamp timezone) timezone)
                                 timestamp)))
          (update :device_description request/describe-user-agent)))))

(methodical/defmethod t2/table-name :model/LoginHistory [_model] :login_history)

(doto :model/LoginHistory
  (derive :metabase/model))

(mu/defn record-login-history!
  "Record a login event in the LoginHistory table."
  [session-id :- [:not uuid?]
   user-id :- ms/PositiveInt
   device-info :- request/DeviceInfo]
  (let [login-history (merge {:user_id    user-id
                              :session_id session-id}
                             (dissoc device-info :embedded))]
    (t2/insert! :model/LoginHistory login-history)
    login-history))

(t2/define-after-select :model/LoginHistory
  [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> (t2.realize/realize login-history)
    (contains? login-history :session_id) (assoc :active (boolean session-id))
    true                                  (dissoc :session_id)))

(defn first-login-ever?
  "Return true if this is the first login ever for the given user-id."
  [{user-id :user_id}]
  (some-> (t2/select [:model/LoginHistory :id] :user_id user-id {:limit 2})
          count
          (= 1)))

(defn first-login-on-this-device?
  "Return true if this is the first login for the given user-id on the device"
  [{user-id :user_id, device-id :device_id}]
  (some-> (t2/select [:model/LoginHistory :id] :user_id user-id, :device_id device-id, {:limit 2})
          count
          (= 1)))

(t2/define-before-update :model/LoginHistory [_login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))
