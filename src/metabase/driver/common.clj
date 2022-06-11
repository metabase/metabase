(ns metabase.driver.common
  "Shared definitions and helper functions for use across different drivers."
  (:require [clj-time.coerce :as time.coerce]
            [clj-time.core :as time]
            [clj-time.format :as time.format]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.models.setting :as setting]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [schema.core :as s])
  (:import java.text.SimpleDateFormat
           org.joda.time.DateTime
           org.joda.time.format.DateTimeFormatter))

;; TODO - we should rename these from `default-*-details` to `default-*-connection-property`

(def default-host-details
  "Map of the db host details field, useful for `connection-properties` implementations"
  {:name         "host"
   :display-name (deferred-tru "Host")
   :helper-text (deferred-tru "Your database's IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).")
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
   :description  (str (deferred-tru "We execute the underlying query when you explore data using Summarize or Filter.")
                      " "
                      (deferred-tru "This is on by default but you can turn it off if performance is slow."))
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
   :description  (str (deferred-tru "This is a lightweight process that checks for updates to this database’s schema.")
                      " "
                      (deferred-tru "In most cases, you should be fine leaving this set to sync hourly."))
   :visible-if   {"let-user-control-scheduling" true}})

(def cache-field-values-schedule
  "Map representing the `schedules.cache_field_values` option in a DB connection form, which should be only visible if
  `let-user-control-scheduling` is enabled."
  {:name "schedules.cache_field_values"
   :display-name (deferred-tru "Scanning for Filter Values")
   :description  (str (deferred-tru "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.")
                      " "
                      (deferred-tru "When should Metabase automatically scan and cache field values?"))
   :visible-if   {"let-user-control-scheduling" true}})

(def refingerprint
  "Map representing the `refingerprint` option in a DB connection form."
  {:name         "refingerprint"
   :type         :boolean
   :display-name (deferred-tru "Periodically refingerprint tables")
   :description  (deferred-tru "This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.")
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
               (str (deferred-tru "If your database is behind a firewall, you may need to allow connections from our Metabase Cloud IP addresses:")
                    "\n"
                    (str/join " - " ips))))})

(def default-connection-info-fields
  "Default definitions for informational banners that can be included in a database connection form. These keys can be
  added to the plugin manifest as connection properties, similar to the keys in the `default-options` map."
  {:cloud-ip-address-info cloud-ip-address-info})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Fetching Current Timezone                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defprotocol ^:private ^:deprecated ParseDateTimeString
  (^:private parse
   ^DateTime [this date-time-str]
   "Parse the `date-time-str` and return a `DateTime` instance."))

(extend-protocol ParseDateTimeString
  DateTimeFormatter
  (parse [formatter date-time-str]
    (time.format/parse formatter date-time-str)))

;; Java's SimpleDateFormat is more flexible on what it accepts for a time zone identifier. As an example, CEST is not
;; recognized by Joda's DateTimeFormatter but is recognized by Java's SimpleDateFormat. This defrecord is used to
;; dispatch parsing for SimpleDateFormat instances. Dispatching off of the SimpleDateFormat directly wouldn't be good
;; as it's not threadsafe. This will always create a new SimpleDateFormat instance and discard it after parsing the
;; date
(defrecord ^:private ^:deprecated ThreadSafeSimpleDateFormat [format-str]
  ParseDateTimeString
  (parse [_ date-time-str]
    (let [sdf         (SimpleDateFormat. format-str)
          parsed-date (.parse sdf date-time-str)
          joda-tz     (-> sdf .getTimeZone .getID time/time-zone-for-id)]
      (time/to-time-zone (time.coerce/from-date parsed-date) joda-tz))))

(defn ^:deprecated create-db-time-formatters
  "Creates date formatters from `DATE-FORMAT-STR` that will preserve the offset/timezone information. Will return a
  JodaTime date formatter and a core Java SimpleDateFormat. Results of this are threadsafe and can safely be def'd."
  [date-format-str]
  [(.withOffsetParsed ^DateTimeFormatter (time.format/formatter date-format-str))
   (ThreadSafeSimpleDateFormat. date-format-str)])

(defn- ^:deprecated first-successful-parse
  "Attempt to parse `time-str` with each of `date-formatters`, returning the first successful parse. If there are no
  successful parses throws the exception that the last formatter threw."
  ^DateTime [date-formatters time-str]
  (or (some #(u/ignore-exceptions (parse % time-str)) date-formatters)
      (doseq [formatter (reverse date-formatters)]
        (parse formatter time-str))))

(defmulti ^:deprecated current-db-time-native-query
  "Return a native query that will fetch the current time (presumably as a string) used by the `current-db-time`
  implementation below.

  DEPRECATED — `metabase.driver/current-db-time`, the method this function provides an implementation for, is itself
  deprecated. Implement `metabase.driver/db-default-timezone` instead directly."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti ^:deprecated current-db-time-date-formatters
  "Return JODA time date formatters to parse the current time returned by `current-db-time-native-query`. Used by
  `current-db-time` implementation below. You can use `create-db-time-formatters` provided by this namespace to create
  formatters for a date format string.

  DEPRECATED — `metabase.driver/current-db-time`, the method this function provides an implementation for, is itself
  deprecated. Implement `metabase.driver/db-default-timezone` instead directly."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn ^:deprecated current-db-time
  "Implementation of [[metabase.driver/current-db-time]] using the [[current-db-time-native-query]] and
  [[current-db-time-date-formatters]] multimethods defined above. Execute a native query for the current time, and
  parse the results using the date formatters, preserving the timezone. To use this implementation, you must implement
  the aforementioned multimethods; no default implementation is provided.

  DEPRECATED — [[metabase.driver/current-db-time]], the method this function provides an implementation for, is itself
  deprecated. Implement [[metabase.driver/db-default-timezone]] instead directly."
  ^org.joda.time.DateTime [driver database]
  {:pre [(map? database)]}
  (driver/with-driver driver
    (let [native-query    (current-db-time-native-query driver)
          date-formatters (current-db-time-date-formatters driver)
          time-str        (try
                            ;; need to initialize the store since we're calling `execute-reducible-query` directly
                            ;; instead of going thru normal QP pipeline
                            (qp.store/with-store
                              (qp.store/fetch-and-store-database! (u/the-id database))
                              (let [query {:database (u/the-id database), :native {:query native-query}}
                                    reduce (fn [_metadata reducible-rows]
                                             (transduce
                                              identity
                                              (fn
                                                ([] nil)
                                                ([row] (first row))
                                                ([_ row] (reduced row)))
                                              reducible-rows))]
                                (driver/execute-reducible-query driver query (context.default/default-context) reduce)))
                            (catch Exception e
                              (throw
                               (ex-info (tru "Error querying database {0} for current time: {1}"
                                             (pr-str (:name database)) (ex-message e))
                                        {:driver driver, :query native-query}
                                        e))))]
      (try
        (when time-str
          (first-successful-parse date-formatters time-str))
        (catch Exception e
          (throw
           (Exception.
            (str
             (tru "Unable to parse date string ''{0}'' for database engine ''{1}''"
                  time-str (-> database :engine name))) e)))))))


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
    ;; java.sql types and Joda-Time types should be considered DEPRECATED
    java.sql.Date                  :type/Date
    java.sql.Timestamp             :type/DateTime
    java.util.Date                 :type/Date
    DateTime                       :type/DateTime
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
      (log/warn (trs "Don''t know how to map class ''{0}'' to a Field base_type, falling back to :type/*." klass))
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

(s/defn start-of-week->int :- (s/pred (fn [n] (and (integer? n) (<= 0 n 6)))
                                      "Start of week integer")
  "Returns the int value for the current [[metabase.public-settings/start-of-week]] Setting value, which ranges from
  `0` (`:monday`) to `6` (`:sunday`). This is guaranteed to return a value."
  {:added "0.42.0"}
  []
  (.indexOf days-of-week (setting/get-value-of-type :keyword :start-of-week)))

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

(s/defn start-of-week-offset :- s/Int
  "Return the offset needed to adjust a day of the week (in the range 1..7) returned by the `driver`, with `1`
  corresponding to [[driver/db-start-of-week]], so that `1` corresponds to [[metabase.public-settings/start-of-week]] in
  results.

  e.g.

  If `:my-driver` returns [[driver/db-start-of-week]] as `:sunday` (1 is Sunday, 2 is Monday, and so forth),
  and [[metabase.public-settings/start-of-week]] is `:monday` (the results should have 1 as Monday, 2 as Tuesday... 7 is
  Sunday), then the offset should be `-1`, because `:monday` returned by the driver (`2`) minus `1` = `1`."
  [driver]
  (start-of-week-offset-for-day (driver/db-start-of-week driver)))
