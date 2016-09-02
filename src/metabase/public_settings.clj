(ns metabase.public-settings
  (:require [clojure.string :as s]
            [cheshire.core :as json]
            (metabase [config :as config]
                      [db :as db])
            (metabase.models [common :as common]
                             [setting :refer [defsetting], :as setting])
            [metabase.util :as u]
            [metabase.util.password :as password])
  (:import java.util.TimeZone))

(defsetting check-for-updates
  "Identify when new versions of Metabase are available."
  :type    :boolean
  :default true)

(defsetting version-info
  "Information about available versions of Metabase."
  :type    :json
  :default {})

(defsetting site-name
  "The name used for this instance of Metabase."
  :default "Metabase")

(defsetting -site-url
  "The base URL of this Metabase instance, e.g. \"http://metabase.my-company.com\"")

(defsetting admin-email
  "The email address users should be referred to if they encounter a problem.")

(defsetting anon-tracking-enabled
  "Enable the collection of anonymous usage data in order to help Metabase improve."
  :type   :boolean
  :default true)

(defsetting google-maps-api-key
  "A Google Maps API key is required to enable certain map visualizations.")

(def ^:private assert-valid-json-url
  "Check that remote URL points to a valid JSON file, or throw an exception.
   Since the remote file isn't likely to change, this check isn't repeated for URLs that have already succeded;
   if the check fails, an exception is thrown (thereby preventing memoization)."
  (memoize (fn [url]
             (assert (u/is-url? url)
               (str "Invalid URL: " url))
             (u/with-timeout 5000
               (json/parse-string (slurp url)))
             true)))

(defsetting geojson-url
  "A URL to a custom GeoJSON file that can be used in map visualizations instead of the default US State Map and World GeoJSON files."
  :setter (fn [url]
            (when (seq url)
              ;; validate that the new value is a valid URL pointing to a valid JSON file or refuse to set it
              (assert-valid-json-url url))
            (setting/set-string! :geojson-url url)))

(defn site-url
  "Fetch the site base URL that should be used for password reset emails, etc.
   This strips off any trailing slashes that may have been added.

   The first time this function is called, we'll set the value of the setting `-site-url` with the value of
   the ORIGIN header (falling back to HOST if needed, i.e. for unit tests) of some API request.
   Subsequently, the site URL can only be changed via the admin page."
  {:arglists '([request])}
  [{{:strs [origin host]} :headers}]
  {:pre  [(or origin host)]
   :post [(string? %)]}
  (or (some-> (-site-url)
              (s/replace #"/$" "")) ; strip off trailing slash if one was included
      (-site-url (or origin host))))



(defn- short-timezone-name*
  "Get a short display name (e.g. `PST`) for `report-timezone`, or fall back to the System default if it's not set."
  [^String timezone-name]
  (let [^TimeZone timezone (or (when (seq timezone-name)
                                 (TimeZone/getTimeZone timezone-name))
                               (TimeZone/getDefault))]
    (.getDisplayName timezone (.inDaylightTime timezone (java.util.Date.)) TimeZone/SHORT)))

(def ^:private short-timezone-name (memoize short-timezone-name*))


(defn public-settings
  "Return a simple map of key/value pairs which represent the public settings for the front-end application."
  []
  {:ga_code               "UA-60817802-1"
   :password_complexity   password/active-password-complexity
   :timezones             common/timezones
   :version               config/mb-version-info
   :engines               ((resolve 'metabase.driver/available-drivers))
   :setup_token           ((resolve 'metabase.setup/token-value))
   :anon_tracking_enabled (anon-tracking-enabled)
   :site_name             (site-name)
   :email_configured      ((resolve 'metabase.email/email-configured?))
   :admin_email           (admin-email)
   :report_timezone       (setting/get :report-timezone)
   :timezone_short        (short-timezone-name (setting/get :report-timezone))
   :has_sample_dataset    (db/exists? 'Database, :is_sample true)
   :google_auth_client_id (setting/get :google-auth-client-id)
   :google_maps_api_key   (google-maps-api-key)})
