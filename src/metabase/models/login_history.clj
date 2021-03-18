(ns metabase.models.login-history
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [toucan.db :as db]
            [toucan.models :as models]
            [user-agent :as user-agent]))

(models/defmodel LoginHistory :login_history)

(defn- post-select [{session-id :session_id, :as login-history}]
  ;; session ID is sensitive, so it's better if we don't even return it. Replace it with a more generic `active` key.
  (cond-> login-history
    (:session_id login-history) (assoc :active (boolean session-id))
    true                        (dissoc :session_id)))

(defn- pre-update [login-history]
  (throw (RuntimeException. (tru "You can''t update a LoginHistory after it has been created."))))

(extend (class LoginHistory)
  models/IModel
  (merge
   models/IModelDefaults
   {:post-select post-select
    :pre-update  pre-update}))

(defn- describe-location [{:keys [city region country]}]
  (when-let [info (not-empty (remove str/blank? [city region country]))]
    (str/join ", " info)))

(defn- geocode-ip-address* [ip-address]
  (try
    (let [url           (format "https://get.geojs.io/v1/ip/geo/%s.json" ip-address)
          parse-lat-lon (fn [s]
                          (when (and s (not= s "nil"))
                            (Double/parseDouble s)))
          info          (-> (http/get url)
                            :body
                            (json/parse-string true)
                            (select-keys [:country :region :city]))]
      (or (describe-location info)
          "Unknown location"))
    (catch Throwable e
      (log/error e (trs "Error geocoding IP addresss"))
      nil)))

;; TODO -- replace with something better, like built-in database once we find one that's GPL compatible
(def ^:private ^{:arglists '([ip-address])} geocode-ip-address
  (memoize/ttl geocode-ip-address* :ttl/threshold (u/minutes->ms 30)))

(defn- describe-user-agent [user-agent-string]
  (when-let [info (some-> user-agent-string user-agent/parse not-empty)]
    (let [device-type  (or (:type-name info) (tru "Unknown device type"))
          os-name      (or (get-in info [:os :name]) (tru "Unknown OS"))
          browser-name (or (:name info) (tru "Unknown browser"))]
      (format "%s (%s/%s)" device-type browser-name os-name))))

(defn- nicely-format-login-history [history-item]
  (-> history-item
      (assoc :location (geocode-ip-address (:ip_address history-item)))
      (update :device_description describe-user-agent )))

(defn login-history
  "Return complete login history (sorted by most-recent -> least-recent) for `user-or-id`"
  [user-or-id]
  ;; TODO -- should this only return history in some window, e.g. last 3 months? I think for auditing purposes it's
  ;; nice to be able to see every log in that's every happened with an account. Maybe we should page this, or page the
  ;; API endpoint?
  (for [history-item (db/select [LoginHistory :timestamp :session_id :device_id :device_description :ip_address]
                       :user_id (u/the-id user-or-id)
                       {:order-by [[:timestamp :desc]]})]
    (nicely-format-login-history history-item)))
