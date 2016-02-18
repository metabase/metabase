(ns metabase.driver.postgres
  (:require (clojure [set :refer [rename-keys]]
                     [string :as s])
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx])
  ;; This is necessary for when NonValidatingFactory is passed in the sslfactory connection string argument,
  ;; e.x. when connecting to a Heroku Postgres database from outside of Heroku.
  (:import org.postgresql.ssl.NonValidatingFactory))

(defn- column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  [_ column-type]
  ({:bigint        :type/number.integer.big
    :bigserial     :type/number.integer.big
    :bit           :type/*
    :bool          :type/boolean
    :boolean       :type/boolean
    :box           :type/*
    :bpchar        :type/text       ; "blank-padded char" is the internal name of "character"
    :bytea         :type/*    ; byte array
    :cidr          :type/text       ; IPv4/IPv6 network address
    :circle        :type/*
    :date          :type/datetime.date
    :decimal       :type/number.float.decimal
    :float4        :type/number.float
    :float8        :type/number.float
    :geometry      :type/*
    :inet          :type/text
    :int           :type/number.integer
    :int2          :type/number.integer
    :int4          :type/number.integer
    :int8          :type/number.integer.big
    :interval      :type/*    ; time span
    :json          :type/text
    :jsonb         :type/text
    :line          :type/*
    :lseg          :type/*
    :macaddr       :type/text
    :money         :type/number.float.decimal
    :numeric       :type/number.float.decimal
    :path          :type/*
    :pg_lsn        :type/number.integer    ; PG Log Sequence #
    :point         :type/*
    :real          :type/number.float
    :serial        :type/number.integer
    :serial2       :type/number.integer
    :serial4       :type/number.integer
    :serial8       :type/number.integer.big
    :smallint      :type/number.integer
    :smallserial   :type/number.integer
    :text          :type/text
    :time          :type/datetime.time
    :timetz        :type/datetime.time
    :timestamp     :type/datetime
    :timestamptz   :type/datetime
    :tsquery       :type/*
    :tsvector      :type/*
    :txid_snapshot :type/*
    :uuid          :type/text.uuid
    :varbit        :type/*
    :varchar       :type/text
    :xml           :type/text
    (keyword "bit varying")                :type/*
    (keyword "character varying")          :type/text
    (keyword "double precision")           :type/number.float
    (keyword "time with time zone")        :type/datetime.time
    (keyword "time without time zone")     :type/datetime.time
    (keyword "timestamp with timezone")    :type/datetime
    (keyword "timestamp without timezone") :type/datetime} column-type))

(defn- column->special-type
  "Attempt to determine the special-type of a Field given its name and Postgres column type."
  [_ column-name column-type]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/text.json special-type
  (when (= column-type :json)
    :type/text.json))

(def ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(def ^:const disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defn- connection-details->spec [_ {:keys [ssl] :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port) (Integer/parseInt port)
                          port)))
      (dissoc :ssl)               ; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (merge (if ssl
               ssl-params
               disable-ssl-params))
      (rename-keys {:dbname :db})
      kdb/postgres))

(defn- unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (k/sqlfn :TO_TIMESTAMP expr)
    :milliseconds (recur nil (kx// expr 1000) :seconds)))

(defn- date-trunc [unit expr] (k/sqlfn :DATE_TRUNC (kx/literal unit) expr))
(defn- extract    [unit expr] (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit))
                                           [expr]))

(def ^:private extract-integer (comp kx/->integer extract))

(def ^:private ^:const one-day (k/raw "INTERVAL '1 day'"))

(defn- date [_ unit expr]
  (case unit
    :default         (kx/->timestamp expr)
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (extract-integer :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (extract-integer :hour expr)
    :day             (kx/->date expr)
    ;; Postgres DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
    :day-of-week     (kx/inc (extract-integer :dow expr))
    :day-of-month    (extract-integer :day expr)
    :day-of-year     (extract-integer :doy expr)
    ;; Postgres weeks start on Monday (?), so shift this date into the proper bucket and then decrement the resulting day
    :week            (kx/- (date-trunc :week (kx/+ expr one-day))
                           one-day)
    :week-of-year    (extract-integer :week (kx/+ expr one-day))
    :month           (date-trunc :month expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (extract-integer :year expr)))

(defn- date-interval [_ unit amount]
  (k/raw (format "(NOW() + INTERVAL '%d %s')" (int amount) (name unit))))

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

(defn- prepare-value [{value :value, {:keys [base-type]} :field}]
  (if (isa? base-type :type/text.uuid)
    (java.util.UUID/fromString value)
    value))

(defrecord PostgresDriver []
  clojure.lang.Named
  (getName [_] "PostgreSQL"))

(def PostgresISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `PostgresDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         column->base-type
          :column->special-type      column->special-type
          :connection-details->spec  connection-details->spec
          :date                      date
          :prepare-value             (u/drop-first-arg prepare-value)
          :set-timezone-sql          (constantly "UPDATE pg_settings SET setting = ? WHERE name ILIKE 'timezone';")
          :string-length-fn          (constantly :CHAR_LENGTH)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(extend PostgresDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     date-interval
          :details-fields                    (constantly [{:name         "host"
                                                           :display-name "Host"
                                                           :default      "localhost"}
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
          :humanize-connection-error-message humanize-connection-error-message})

  sql/ISQLDriver PostgresISQLDriverMixin)

(driver/register-driver! :postgres (PostgresDriver.))
