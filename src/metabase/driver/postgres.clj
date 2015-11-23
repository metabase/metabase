(ns metabase.driver.postgres
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (clojure [set :refer [rename-keys]]
                     [string :as s])
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as utils]
            [swiss.arrows :refer :all]
            [metabase.db :refer [upd]]
            [metabase.models.field :refer [Field]]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.util :refer [with-jdbc-metadata]])
  ;; This is necessary for when NonValidatingFactory is passed in the sslfactory connection string argument,
  ;; e.x. when connecting to a Heroku Postgres database from outside of Heroku.
  (:import org.postgresql.ssl.NonValidatingFactory))

(defn- column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  [_ column-type]
  ({:bigint        :BigIntegerField
    :bigserial     :BigIntegerField
    :bit           :UnknownField
    :bool          :BooleanField
    :boolean       :BooleanField
    :box           :UnknownField
    :bpchar        :CharField ; "blank-padded char" is the internal name of "character"
    :bytea         :UnknownField        ; byte array
    :cidr          :TextField           ; IPv4/IPv6 network address
    :circle        :UnknownField
    :date          :DateField
    :decimal       :DecimalField
    :float4        :FloatField
    :float8        :FloatField
    :geometry      :UnknownField
    :inet          :TextField ; This was `GenericIPAddressField` in some places in the Django code but not others ...
    :int           :IntegerField
    :int2          :IntegerField
    :int4          :IntegerField
    :int8          :BigIntegerField
    :interval      :UnknownField        ; time span
    :json          :TextField
    :jsonb         :TextField
    :line          :UnknownField
    :lseg          :UnknownField
    :macaddr       :TextField
    :money         :DecimalField
    :numeric       :DecimalField
    :path          :UnknownField
    :pg_lsn        :IntegerField        ; PG Log Sequence #
    :point         :UnknownField
    :real          :FloatField
    :serial        :IntegerField
    :serial2       :IntegerField
    :serial4       :IntegerField
    :serial8       :BigIntegerField
    :smallint      :IntegerField
    :smallserial   :IntegerField
    :text          :TextField
    :time          :TimeField
    :timetz        :TimeField
    :timestamp     :DateTimeField
    :timestamptz   :DateTimeField
    :tsquery       :UnknownField
    :tsvector      :UnknownField
    :txid_snapshot :UnknownField
    :uuid          :UUIDField
    :varbit        :UnknownField
    :varchar       :TextField
    :xml           :TextField
    (keyword "bit varying")                :UnknownField
    (keyword "character varying")          :TextField
    (keyword "double precision")           :FloatField
    (keyword "time with time zone")        :TimeField
    (keyword "time without time zone")     :TimeField
    (keyword "timestamp with timezone")    :DateTimeField
    (keyword "timestamp without timezone") :DateTimeField} column-type))

(def ^:private ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(defn- connection-details->spec [_ {:keys [ssl] :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port) (Integer/parseInt port)
                          port)))
      (dissoc :ssl)               ; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (merge (when ssl            ; merging ssl-params will add :ssl back in if desirable
               ssl-params))
      (rename-keys {:dbname :db})
      kdb/postgres))

(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (utils/func (case seconds-or-milliseconds
                :seconds      "TO_TIMESTAMP(%s)"
                :milliseconds "TO_TIMESTAMP(%s / 1000)")
              [field-or-value]))

(defn- driver-specific-sync-field! [_ {:keys [table], :as field}]
  (with-jdbc-metadata [^java.sql.DatabaseMetaData md @(:db @table)]
    (let [[{:keys [type_name]}] (->> (.getColumns md nil nil (:name @table) (:name field))
                                     jdbc/result-set-seq)]
      (when (= type_name "json")
        (upd Field (:id field) :special_type :json)
        (assoc field :special_type :json)))))

(defn- date [_ unit field-or-value]
  (utils/func (case unit
                :default         "CAST(%s AS TIMESTAMP)"
                :minute          "DATE_TRUNC('minute', %s)"
                :minute-of-hour  "CAST(EXTRACT(MINUTE FROM %s) AS INTEGER)"
                :hour            "DATE_TRUNC('hour', %s)"
                :hour-of-day     "CAST(EXTRACT(HOUR FROM %s) AS INTEGER)"
                :day             "CAST(%s AS DATE)"
                ;; Postgres DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
                :day-of-week     "(CAST(EXTRACT(DOW FROM %s) AS INTEGER) + 1)"
                :day-of-month    "CAST(EXTRACT(DAY FROM %s) AS INTEGER)"
                :day-of-year     "CAST(EXTRACT(DOY FROM %s) AS INTEGER)"
                ;; Postgres weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
                :week            "(DATE_TRUNC('week', (%s + INTERVAL '1 day')) - INTERVAL '1 day')"
                :week-of-year    "CAST(EXTRACT(WEEK FROM (%s + INTERVAL '1 day')) AS INTEGER)"
                :month           "DATE_TRUNC('month', %s)"
                :month-of-year   "CAST(EXTRACT(MONTH FROM %s) AS INTEGER)"
                :quarter         "DATE_TRUNC('quarter', %s)"
                :quarter-of-year "CAST(EXTRACT(QUARTER FROM %s) AS INTEGER)"
                :year            "CAST(EXTRACT(YEAR FROM %s) AS INTEGER)")
              [field-or-value]))

(defn- date-interval [_ unit amount]
  (utils/generated (format "(NOW() + INTERVAL '%d %s')" amount (name unit))))

(defn- humanize-connection-error-message [_ message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^No suitable driver found for.*$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^FATAL: role \".*\" does not exist$"
    (driver/connection-error-messages :username-incorrect)

    #"^FATAL: password authentication failed for user.*$"
    (driver/connection-error-messages :password-incorrect)

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (s/capitalize message) \.))

    #".*" ; default
    message))

(defrecord PostgresDriver []
  clojure.lang.Named
  (getName [_] "PostgreSQL"))

(extend PostgresDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     date-interval
          :details-fields                    (constantly [{:name         "host"
                                                           :display-name "Host"
                                                           :default "localhost"}
                                                          {:name         "port"
                                                           :display-name "Port"
                                                           :type         :integer
                                                           :default      5432}
                                                          {:name         "dbname"
                                                           :display-name "Database name"
                                                           :placeholder  "birds_of_the_word"
                                                           :required     true}
                                                          {:name         "user"
                                                           :display-name "Database username"
                                                           :placeholder  "What username do you use to login to the database?"
                                                           :required     true}
                                                          {:name         "password"
                                                           :display-name "Database password"
                                                           :type         :password
                                                           :placeholder  "*******"}
                                                          {:name         "ssl"
                                                           :display-name "Use a secure connection (SSL)?"
                                                           :type         :boolean
                                                           :default      false}])
          :driver-specific-sync-field!       driver-specific-sync-field!
          :humanize-connection-error-message humanize-connection-error-message})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         column->base-type
          :connection-details->spec  connection-details->spec
          :date                      date
          :set-timezone-sql          (constantly "UPDATE pg_settings SET setting = ? WHERE name ILIKE 'timezone';")
          :string-length-fn          (constantly :CHAR_LENGTH)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :postgres (PostgresDriver.))
