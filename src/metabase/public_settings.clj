(ns metabase.public-settings
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase
             [config :as config]
             [types :as types]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [common :as common]
             [setting :as setting :refer [defsetting]]]
            metabase.public-settings.metastore
            [metabase.util
             [i18n :as i18n :refer [available-locales-with-names deferred-tru trs tru]]
             [password :as password]]
            [toucan.db :as db])
  (:import java.util.UUID))

;; These modules register settings but are otherwise unused. They still must be imported.
(comment metabase.public-settings.metastore/keep-me)

(defsetting check-for-updates
  (deferred-tru "Identify when new versions of Metabase are available.")
  :type    :boolean
  :default true)

(defsetting version-info
  (deferred-tru "Information about available versions of Metabase.")
  :type    :json
  :default {})

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
    (assert (u/url? s) (tru "Invalid site URL: {0}" (pr-str s)))
    s))

(declare redirect-all-requests-to-https)

;; This value is *guaranteed* to never have a trailing slash :D
;; It will also prepend `http://` to the URL if there's no protocol when it comes in
(defsetting site-url
  (deferred-tru "The base URL of this Metabase instance, e.g. \"http://metabase.my-company.com\".")
  :visibility :public
  :getter (fn []
            (try
              (some-> (setting/get-string :site-url) normalize-site-url)
              (catch AssertionError e
                (log/error e (trs "site-url is invalid; returning nil for now. Will be reset on next request.")))))
  :setter (fn [new-value]
            (let [new-value (some-> new-value normalize-site-url)
                  https?    (some-> new-value (str/starts-with?  "https:" ))]
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
  :getter (fn [] (some-> (setting/get-string :source-address-header)
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
  :getter     (constantly common/timezones))

(defsetting engines
  "Available database engines"
  :visibility :public
  :setter     :none
  :getter     driver.u/available-drivers-info)

(defsetting types
  "Field types"
  :visibility :public
  :setter     :none
  :getter     (fn [] (types/types->parents :type/*)))

(defsetting entities
  "Entity types"
  :visibility :public
  :setter     :none
  :getter     (fn [] (types/types->parents :entity/*)))

(defsetting has-sample-dataset?
  "Whether this instance has a Sample Dataset database"
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (db/exists? 'Database, :is_sample true)))

(defsetting password-complexity
  "Current password complexity requirements"
  :visibility :public
  :setter     :none
  :getter     (constantly password/active-password-complexity))

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
