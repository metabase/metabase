(ns metabase.driver.common
  "Shared definitions and helper functions for use across different drivers."
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [deferred-tru trs tru]])
  (:import java.text.SimpleDateFormat
           org.joda.time.DateTime
           org.joda.time.format.DateTimeFormatter))

(def connection-error-messages
  "Generic error messages that drivers should return in their implementation of `humanize-connection-error-message`."
  {:cannot-connect-check-host-and-port
   (str (deferred-tru "Hmm, we couldn''t connect to the database.")
        " "
        (deferred-tru "Make sure your host and port settings are correct"))

   :ssh-tunnel-auth-fail
   (str (deferred-tru "We couldn''t connect to the ssh tunnel host.")
        " "
        (deferred-tru "Check the username, password."))

   :ssh-tunnel-connection-fail
   (str (deferred-tru "We couldn''t connect to the ssh tunnel host.")
        " "
        (deferred-tru "Check the hostname and port."))

   :database-name-incorrect
   (deferred-tru "Looks like the database name is incorrect.")

   :invalid-hostname
   (str (deferred-tru "It looks like your host is invalid.")
        " "
        (deferred-tru "Please double-check it and try again."))

   :password-incorrect
   (deferred-tru "Looks like your password is incorrect.")

   :password-required
   (deferred-tru "Looks like you forgot to enter your password.")

   :username-incorrect
   (deferred-tru "Looks like your username is incorrect.")

   :username-or-password-incorrect
   (deferred-tru "Looks like the username or password is incorrect.")

   :certificate-not-trusted
   (deferred-tru "Server certificate not trusted - did you specify the correct SSL certificate chain?")

   :requires-ssl
   (deferred-tru "Server appears to require SSL - please enable SSL above")})

;; TODO - we should rename these from `default-*-details` to `default-*-connection-property`

(def default-host-details
  "Map of the db host details field, useful for `connection-properties` implementations"
  {:name         "host"
   :display-name (deferred-tru "Host")
   :placeholder  "localhost"})

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
   :placeholder  (deferred-tru "What username do you use to login to the database?")
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
   :display-name (deferred-tru "Use a secure connection (SSL)?")
   :type         :boolean
   :default      false})

(def default-additional-options-details
  "Map of the db `additional-options` details field, useful for `connection-properties` implementations. Should assoc a
  `:placeholder` key"
  {:name         "additional-options"
   :display-name (deferred-tru "Additional JDBC connection string options")})

(def default-options
  "Default options listed above, keyed by name. These keys can be listed in the plugin manifest to specify connection
  properties for drivers shipped as separate modules, e.g.:

    connection-properties:
      - db-name
      - host

  See the [plugin manifest reference](https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference)
  for more details."
  {:additional-options default-additional-options-details
   :dbname             default-dbname-details
   :host               default-host-details
   :password           default-password-details
   :port               default-port-details
   :ssl                default-ssl-details
   :user               default-user-details})


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
    (tformat/parse formatter date-time-str)))

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
      (time/to-time-zone (tcoerce/from-date parsed-date) joda-tz))))

(defn ^:deprecated create-db-time-formatters
  "Creates date formatters from `DATE-FORMAT-STR` that will preserve the offset/timezone information. Will return a
  JodaTime date formatter and a core Java SimpleDateFormat. Results of this are threadsafe and can safely be def'd."
  [date-format-str]
  [(.withOffsetParsed ^DateTimeFormatter (tformat/formatter date-format-str))
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
  "Implementation of `driver/current-db-time` using the `current-db-time-native-query` and
  `current-db-time-date-formatters` multimethods defined above. Execute a native query for the current time, and parse
  the results using the date formatters, preserving the timezone. To use this implementation, you must implement the
  aforementioned multimethods; no default implementation is provided.

  DEPRECATED — `metabase.driver/current-db-time`, the method this function provides an implementation for, is itself
  deprecated. Implement `metabase.driver/db-default-timezone` instead directly."
  ^org.joda.time.DateTime [driver database]
  {:pre [(map? database)]}
  (driver/with-driver driver
    (let [native-query    (current-db-time-native-query driver)
          date-formatters (current-db-time-date-formatters driver)
          settings        (when-let [report-tz (driver.u/report-timezone-if-supported driver)]
                            {:settings {:report-timezone report-tz}})
          time-str        (try
                            ;; need to initialize the store since we're calling `execute-reducible-query` directly
                            ;; instead of going thru normal QP pipeline
                            (qp.store/with-store
                              (qp.store/fetch-and-store-database! (u/get-id database))
                              (let [query {:database (u/get-id database), :native {:query native-query}}
                                    reduce (fn [metadata reducible-rows]
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
                               (Exception.
                                (format "Error querying database '%s' for current time" (:name database)) e))))]
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
     ([] (java.util.HashMap. {nil 0})) ; fallback to keep `max-key` happy if no values
     ([^java.util.HashMap freqs, klass]
      (.put freqs klass (inc (.getOrDefault freqs klass 0)))
      freqs)
     ([freqs]
      (->> freqs
           (apply max-key val)
           key
           class->base-type)))))
