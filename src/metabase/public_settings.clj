(ns metabase.public-settings
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.fonts :as u.fonts]
   [metabase.util.i18n
    :as i18n
    :refer [available-locales-with-names deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; These modules register settings but are otherwise unused. They still must be imported.
(comment premium-features/keep-me)

(defsetting application-name
  (deferred-tru "This will replace the word \"Metabase\" wherever it appears.")
  :visibility :public
  :type       :string
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?
  :default    "Metabase")

(defn application-name-for-setting-descriptions
  "Returns the value of the [[application-name]] setting so setting docstrings can be generated during the compilation stage.
   Use this instead of `application-name` in descriptions, otherwise the `application-name` setting's
   `:enabled?` function will be called during compilation, which will fail because it will attempt to perform i18n, which is
   not allowed during compilation."
  []
  (if *compile-files*
    "Metabase"
    (binding [setting/*disable-cache* true]
      (application-name))))

(defn- google-auth-enabled? []
  (boolean (setting/get :google-auth-enabled)))

(defn- ldap-enabled? []
  (classloader/require 'metabase.api.ldap)
  ((resolve 'metabase.api.ldap/ldap-enabled)))

(defn- ee-sso-configured? []
  (when config/ee-available?
    (classloader/require 'metabase-enterprise.sso.integrations.sso-settings))
  (when-let [varr (resolve 'metabase-enterprise.sso.integrations.sso-settings/other-sso-enabled?)]
    (varr)))

(defn sso-enabled?
  "Any SSO provider is configured and enabled"
  []
  (or (google-auth-enabled?)
      (ldap-enabled?)
      (ee-sso-configured?)))

(defsetting check-for-updates
  (deferred-tru "Identify when new versions of Metabase are available.")
  :type    :boolean
  :audit   :getter
  :default true)

(defsetting version-info
  (deferred-tru "Information about available versions of Metabase.")
  :type    :json
  :audit   :never
  :default {}
  :doc     false)

(defsetting version-info-last-checked
  (deferred-tru "Indicates when Metabase last checked for new versions.")
  :visibility :public
  :type       :timestamp
  :audit      :never
  :default    nil
  :doc        false)

(defsetting startup-time-millis
  (deferred-tru "The startup time in milliseconds")
  :visibility :public
  :type       :double
  :audit      :never
  :default    0.0
  :doc        false)

(defsetting site-name
  (deferred-tru "The name used for this instance of {0}."
                (application-name-for-setting-descriptions))
  :default    "Metabase"
  :audit      :getter
  :visibility :settings-manager)

(defsetting custom-homepage
  (deferred-tru "Pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, Metabase will redirect them to the default homepage.")
  :default    false
  :type       :boolean
  :audit      :getter
  :visibility :public)

(defsetting custom-homepage-dashboard
  (deferred-tru "ID of dashboard to use as a homepage")
  :type       :integer
  :visibility :public
  :audit      :getter)

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

;; `::uuid-nonce` is a Setting that sets a site-wide random UUID value the first time it is fetched.
(defmethod setting/get-value-of-type ::uuid-nonce
  [_ setting]
  (or (setting/get-value-of-type :string setting)
      (let [value (str (random-uuid))]
        (setting/set-value-of-type! :string setting value)
        value)))

(defmethod setting/set-value-of-type! ::uuid-nonce
  [_ setting new-value]
  (setting/set-value-of-type! :string setting new-value))

(defmethod setting/default-tag-for-type ::uuid-nonce
  [_]
  `String)

(defsetting site-uuid
  ;; Don't i18n this docstring because it's not user-facing! :)
  "Unique identifier used for this instance of {0}. This is set once and only once the first time it is fetched via
  its magic getter. Nice!"
  :visibility :authenticated
  :setter     :none
  ;; magic getter will either fetch value from DB, or if no value exists, set the value to a random UUID.
  :type       ::uuid-nonce
  :doc        false)

(defsetting site-uuid-for-premium-features-token-checks
  "In the interest of respecting everyone's privacy and keeping things as anonymous as possible we have a *different*
  site-wide UUID that we use for the EE/premium features token feature check API calls. It works in fundamentally the
  same way as [[site-uuid]] but should only be used by the token check logic
  in [[metabase.public-settings.premium-features/fetch-token-status]]. (`site-uuid` is used for anonymous
  analytics/stats and if we sent it along with the premium features token check API request it would no longer be
  anonymous.)"
  :visibility :internal
  :setter     :none
  :type       ::uuid-nonce
  :doc        false)

(defsetting site-uuid-for-version-info-fetching
  "A *different* site-wide UUID that we use for the version info fetching API calls. Do not use this for any other
  applications. (See [[site-uuid-for-premium-features-token-checks]] for more reasoning.)"
  :visibility :internal
  :setter     :none
  :type       ::uuid-nonce)

(defsetting site-uuid-for-unsubscribing-url
  "UUID that we use for generating urls users to unsubscribe from alerts. The hash is generated by
  hash(secret_uuid + email + subscription_id) = url. Do not use this for any other applications. (See #29955)"
  :visibility :internal
  :setter     :none
  :type       ::uuid-nonce)

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

(declare redirect-all-requests-to-https!)

;; This value is *guaranteed* to never have a trailing slash :D
;; It will also prepend `http://` to the URL if there's no protocol when it comes in
(defsetting site-url
  (deferred-tru
   (str "This URL is used for things like creating links in emails, auth redirects, and in some embedding scenarios, "
        "so changing it could break functionality or get you locked out of this instance."))
  :visibility :public
  :audit      :getter
  :getter     (fn []
                (try
                  (some-> (setting/get-value-of-type :string :site-url) normalize-site-url)
                  (catch clojure.lang.ExceptionInfo e
                    (log/error e (trs "site-url is invalid; returning nil for now. Will be reset on next request.")))))
  :setter     (fn [new-value]
                (let [new-value (some-> new-value normalize-site-url)
                      https?    (some-> new-value (str/starts-with?  "https:"))]
                  ;; if the site URL isn't HTTPS then disable force HTTPS redirects if set
                  (when-not https?
                    (redirect-all-requests-to-https! false))
                  (setting/set-value-of-type! :string :site-url new-value))))

(defsetting site-locale
  (deferred-tru
    (str "The default language for all users across the {0} UI, system emails, pulses, and alerts. "
         "Users can individually override this default language from their own account settings.")
    (application-name-for-setting-descriptions))
  :default    "en"
  :visibility :public
  :audit      :getter
  :getter     (fn []
                (let [value (setting/get-value-of-type :string :site-locale)]
                  (when (i18n/available-locale? value)
                    value)))
  :setter     (fn [new-value]
                (when new-value
                  (when-not (i18n/available-locale? new-value)
                    (throw (ex-info (tru "Invalid locale {0}" (pr-str new-value)) {:status-code 400}))))
                (setting/set-value-of-type! :string :site-locale (some-> new-value i18n/normalized-locale-string))))

(defsetting admin-email
  (deferred-tru "The email address users should be referred to if they encounter a problem.")
  :visibility :authenticated
  :audit      :getter)

(defsetting anon-tracking-enabled
  (deferred-tru "Enable the collection of anonymous usage data in order to help {0} improve."
                (application-name-for-setting-descriptions))
  :type       :boolean
  :default    true
  :visibility :public
  :audit      :getter)

(defsetting ga-code
  (deferred-tru "Google Analytics tracking code.")
  :default    "UA-60817802-1"
  :visibility :public
  :doc        false)

(defsetting ga-enabled
  (deferred-tru "Boolean indicating whether analytics data should be sent to Google Analytics on the frontend")
  :type       :boolean
  :setter     :none
  :getter     (fn [] (and config/is-prod? (anon-tracking-enabled)))
  :visibility :public
  :audit      :never
  :doc        false)

(defsetting map-tile-server-url
  (deferred-tru "The map tile server URL template used in map visualizations, for example from OpenStreetMaps or MapBox.")
  :default    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  :visibility :public
  :audit      :getter)

(defsetting landing-page
  (deferred-tru "Default page to show people when they log in.")
  :visibility :public
  :type       :string
  :default    ""
  :audit      :getter)

(defsetting enable-public-sharing
  (deferred-tru "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :audit      :getter)

(defsetting enable-embedding
  (deferred-tru "Allow admins to securely embed questions and dashboards within other applications?")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :audit      :getter)

(defsetting embedding-app-origin
  (deferred-tru "Allow this origin to embed the full {0} application"
                (application-name-for-setting-descriptions))
  :feature    :embedding
  :visibility :public
  :audit      :getter)

(defsetting enable-nested-queries
  (deferred-tru "Allow using a saved question or Model as the source for other queries?")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)

(defsetting enable-query-caching
  (deferred-tru "Enabling caching will save the results of queries that take a long time to run.")
  :type       :boolean
  :default    false
  :visibility :authenticated
  :audit      :getter)

(defsetting persisted-models-enabled
  (deferred-tru "Allow persisting models into the source database.")
  :type       :boolean
  :default    false
  :visibility :public
  :audit      :getter)

(defsetting persisted-model-refresh-cron-schedule
  (deferred-tru "cron syntax string to schedule refreshing persisted models.")
  :type       :string
  :default    "0 0 0/6 * * ? *"
  :visibility :admin
  :audit      :getter)

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
  :audit   :getter
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
             (setting/set-value-of-type! :integer :query-caching-max-kb new-value)))

(defsetting query-caching-max-ttl
  (deferred-tru "The absolute maximum time to keep any cached query results, in seconds.")
  :type    :double
  :default (* 60.0 60.0 24.0 100.0) ; 100 days
  :audit   :getter)

;; TODO -- this isn't really a TTL at all. Consider renaming to something like `-min-duration`
(defsetting query-caching-min-ttl
  (deferred-tru "{0} will cache all saved questions with an average query execution time longer than this many seconds:"
                 (application-name-for-setting-descriptions))
  :type    :double
  :default 60.0
  :audit   :getter)

(defsetting query-caching-ttl-ratio
  (deferred-tru
   (str "To determine how long each saved question''s cached result should stick around, we take the query''s average "
        "execution time and multiply that by whatever you input here. So if a query takes on average 2 minutes to run, "
        "and you input 10 for your multiplier, its cache entry will persist for 20 minutes."))
  :type    :integer
  :default 10
  :audit   :getter)

(defsetting notification-link-base-url
  (deferred-tru "By default \"Site Url\" is used in notification links, but can be overridden.")
  :visibility :internal
  :type       :string
  :enabled?   premium-features/hide-embed-branding?
  :audit      :getter)

(defsetting deprecation-notice-version
  (deferred-tru "Metabase version for which a notice about usage of deprecated features has been shown.")
  :visibility :admin
  :doc        false
  :audit      :never)

(defsetting loading-message
  (deferred-tru "Message to show while a query is running.")
  :visibility :public
  :enabled?   premium-features/enable-whitelabeling?
  :type       :keyword
  :default    :doing-science
  :audit      :getter)

(defsetting application-colors
  (deferred-tru
    (str "These are the primary colors used in charts and throughout {0}. "
         "You might need to refresh your browser to see your changes take effect.")
    (application-name-for-setting-descriptions))
  :visibility :public
  :type       :json
  :enabled?   premium-features/enable-whitelabeling?
  :default    {}
  :audit      :getter)

(defsetting application-font
  (deferred-tru "This will replace “Lato” as the font family.")
  :visibility :public
  :type       :string
  :default    "Lato"
  :enabled?   premium-features/enable-whitelabeling?
  :audit      :getter
  :setter     (fn [new-value]
                  (when new-value
                    (when-not (u.fonts/available-font? new-value)
                      (throw (ex-info (tru "Invalid font {0}" (pr-str new-value)) {:status-code 400}))))
                  (setting/set-value-of-type! :string :application-font new-value)))

(defsetting application-font-files
  (deferred-tru "Tell us where to find the file for each font weight. You don’t need to include all of them, but it’ll look better if you do.")
  :visibility :public
  :type       :json
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?)

(defn application-color
  "The primary color, a.k.a. brand color"
  []
  (or (:brand (application-colors)) "#509EE3"))

(defn secondary-chart-color
  "The first 'Additional chart color'"
  []
  (or (:accent3 (application-colors)) "#EF8C8C"))

(defsetting application-logo-url
  (deferred-tru "For best results, use an SVG file with a transparent background.")
  :visibility :public
  :type       :string
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?
  :default    "app/assets/img/logo.svg")

(defsetting application-favicon-url
  (deferred-tru "The url or image that you want to use as the favicon.")
  :visibility :public
  :type       :string
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?
  :default    "app/assets/img/favicon.ico")

(defsetting show-metabot
  (deferred-tru "Enables Metabot character on the home page")
  :visibility :public
  :type       :boolean
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?
  :default    true)

(defsetting show-lighthouse-illustration
  (deferred-tru "Display the lighthouse illustration on the home and login pages.")
  :visibility :public
  :type       :boolean
  :audit      :getter
  :enabled?   premium-features/enable-whitelabeling?
  :default    true)

(defsetting enable-password-login
  (deferred-tru "Allow logging in by email and password.")
  :visibility :public
  :type       :boolean
  :default    true
  :feature    :disable-password-login
  :audit      :raw-value
  :getter     (fn []
                ;; if `:enable-password-login` has an *explict* (non-default) value, and SSO is configured, use that;
                ;; otherwise this always returns true.
                (let [v (setting/get-value-of-type :boolean :enable-password-login)]
                  (if (and (some? v)
                           (sso-enabled?))
                    v
                    true))))

(defsetting breakout-bins-num
  (deferred-tru
    (str "When using the default binning strategy and a number of bins is not provided, "
         "this number will be used as the default."))
  :type    :integer
  :default 8
  :audit   :getter)

(defsetting breakout-bin-width
  (deferred-tru
   (str "When using the default binning strategy for a field of type Coordinate (such as Latitude and Longitude), "
        "this number will be used as the default bin width (in degrees)."))
  :type    :double
  :default 10.0
  :audit   :getter)

(defsetting custom-formatting
  (deferred-tru "Object keyed by type, containing formatting settings")
  :type       :json
  :default    {}
  :visibility :public
  :audit      :getter)

(defsetting enable-xrays
  (deferred-tru "Allow users to explore data using X-rays")
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)

(defsetting show-homepage-data
  (deferred-tru
   (str "Whether or not to display data on the homepage. "
        "Admins might turn this off in order to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)

(defsetting show-homepage-xrays
  (deferred-tru
    (str "Whether or not to display x-ray suggestions on the homepage. They will also be hidden if any dashboards are "
         "pinned. Admins might hide this to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :audit      :getter)

(defsetting show-homepage-pin-message
  (deferred-tru
   (str "Whether or not to display a message about pinning dashboards. It will also be hidden if any dashboards are "
        "pinned. Admins might hide this to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :doc        false
  :audit      :getter)

(defsetting source-address-header
  (deferred-tru "Identify the source of HTTP requests by this header's value, instead of its remote address.")
  :default "X-Forwarded-For"
  :audit   :getter
  :getter  (fn [] (some-> (setting/get-value-of-type :string :source-address-header)
                          u/lower-case-en)))

(defn remove-public-uuid-if-public-sharing-is-disabled
  "If public sharing is *disabled* and `object` has a `:public_uuid`, remove it so people don't try to use it (since it
  won't work). Intended for use as part of a `post-select` implementation for Cards and Dashboards."
  [object]
  (if (and (:public_uuid object)
           (not (enable-public-sharing)))
    (assoc object :public_uuid nil)
    object))

(defsetting available-fonts
  "Available fonts"
  :visibility :public
  :setter     :none
  :getter     u.fonts/available-fonts
  :doc        false)

(defsetting available-locales
  "Available i18n locales"
  :visibility :public
  :setter     :none
  :getter     available-locales-with-names
  :doc        false)

(defsetting available-timezones
  "Available report timezone options"
  :visibility :public
  :setter     :none
  :getter     (comp sort t/available-zone-ids)
  :doc        false)

(defsetting has-sample-database?
  "Whether this instance has a Sample Database database"
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (t2/exists? :model/Database, :is_sample true))
  :doc        false)

(defsetting password-complexity
  "Current password complexity requirements"
  :visibility :public
  :setter     :none
  :getter     u.password/active-password-complexity)

(defsetting session-cookies
  (deferred-tru "When set, enforces the use of session cookies for all users which expire when the browser is closed.")
  :type       :boolean
  :visibility :public
  :default    nil
  :audit      :getter)

(defsetting version
  "Metabase's version info"
  :visibility :public
  :setter     :none
  :getter     (constantly config/mb-version-info)
  :doc        false)

(defsetting token-features
  "Features registered for this instance's token"
  :visibility :public
  :setter     :none
  :getter     (fn [] {:advanced_permissions           (premium-features/enable-advanced-permissions?)
                      :audit_app                      (premium-features/enable-audit-app?)
                      :cache_granular_controls        (premium-features/enable-cache-granular-controls?)
                      :config_text_file               (premium-features/enable-config-text-file?)
                      :content_verification           (premium-features/enable-content-verification?)
                      :dashboard_subscription_filters (premium-features/enable-dashboard-subscription-filters?)
                      :disable_password_login         (premium-features/can-disable-password-login?)
                      :email_allow_list               (premium-features/enable-email-allow-list?)
                      :email_restrict_recipients      (premium-features/enable-email-restrict-recipients?)
                      :embedding                      (premium-features/hide-embed-branding?)
                      :hosting                        (premium-features/is-hosted?)
                      :official_collections           (premium-features/enable-official-collections?)
                      :sandboxes                      (premium-features/enable-sandboxes?)
                      :session_timeout_config         (premium-features/enable-session-timeout-config?)
                      :snippet_collections            (premium-features/enable-snippet-collections?)
                      :sso_google                     (premium-features/enable-sso-google?)
                      :sso_jwt                        (premium-features/enable-sso-jwt?)
                      :sso_ldap                       (premium-features/enable-sso-ldap?)
                      :sso_saml                       (premium-features/enable-sso-saml?)
                      :whitelabel                     (premium-features/enable-whitelabeling?)})
  :doc        false)

(defsetting redirect-all-requests-to-https
  (deferred-tru "Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS")
  :visibility :public
  :type       :boolean
  :default    false
  :audit      :getter
  :setter     (fn [new-value]
                ;; if we're trying to enable this setting, make sure `site-url` is actually an HTTPS URL.
                (when (if (string? new-value)
                        (setting/string->boolean new-value)
                        new-value)
                  (assert (some-> (site-url) (str/starts-with? "https:"))
                          (tru "Cannot redirect requests to HTTPS unless `site-url` is HTTPS.")))
                (setting/set-value-of-type! :boolean :redirect-all-requests-to-https new-value)))

(defsetting start-of-week
  (deferred-tru
    (str "This will affect things like grouping by week or filtering in GUI queries. "
         "It won''t affect most SQL queries, "
         "although it is used to set the WEEK_START session variable in Snowflake."))
  :visibility :public
  :type       :keyword
  :default    :sunday
  :audit      :raw-value
  :getter     (fn []
                ;; if something invalid is somehow in the DB just fall back to Sunday
                (when-let [value (setting/get-value-of-type :keyword :start-of-week)]
                  (if (#{:monday :tuesday :wednesday :thursday :friday :saturday :sunday} value)
                    value
                    :sunday)))
  :setter      (fn [new-value]
                 (when new-value
                   (assert (#{:monday :tuesday :wednesday :thursday :friday :saturday :sunday} (keyword new-value))
                           (trs "Invalid day of week: {0}" (pr-str new-value))))
                 (setting/set-value-of-type! :keyword :start-of-week new-value)))

(defsetting cloud-gateway-ips
  (deferred-tru "Metabase Cloud gateway IP addresses, to configure connections to DBs behind firewalls")
  :visibility :public
  :type       :string
  :setter     :none
  :getter (fn []
            (when (premium-features/is-hosted?)
              (some-> (setting/get-value-of-type :string :cloud-gateway-ips)
                      (str/split #",")))))

(defsetting show-database-syncing-modal
  (deferred-tru
    (str "Whether an introductory modal should be shown after the next database connection is added. "
         "Defaults to false if any non-default database has already finished syncing for this instance."))
  :visibility :admin
  :type       :boolean
  :audit      :never
  :getter     (fn []
                (let [v (setting/get-value-of-type :boolean :show-database-syncing-modal)]
                  (if (nil? v)
                    (not (t2/exists? :model/Database
                                     :is_sample false
                                     :is_audit false
                                     :initial_sync_status "complete"))
                    ;; frontend should set this value to `true` after the modal has been shown once
                    v))))

(defsetting uploads-enabled
  (deferred-tru "Whether or not uploads are enabled")
  :visibility :authenticated
  :type       :boolean
  :audit      :getter
  :default    false)

(defn- not-handling-api-request?
  []
  (nil? @api/*current-user*))

(defn set-uploads-database-id!
  "Sets the :uploads-database-id setting, with an appropriate permission check."
  [new-id]
  (if (or (not-handling-api-request?)
          (mi/can-write? :model/Database new-id))
    (setting/set-value-of-type! :integer :uploads-database-id new-id)
    (api/throw-403)))

(defsetting uploads-database-id
  (deferred-tru "Database ID for uploads")
  :visibility :authenticated
  :type       :integer
  :audit      :getter
  :setter     set-uploads-database-id!)

(defsetting uploads-schema-name
  (deferred-tru "Schema name for uploads")
  :visibility :authenticated
  :type       :string
  :audit      :getter)

(defsetting uploads-table-prefix
  (deferred-tru "Prefix for upload table names")
  :visibility :authenticated
  :type       :string
  :audit      :getter)
