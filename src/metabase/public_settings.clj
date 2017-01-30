(ns metabase.public-settings
  (:require [clojure.string :as s]
            (metabase [config :as config]
                      [db :as db])
            (metabase.models [common :as common]
                             [setting :refer [defsetting], :as setting])
            [metabase.types :as types]
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

(defsetting map-tile-server-url
  "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox."
  :default "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")

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

(defsetting enable-public-sharing
  "Enable admins to create publically viewable links for Cards and Dashboards?"
  :type    :boolean
  :default false)


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
   :engines               ((resolve 'metabase.driver/available-drivers))
   :ga_code               "UA-60817802-1"
   :google_auth_client_id (setting/get :google-auth-client-id)
   :has_sample_dataset    (db/exists? 'Database, :is_sample true)
   :map_tile_server_url   (map-tile-server-url)
   :password_complexity   password/active-password-complexity
   :public_sharing        (enable-public-sharing)
   :report_timezone       (setting/get :report-timezone)
   :setup_token           ((resolve 'metabase.setup/token-value))
   :site_name             (site-name)
   :timezone_short        (short-timezone-name (setting/get :report-timezone))
   :timezones             common/timezones
   :types                 (types/types->parents)
   :version               config/mb-version-info})
