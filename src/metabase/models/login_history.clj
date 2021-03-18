(ns metabase.models.login-history
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as i18n :refer [trs tru]]
            [toucan.db :as db]
            [toucan.models :as models]
            [user-agent :as user-agent]))

(models/defmodel LoginHistory :login_history)

(defn- post-select [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> login-history
    (contains? login-history :session_id) (assoc :active (boolean session-id))
    true                                  (dissoc :session_id)))

(defn- pre-update [login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))

(extend (class LoginHistory)
  models/IModel
  (merge
   models/IModelDefaults
   {:post-select post-select
    :pre-update  pre-update}))

(defn- describe-location [{:keys [city region country], :as info}]
  (when-let [info (not-empty (remove str/blank? [city region country]))]
    (str/join ", " info)))

(defn- geocode-ip-address* [ip-address]
  (when-not (str/blank? ip-address)
    (try
      (let [url           (format "https://get.geojs.io/v1/ip/geo/%s.json" ip-address)
            parse-lat-lon (fn [s]
                            (when (and s (not= s "nil"))
                              (Double/parseDouble s)))
            info          (-> (http/get url)
                              :body
                              (json/parse-string true))]
        {:description (or (describe-location info)
                          "Unknown location")
         :timezone    (u/ignore-exceptions (some-> (:timezone info) t/zone-id))})
      (catch Throwable e
        (log/error e (trs "Error geocoding IP addresss"))
        nil))))

;; TODO -- replace with something better, like built-in database once we find one that's GPL compatible
(def ^:private ^{:arglists '([ip-address])} geocode-ip-address
  (memoize/ttl geocode-ip-address* :ttl/threshold (u/minutes->ms 30)))

(defn- describe-user-agent [user-agent-string]
  (when-not (str/blank? user-agent-string)
    (when-let [{device-type     :type-name
                {os-name :name} :os
                browser-name    :name} (some-> user-agent-string user-agent/parse not-empty)]
      (let [non-blank    (fn [s]
                           (when-not (str/blank? s)
                             s))
            device-type  (or (non-blank device-type)
                             (tru "Unknown device type"))
            os-name      (or (non-blank os-name)
                             (tru "Unknown OS"))
            browser-name (or (non-blank browser-name)
                             (tru "Unknown browser"))]
        (format "%s (%s/%s)" device-type browser-name os-name)))))

(defn- timezone-display-name [^java.time.ZoneId zone-id]
  (when zone-id
    (.getDisplayName zone-id
                     java.time.format.TextStyle/SHORT_STANDALONE
                     (i18n/user-locale))))

(defn- nicely-format-login-history [history-item]
  (let [{location-description :description, timezone :timezone} (geocode-ip-address (:ip_address history-item))]
    (-> history-item
        (assoc :location location-description
               :timezone (timezone-display-name timezone))
        (update :timestamp (fn [timestamp]
                             (if (and timestamp timezone)
                               (u.date/with-time-zone-same-instant timestamp timezone)
                               timestamp)))
        (update :device_description describe-user-agent))))

(defn login-history
  "Return complete login history (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  ;; TODO -- should this only return history in some window, e.g. last 3 months? I think for auditing purposes it's
  ;; nice to be able to see every log in that's every happened with an account. Maybe we should page this, or page the
  ;; API endpoint?
  (for [history-item (db/select [LoginHistory :timestamp :session_id #_:device_id :device_description :ip_address]
                       :user_id (u/the-id user-or-id)
                       {:order-by [[:timestamp :desc]]})]
    (nicely-format-login-history history-item)))
