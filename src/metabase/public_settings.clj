(ns metabase.public-settings
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.config :as config]
            [metabase.driver.util :as driver.u]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings.metastore :as metastore]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n :refer [available-locales-with-names deferred-tru trs tru]]
            [metabase.util.password :as password]
            [toucan.db :as db])
  (:import java.util.UUID))

;; These modules register settings but are otherwise unused. They still must be imported.
(comment metabase.public-settings.metastore/keep-me)

(defn- google-auth-configured? []
  (boolean (setting/get :google-auth-client-id)))

(defn- ldap-configured? []
  (do (classloader/require 'metabase.integrations.ldap)
      ((resolve 'metabase.integrations.ldap/ldap-configured?))))

(defn- ee-sso-configured? []
  (u/ignore-exceptions
    (classloader/require 'metabase-enterprise.sso.integrations.sso-settings))
  (when-let [varr (resolve 'metabase-enterprise.sso.integrations.sso-settings/other-sso-configured?)]
    (varr)))

(defn- sso-configured?
  "Any SSO provider is configured"
  []
  (or (google-auth-configured?)
      (ldap-configured?)
      (ee-sso-configured?)))

(defsetting check-for-updates
  (deferred-tru "Identify when new versions of Metabase are available.")
  :type    :boolean
  :default true)

(defsetting version-info
  (deferred-tru "Information about available versions of Metabase.")
  :type    :json
  :default {})

(defsetting version-info-last-checked
  (deferred-tru "Indicates when Metabase last checked for new versions.")
  :visibility :public
  :type       :timestamp
  :default    nil)

(defsetting site-name
  (deferred-tru "The name used for this instance of Metabase.")
  :default "Metabase")

(defsetting site-uuid
  ;; Don't i18n this docstring because it's not user-facing! :)
  "Unique identifier used for this instance of Metabase. This is set once and only once the first time it is fetched via
  its magic getter. Nice!"
  :visibility :internal
  :setter     :none
  ;; magic getter will either fetch value from DB, or if no value exists, set the value to a random UUID.
  :getter     (fn []
                (or (setting/get-string :site-uuid)
                    (let [value (str (UUID/randomUUID))]
                      (setting/set-string! :site-uuid value)
                      value))))

(defn- normalize-site-url [^String s]
  (let [ ;; remove trailing slashes
        s (str/replace s #"/$" "")
        ;; add protocol if missing
        s (if (str/starts-with? s "http")
            s
            (str "http://" s))]
    ;; check that the URL is valid
    (when-not (u/url? s)
      (throw (ex-info (tru "Invalid site URL: {0}" (pr-str s)) {:url (pr-str s)})))
    s))

(declare redirect-all-requests-to-https)

;; This value is *guaranteed* to never have a trailing slash :D
;; It will also prepend `http://` to the URL if there's no protocol when it comes in
(defsetting site-url
  (str (deferred-tru "This URL is used for things like creating links in emails, auth redirects,")
       " "
       (deferred-tru "and in some embedding scenarios, so changing it could break functionality or get you locked out of this instance."))
  :visibility :public
  :getter (fn []
            (try
              (some-> (setting/get-string :site-url) normalize-site-url)
              (catch clojure.lang.ExceptionInfo e
                (log/error e (trs "site-url is invalid; returning nil for now. Will be reset on next request.")))))
  :setter (fn [new-value]
            (let [new-value (some-> new-value normalize-site-url)
                  https?    (some-> new-value (str/starts-with?  "https:"))]
              ;; if the site URL isn't HTTPS then disable force HTTPS redirects if set
              (when-not https?
                (redirect-all-requests-to-https false))
              (setting/set-string! :site-url new-value))))

(defsetting site-locale
  (str (deferred-tru "The default language for all users across the Metabase UI, system emails, pulses, and alerts.")
       " "
       (deferred-tru "Users can individually override this default language from their own account settings."))
  :default    "en"
  :visibility :public
  :setter     (fn [new-value]
                (when new-value
                  (when-not (i18n/available-locale? new-value)
                    (throw (ex-info (tru "Invalid locale {0}" (pr-str new-value)) {:status-code 400}))))
                (setting/set-string! :site-locale (some-> new-value i18n/normalized-locale-string))))

(defsetting admin-email
  (deferred-tru "The email address users should be referred to if they encounter a problem.")
  :visibility :authenticated)

(defsetting anon-tracking-enabled
  (deferred-tru "Enable the collection of anonymous usage data in order to help Metabase improve.")
  :type       :boolean
  :default    true
  :visibility :public)

(defsetting ga-code
  (deferred-tru "Google Analytics tracking code.")
  :default    "UA-60817802-1"
  :visibility :public)

(defsetting map-tile-server-url
  (deferred-tru "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.")
  :default    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  :visibility :public)

(defsetting landing-page
  (deferred-tru "Default page to show the user")
  :visibility :public
  :type       :string
  :default    "")

(defsetting enable-public-sharing
  (deferred-tru "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?")
  :type       :boolean
  :default    false
  :visibility :authenticated)

(defsetting enable-embedding
  (deferred-tru "Allow admins to securely embed questions and dashboards within other applications?")
  :type       :boolean
  :default    false
  :visibility :authenticated)

(defsetting embedding-app-origin
  (deferred-tru "Allow this origin to embed the full Metabase application")
  :visibility :public)

(defsetting enable-nested-queries
  (deferred-tru "Allow using a saved question as the source for other queries?")
  :type    :boolean
  :default true)

(defsetting enable-query-caching
  (deferred-tru "Enabling caching will save the results of queries that take a long time to run.")
  :type    :boolean
  :default false)

(def ^:private ^:const global-max-caching-kb
  "Although depending on the database, we can support much larger cached values (1GB for PG, 2GB for H2 and 4GB for
  MySQL) we are not curretly setup to deal with data of that size. The datatypes we are using will hold this data in
  memory and will not truly be streaming. This is a global max in order to prevent our users from setting the caching
  value so high it becomes a performance issue. The value below represents 200MB"
  (* 200 1024))

(defsetting query-caching-max-kb
  (deferred-tru "The maximum size of the cache, per saved question, in kilobytes:")
  ;; (This size is a measurement of the length of *uncompressed* serialized result *rows*. The actual size of
  ;; the results as stored will vary somewhat, since this measurement doesn't include metadata returned with the
  ;; results, and doesn't consider whether the results are compressed, as the `:db` backend does.)
  :type    :integer
  :default 1000
  :setter  (fn [new-value]
             (when (and new-value
                        (> (cond-> new-value
                             (string? new-value) Integer/parseInt)
                           global-max-caching-kb))
               (throw (IllegalArgumentException.
                       (str
                        (tru "Failed setting `query-caching-max-kb` to {0}." new-value)
                        " "
                        (tru "Values greater than {0} ({1}) are not allowed."
                             global-max-caching-kb (u/format-bytes (* global-max-caching-kb 1024)))))))
             (setting/set-integer! :query-caching-max-kb new-value)))

(defsetting query-caching-max-ttl
  (deferred-tru "The absolute maximum time to keep any cached query results, in seconds.")
  :type    :double
  :default (* 60 60 24 100)) ; 100 days

;; TODO -- this isn't really a TTL at all. Consider renaming to something like `-min-duration`
(defsetting query-caching-min-ttl
  (deferred-tru "Metabase will cache all saved questions with an average query execution time longer than this many seconds:")
  :type    :double
  :default 60)

(defsetting query-caching-ttl-ratio
  (str (deferred-tru "To determine how long each saved question''s cached result should stick around, we take the query''s average execution time and multiply that by whatever you input here.")
       " "
       (deferred-tru "So if a query takes on average 2 minutes to run, and you input 10 for your multiplier, its cache entry will persist for 20 minutes."))
  :type    :integer
  :default 10)

(defsetting application-name
  (deferred-tru "This will replace the word \"Metabase\" wherever it appears.")
  :visibility :public
  :type       :string
  :default    "Metabase")

(defsetting application-colors
  (deferred-tru "These are the primary colors used in charts and throughout Metabase. You might need to refresh your browser to see your changes take effect.")
  :visibility :public
  :type       :json
  :default    {})

(defn application-color
  "The primary color, a.k.a. brand color"
  []
  (or (:brand (setting/get-json :application-colors)) "#509EE3"))

(defn secondary-chart-color
  "The first 'Additional chart color'"
  []
  (or (:accent3 (setting/get-json :application-colors)) "#EF8C8C"))

(defsetting application-logo-url
  (deferred-tru "For best results, use an SVG file with a transparent background.")
  :visibility :public
  :type       :string
  :default    "app/assets/img/logo.svg")

(defsetting application-favicon-url
  (deferred-tru "The url or image that you want to use as the favicon.")
  :visibility :public
  :type       :string
  :default    "/app/assets/img/favicon.ico")

(defsetting enable-password-login
  (deferred-tru "Allow logging in by email and password.")
  :visibility :public
  :type       :boolean
  :default    true
  :getter     (fn []
                (or (setting/get-boolean :enable-password-login)
                    (not (sso-configured?)))))

(defsetting breakout-bins-num
  (deferred-tru "When using the default binning strategy and a number of bins is not provided, this number will be used as the default.")
  :type :integer
  :default 8)

(defsetting breakout-bin-width
  (deferred-tru "When using the default binning strategy for a field of type Coordinate (such as Latitude and Longitude), this number will be used as the default bin width (in degrees).")
  :type :double
  :default 10.0)

(defsetting custom-formatting
  (deferred-tru "Object keyed by type, containing formatting settings")
  :type       :json
  :default    {}
  :visibility :public)

(defsetting enable-xrays
  (deferred-tru "Allow users to explore data using X-rays")
  :type       :boolean
  :default    true
  :visibility :authenticated)

(defsetting show-homepage-data
  (deferred-tru "Whether or not to display data on the homepage. Admins might turn this off in order to direct users to better content than raw data")
  :type       :boolean
  :default    true
  :visibility :authenticated)

(defsetting show-homepage-xrays
  (deferred-tru "Whether or not to display x-ray suggestions on the homepage. They will also be hidden if any dashboards are pinned. Admins might hide this to direct users to better content than raw data")
  :type       :boolean
  :default    true
  :visibility :authenticated)

(defsetting source-address-header
  (deferred-tru "Identify the source of HTTP requests by this header's value, instead of its remote address.")
  :default "X-Forwarded-For"
  :getter  (fn [] (some-> (setting/get-string :source-address-header)
                          u/lower-case-en)))

(defn remove-public-uuid-if-public-sharing-is-disabled
  "If public sharing is *disabled* and `object` has a `:public_uuid`, remove it so people don't try to use it (since it
  won't work). Intended for use as part of a `post-select` implementation for Cards and Dashboards."
  [object]
  (if (and (:public_uuid object)
           (not (enable-public-sharing)))
    (assoc object :public_uuid nil)
    object))

(defn- short-timezone-name [timezone-id]
  (let [^java.time.ZoneId zone (if (seq timezone-id)
                                 (t/zone-id timezone-id)
                                 (t/zone-id))]
    (.getDisplayName
     zone
     java.time.format.TextStyle/SHORT
     (java.util.Locale/getDefault))))

(defsetting available-locales
  "Available i18n locales"
  :visibility :public
  :setter     :none
  :getter     available-locales-with-names)

(defsetting available-timezones
  "Available report timezone options"
  :visibility :public
  :setter     :none
  :getter     (comp sort t/available-zone-ids))

(defsetting engines
  "Available database engines"
  :visibility :public
  :setter     :none
  :getter     driver.u/available-drivers-info)

(defsetting has-sample-dataset?
  "Whether this instance has a Sample Dataset database"
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (db/exists? 'Database, :is_sample true)))

(defsetting password-complexity
  "Current password complexity requirements"
  :visibility :public
  :setter     :none
  :getter     password/active-password-complexity)

(defsetting session-cookies
  (deferred-tru "When set, enforces the use of session cookies for all users which expire when the browser is closed.")
  :type       :boolean
  :visibility :public
  :default    nil)

(defsetting report-timezone-short
  "Current report timezone abbreviation"
  :visibility :public
  :setter     :none
  :getter     (fn [] (short-timezone-name (setting/get :report-timezone))))

(defsetting version
  "Metabase's version info"
  :visibility :public
  :setter     :none
  :getter     (constantly config/mb-version-info))

(defsetting premium-features
  "Premium EE features enabled for this instance."
  :visibility :public
  :setter     :none
  :getter     (fn [] {:embedding  (metastore/hide-embed-branding?)
                      :whitelabel (metastore/enable-whitelabeling?)
                      :audit_app  (metastore/enable-audit-app?)
                      :sandboxes  (metastore/enable-sandboxes?)
                      :sso        (metastore/enable-sso?)}))

(defsetting redirect-all-requests-to-https
  (deferred-tru "Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS")
  :visibility :public
  :type       :boolean
  :default    false
  :setter     (fn [new-value]
                ;; if we're trying to enable this setting, make sure `site-url` is actually an HTTPS URL.
                (when (if (string? new-value)
                        (setting/string->boolean new-value)
                        new-value)
                  (assert (some-> (site-url) (str/starts-with? "https:"))
                          (tru "Cannot redirect requests to HTTPS unless `site-url` is HTTPS.")))
                (setting/set-boolean! :redirect-all-requests-to-https new-value)))

(defsetting start-of-week
  (deferred-tru "This will affect things like grouping by week or filtering in GUI queries.
  It won''t affect SQL queries.")
  :visibility :public
  :type       :keyword
  :default    "sunday")

(defsetting ssh-heartbeat-interval-sec
  (deferred-tru "Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).")
  :visibility :public
  :type       :integer
  :default    180)

(defsetting redshift-fetch-size
  (deferred-tru "Controls the fetch size used for Redshift queries (in PreparedStatement), via defaultRowFetchSize.")
  :visibility :public
  :type       :integer
  :default    5000)
