(ns metabase.driver.common
  "Shared definitions and helper functions for use across different drivers."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; TODO - we should rename these from `default-*-details` to `default-*-connection-property`

(def default-host-details
  "Map of the db host details field, useful for `connection-properties` implementations"
  {:name         "host"
   :display-name (deferred-tru "Host")
   :helper-text  (deferred-tru "Your database's IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).")
   :placeholder  "name.database.com"})

(def default-port-details
  "Map of the db port details field, useful for `connection-properties` implementations. Implementations should assoc a
  `:placeholder` key."
  {:name         "port"
   :display-name (deferred-tru "Port")
   :type         :integer})

(def default-user-details
  "Map of the db user details field, useful for `connection-properties` implementations"
  {:name         "user"
   :display-name (deferred-tru "Username")
   :placeholder  (deferred-tru "username")
   :required     true})

(def default-password-details
  "Map of the db password details field, useful for `connection-properties` implementations"
  {:name         "password"
   :display-name (deferred-tru "Password")
   :type         :password
   :placeholder  "••••••••"})

(def default-dbname-details
  "Map of the db name details field, useful for `connection-properties` implementations"
  {:name         "dbname"
   :display-name (deferred-tru "Database name")
   :placeholder  (deferred-tru "birds_of_the_world")
   :required     true})

(def default-ssl-details
  "Map of the db ssl details field, useful for `connection-properties` implementations"
  {:name         "ssl"
   :display-name (deferred-tru "Use a secure connection (SSL)")
   :type         :boolean
   :default      false})

(def additional-options
  "Map of the db `additional-options` details field, useful for `connection-properties` implementations. Should assoc a
  `:placeholder` key"
  {:name         "additional-options"
   :display-name (deferred-tru "Additional JDBC connection string options")
   :visible-if   {"advanced-options" true}})

(def ssh-tunnel-preferences
  "Configuration parameters to include in the add driver page on drivers that
  support ssh tunnels"
  [{:name         "tunnel-enabled"
    :display-name (deferred-tru "Use an SSH tunnel")
    :placeholder  (deferred-tru "Enable this SSH tunnel?")
    :type         :boolean
    :default      false}
   {:name         "tunnel-host"
    :display-name (deferred-tru "SSH tunnel host")
    :helper-text  (deferred-tru "The hostname that you use to connect to SSH tunnels.")
    :placeholder  "hostname"
    :required     true
    :visible-if   {"tunnel-enabled" true}}
   {:name         "tunnel-port"
    :display-name (deferred-tru "SSH tunnel port")
    :type         :integer
    :default      22
    :required     false
    :visible-if   {"tunnel-enabled" true}}
   {:name         "tunnel-user"
    :display-name (deferred-tru "SSH tunnel username")
    :helper-text  (deferred-tru "The username you use to login to your SSH tunnel.")
    :placeholder  "username"
    :required     true
    :visible-if   {"tunnel-enabled" true}}
   ;; this is entirely a UI flag
   {:name         "tunnel-auth-option"
    :display-name (deferred-tru "SSH Authentication")
    :type         :select
    :options      [{:name (deferred-tru "SSH Key") :value "ssh-key"}
                   {:name (deferred-tru "Password") :value "password"}]
    :default      "ssh-key"
    :visible-if   {"tunnel-enabled" true}}
   {:name         "tunnel-pass"
    :display-name (deferred-tru "SSH tunnel password")
    :type         :password
    :placeholder  "******"
    :visible-if   {"tunnel-auth-option" "password"}}
   {:name         "tunnel-private-key"
    :display-name (deferred-tru "SSH private key to connect to the tunnel")
    :type         :string
    :placeholder  (deferred-tru "Paste the contents of an SSH private key here")
    :required     true
    :visible-if   {"tunnel-auth-option" "ssh-key"}}
   {:name         "tunnel-private-key-passphrase"
    :display-name (deferred-tru "Passphrase for SSH private key")
    :type         :password
    :placeholder  "******"
    :visible-if   {"tunnel-auth-option" "ssh-key"}}])

(def advanced-options-start
  "Map representing the start of the advanced option section in a DB connection form. Fields in this section should
  have their visibility controlled using the `visible-if` property."
  {:name    "advanced-options"
   :type    :section
   :default false})

(def auto-run-queries
  "Map representing the `auto-run-queries` option in a DB connection form."
  {:name         "auto_run_queries"
   :type         :boolean
   :default      true
   :display-name (deferred-tru "Rerun queries for simple explorations")
   :description  (deferred-tru
                   (str "We execute the underlying query when you explore data using Summarize or Filter. "
                        "This is on by default but you can turn it off if performance is slow."))
   :visible-if   {"advanced-options" true}})

(def let-user-control-scheduling
  "Map representing the `let-user-control-scheduling` option in a DB connection form."
  {:name         "let-user-control-scheduling"
   :type         :boolean
   :display-name (deferred-tru "Choose when syncs and scans happen")
   :description  (deferred-tru "By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.")
   :visible-if   {"advanced-options" true}})

(def metadata-sync-schedule
  "Map representing the `schedules.metadata_sync` option in a DB connection form, which should be only visible if
  `let-user-control-scheduling` is enabled."
  {:name "schedules.metadata_sync"
   :display-name (deferred-tru "Database syncing")
   :description  (deferred-tru
                   (str "This is a lightweight process that checks for updates to this database’s schema. "
                        "In most cases, you should be fine leaving this set to sync hourly."))
   :visible-if   {"let-user-control-scheduling" true}})

(def cache-field-values-schedule
  "Map representing the `schedules.cache_field_values` option in a DB connection form, which should be only visible if
  `let-user-control-scheduling` is enabled."
  {:name "schedules.cache_field_values"
   :display-name (deferred-tru "Scanning for Filter Values")
   :description  (deferred-tru
                   (str "Metabase can scan the values present in each field in this database to enable checkbox "
                        "filters in dashboards and questions. This can be a somewhat resource-intensive process, "
                        "particularly if you have a very large database. When should Metabase automatically scan "
                        "and cache field values?"))
   :visible-if   {"let-user-control-scheduling" true}})

(def json-unfolding
  "Map representing the `json-unfolding` option in a DB connection form"
  {:name         "json-unfolding"
   :display-name (deferred-tru "Allow unfolding of JSON columns")
   :type         :boolean
   :visible-if   {"advanced-options" true}
   :description  (deferred-tru
                   (str "This enables unfolding JSON columns into their component fields. "
                        "Disable unfolding if performance is slow. If enabled, you can still disable unfolding for "
                        "individual fields in their settings."))
   :default      true})

(def refingerprint
  "Map representing the `refingerprint` option in a DB connection form."
  {:name         "refingerprint"
   :type         :boolean
   :display-name (deferred-tru "Periodically refingerprint tables")
   :description  (deferred-tru
                   (str "This enables Metabase to scan for additional field values during syncs allowing smarter "
                        "behavior, like improved auto-binning on your bar charts."))
   :visible-if   {"advanced-options" true}})

(def default-advanced-options
  "Vector containing the three most common options present in the advanced option section of the DB connection form."
  [auto-run-queries let-user-control-scheduling metadata-sync-schedule cache-field-values-schedule refingerprint])

(def default-options
  "Default options listed above, keyed by name. These keys can be listed in the plugin manifest to specify connection
  properties for drivers shipped as separate modules, e.g.:

    connection-properties:
      - db-name
      - host

  See the [plugin manifest reference](https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference)
  for more details."
  {:dbname                   default-dbname-details
   :host                     default-host-details
   :password                 default-password-details
   :port                     default-port-details
   :ssl                      default-ssl-details
   :user                     default-user-details
   :ssh-tunnel               ssh-tunnel-preferences
   :additional-options       additional-options
   :advanced-options-start   advanced-options-start
   :default-advanced-options default-advanced-options})

(def cloud-ip-address-info
  "Map of the `cloud-ip-address-info` info field. The getter is invoked and converted to a `:placeholder` value prior
  to being returned to the client, in [[metabase.driver.util/connection-props-server->client]]."
  {:name   "cloud-ip-address-info"
   :type   :info
   :getter (fn []
             (when-let [ips (public-settings/cloud-gateway-ips)]
               (str (deferred-tru
                      (str "If your database is behind a firewall, you may need to allow connections from our Metabase "
                           "[Cloud IP addresses](https://www.metabase.com/cloud/docs/ip-addresses-to-whitelist.html):"))
                    "\n"
                    (str/join " - " ips))))})

(def default-connection-info-fields
  "Default definitions for informational banners that can be included in a database connection form. These keys can be
  added to the plugin manifest as connection properties, similar to the keys in the `default-options` map."
  {:cloud-ip-address-info cloud-ip-address-info})

(def auth-provider-options
  "Options for using an auth provider instead of a literal password."
  [{:name "use-auth-provider"
    :type :section
    :default false}
   {:name "auth-provider"
    :display-name (deferred-tru "Auth provider")
    :type :select
    :options [{:name (deferred-tru "Azure Managed Identity")
               :value "azure-managed-identity"}
              {:name (deferred-tru "OAuth")
               :value "oauth"}]
    :default "azure-managed-identity"
    :visible-if {"use-auth-provider" true}}
   {:name "azure-managed-identity-client-id"
    :display-name (deferred-tru "Client ID")
    :required true
    :visible-if {"auth-provider" "azure-managed-identity"}}
   {:name "oauth-token-url"
    :display-name (deferred-tru "Auth token URL")
    :required true
    :visible-if {"auth-provider" "oauth"}}
   {:name "oauth-token-headers"
    :display-name (deferred-tru "Auth token request headers (a JSON map)")
    :visible-if {"auth-provider" "oauth"}}])


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Class -> Base Type                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn class->base-type
  "Return the `Field.base_type` that corresponds to a given class returned by the DB.
   This is used to infer the types of results that come back from native queries."
  [klass]
  (condp #(isa? %2 %1) klass
    Boolean                        :type/Boolean
    Double                         :type/Float
    Float                          :type/Float
    Integer                        :type/Integer
    Long                           :type/Integer
    java.math.BigDecimal           :type/Decimal
    java.math.BigInteger           :type/BigInteger
    Number                         :type/Number
    String                         :type/Text
    ;; java.sql types should be considered DEPRECATED
    java.sql.Date                  :type/Date
    java.sql.Timestamp             :type/DateTime
    java.util.Date                 :type/Date
    java.util.UUID                 :type/UUID
    clojure.lang.IPersistentMap    :type/Dictionary
    clojure.lang.IPersistentVector :type/Array
    java.time.LocalDate            :type/Date
    java.time.LocalTime            :type/Time
    java.time.LocalDateTime        :type/DateTime
    ;; `OffsetTime` and `OffsetDateTime` should be mapped to one of `type/TimeWithLocalTZ`/`type/TimeWithZoneOffset`
    ;; and `type/DateTimeWithLocalTZ`/`type/DateTimeWithZoneOffset` respectively. We can't really tell how they're
    ;; stored in the DB based on class alone, so drivers should return more specific types where possible. See
    ;; discussion in the `metabase.types` namespace.
    java.time.OffsetTime           :type/TimeWithTZ
    java.time.OffsetDateTime       :type/DateTimeWithTZ
    java.time.ZonedDateTime        :type/DateTimeWithZoneID
    java.time.Instant              :type/Instant
    ;; TODO - this should go in the Postgres driver implementation of this method rather than here
    org.postgresql.util.PGobject   :type/*
    ;; all-NULL columns in DBs like Mongo w/o explicit types
    nil                            :type/*
    (do
      (log/warnf "Don't know how to map class '%s' to a Field base_type, falling back to :type/*." klass)
      :type/*)))

(def ^:private column-info-sample-size
  "Number of result rows to sample when when determining base type."
  100)

(defn values->base-type
  "Transducer that given a sequence of `values`, returns the most common base type."
  []
  ((comp (filter some?) (take column-info-sample-size) (map class))
   (fn
     ([]
      (doto (java.util.HashMap.)
        (.put nil 0)))                  ; fallback to keep `max-key` happy if no values
     ([^java.util.HashMap freqs, klass]
      (.put freqs klass (inc (.getOrDefault freqs klass 0)))
      freqs)
     ([freqs]
      (->> freqs
           (apply max-key val)
           key
           class->base-type)))))

(def ^:private ^clojure.lang.PersistentVector days-of-week
  [:monday :tuesday :wednesday :thursday :friday :saturday :sunday])

(def ^:dynamic *start-of-week*
  "Used to override the [[metabase.public-settings/start-of-week]] settings.
  Primarily being used to calculate week-of-year in US modes where the start-of-week is always Sunday.
  More in (defmethod date [:sql :week-of-year-us])."
  nil)

(mu/defn start-of-week->int :- [:int {:min 0, :max 6, :error/message "Start of week integer"}]
  "Returns the int value for the current [[metabase.public-settings/start-of-week]] Setting value, which ranges from
  `0` (`:monday`) to `6` (`:sunday`). This is guaranteed to return a value."
  {:added "0.42.0"}
  []
  (.indexOf days-of-week (or *start-of-week* (setting/get-value-of-type :keyword :start-of-week))))

(defn start-of-week-offset-for-day
  "Like [[start-of-week-offset]] but takes a `start-of-week` keyword like `:sunday` rather than ` driver`. Returns the
  offset (as a negative number) needed to adjust a day of week in the range 1..7 with `start-of-week` as one to a day
  of week in the range 1..7 with [[metabase.public-settings/start-of-week]] as 1."
  [start-of-week]
  (let [db-start-of-week     (.indexOf days-of-week start-of-week)
        target-start-of-week (start-of-week->int)
        delta                (int (- target-start-of-week db-start-of-week))]
    (* (Integer/signum delta)
       (- 7 (Math/abs delta)))))

(mu/defn start-of-week-offset :- :int
  "Return the offset needed to adjust a day of the week (in the range 1..7) returned by the `driver`, with `1`
  corresponding to [[driver/db-start-of-week]], so that `1` corresponds to [[metabase.public-settings/start-of-week]] in
  results.

  e.g.

  If `:my-driver` returns [[driver/db-start-of-week]] as `:sunday` (1 is Sunday, 2 is Monday, and so forth),
  and [[metabase.public-settings/start-of-week]] is `:monday` (the results should have 1 as Monday, 2 as Tuesday... 7 is
  Sunday), then the offset should be `-1`, because `:monday` returned by the driver (`2`) minus `1` = `1`."
  [driver]
  (start-of-week-offset-for-day (driver/db-start-of-week driver)))

(defn json-unfolding-default
  "Returns true if JSON fields should be unfolded by default for this database, and false otherwise."
  [database]
  ;; This allows adding support for nested-field-columns for drivers in the future and
  ;; have json-unfolding enabled by default, without
  ;; needing a migration to add the `json-unfolding=true` key to the database details.
  (let [json-unfolding (get-in database [:details :json-unfolding])]
    (if (nil? json-unfolding)
      true
      json-unfolding)))
