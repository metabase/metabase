(ns metabase.public-settings
  (:require [clojure.string :as s]
            [metabase
             [config :as config]
             [types :as types]]
            [metabase.models
             [common :as common]
             [setting :as setting :refer [defsetting]]]
            [metabase.util.password :as password]
            [toucan.db :as db])
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

;; This value is *guaranteed* to never have a trailing slash :D
;; It will also prepend `http://` to the URL if there's not protocol when it comes in
(defsetting site-url
  "The base URL of this Metabase instance, e.g. \"http://metabase.my-company.com\"."
  :setter (fn [new-value]
            (setting/set-string! :site-url (when new-value
                                             (cond->> (s/replace new-value #"/$" "")
                                               (not (s/starts-with? new-value "http")) (str "http://"))))))

(defsetting admin-email
  "The email address users should be referred to if they encounter a problem.")

(defsetting anon-tracking-enabled
  "Enable the collection of anonymous usage data in order to help Metabase improve."
  :type   :boolean
  :default true)

(defsetting map-tile-server-url
  "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox."
  :default "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")

(defsetting enable-public-sharing
  "Enable admins to create publically viewable links (and embeddable iframes) for Questions and Dashboards?"
  :type    :boolean
  :default false)

(defsetting enable-embedding
  "Allow admins to securely embed questions and dashboards within other applications?"
  :type    :boolean
  :default false)


(defsetting enable-query-caching
  "Enabling caching will save the results of queries that take a long time to run."
  :type    :boolean
  :default false)

(defsetting query-caching-max-kb
  "The maximum size of the cache, per saved question, in kilobytes:"
  ;; (This size is a measurement of the length of *uncompressed* serialized result *rows*. The actual size of
  ;; the results as stored will vary somewhat, since this measurement doesn't include metadata returned with the
  ;; results, and doesn't consider whether the results are compressed, as the `:db` backend does.)
  :type    :integer
  :default 1000)

(defsetting query-caching-max-ttl
  "The absoulte maximum time to keep any cached query results, in seconds."
  :type    :integer
  :default (* 60 60 24 100)) ; 100 days

(defsetting query-caching-min-ttl
  "Metabase will cache all saved questions with an average query execution time longer than
   this many seconds:"
  :type    :integer
  :default 60)

(defsetting query-caching-ttl-ratio
  "To determine how long each saved question's cached result should stick around, we take the
   query's average execution time and multiply that by whatever you input here. So if a query
   takes on average 2 minutes to run, and you input 10 for your multiplier, its cache entry
   will persist for 20 minutes."
  :type    :integer
  :default 10)


(defn remove-public-uuid-if-public-sharing-is-disabled
  "If public sharing is *disabled* and OBJECT has a `:public_uuid`, remove it so people don't try to use it (since it won't work).
   Intended for use as part of a `post-select` implementation for Cards and Dashboards."
  [object]
  (if (and (:public_uuid object)
           (not (enable-public-sharing)))
    (assoc object :public_uuid nil)
    object))


(defn- short-timezone-name*
  "Get a short display name (e.g. `PST`) for `report-timezone`, or fall back to the System default if it's not set."
  [^String timezone-name]
  (let [^TimeZone timezone (or (when (seq timezone-name)
                                 (TimeZone/getTimeZone timezone-name))
                               (TimeZone/getDefault))]
    (.getDisplayName timezone (.inDaylightTime timezone (java.util.Date.)) TimeZone/SHORT)))

(def ^:private short-timezone-name (memoize short-timezone-name*))


(defn public-settings
  "Return a simple map of key/value pairs which represent the public settings (`MetabaseBootstrap`) for the front-end application."
  []
  {:admin_email           (admin-email)
   :anon_tracking_enabled (anon-tracking-enabled)
   :custom_geojson        (setting/get :custom-geojson)
   :email_configured      ((resolve 'metabase.email/email-configured?))
   :enable_query_caching  (enable-query-caching)
   :engines               ((resolve 'metabase.driver/available-drivers))
   :ga_code               "UA-60817802-1"
   :google_auth_client_id (setting/get :google-auth-client-id)
   :has_sample_dataset    (db/exists? 'Database, :is_sample true)
   :map_tile_server_url   (map-tile-server-url)
   :password_complexity   password/active-password-complexity
   :public_sharing        (enable-public-sharing)
   :embedding             (enable-embedding)
   :report_timezone       (setting/get :report-timezone)
   :setup_token           ((resolve 'metabase.setup/token-value))
   :site_name             (site-name)
   :timezone_short        (short-timezone-name (setting/get :report-timezone))
   :timezones             common/timezones
   :types                 (types/types->parents)
   :version               config/mb-version-info})
