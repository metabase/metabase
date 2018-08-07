(ns metabase.driver.h2
  (:require [clojure.string :as s]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.util.honeysql-extensions :as hx]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan.db :as db]))

(def ^:private ^:const column->base-type
  {:ARRAY                       :type/*
   :BIGINT                      :type/BigInteger
   :BINARY                      :type/*
   :BIT                         :type/Boolean
   :BLOB                        :type/*
   :BOOL                        :type/Boolean
   :BOOLEAN                     :type/Boolean
   :BYTEA                       :type/*
   :CHAR                        :type/Text
   :CHARACTER                   :type/Text
   :CLOB                        :type/Text
   :DATE                        :type/Date
   :DATETIME                    :type/DateTime
   :DEC                         :type/Decimal
   :DECIMAL                     :type/Decimal
   :DOUBLE                      :type/Float
   :FLOAT                       :type/Float
   :FLOAT4                      :type/Float
   :FLOAT8                      :type/Float
   :GEOMETRY                    :type/*
   :IDENTITY                    :type/Integer
   :IMAGE                       :type/*
   :INT                         :type/Integer
   :INT2                        :type/Integer
   :INT4                        :type/Integer
   :INT8                        :type/BigInteger
   :INTEGER                     :type/Integer
   :LONGBLOB                    :type/*
   :LONGTEXT                    :type/Text
   :LONGVARBINARY               :type/*
   :LONGVARCHAR                 :type/Text
   :MEDIUMBLOB                  :type/*
   :MEDIUMINT                   :type/Integer
   :MEDIUMTEXT                  :type/Text
   :NCHAR                       :type/Text
   :NCLOB                       :type/Text
   :NTEXT                       :type/Text
   :NUMBER                      :type/Decimal
   :NUMERIC                     :type/Decimal
   :NVARCHAR                    :type/Text
   :NVARCHAR2                   :type/Text
   :OID                         :type/*
   :OTHER                       :type/*
   :RAW                         :type/*
   :REAL                        :type/Float
   :SIGNED                      :type/Integer
   :SMALLDATETIME               :type/DateTime
   :SMALLINT                    :type/Integer
   :TEXT                        :type/Text
   :TIME                        :type/Time
   :TIMESTAMP                   :type/DateTime
   :TINYBLOB                    :type/*
   :TINYINT                     :type/Integer
   :TINYTEXT                    :type/Text
   :UUID                        :type/Text
   :VARBINARY                   :type/*
   :VARCHAR                     :type/Text
   :VARCHAR2                    :type/Text
   :VARCHAR_CASESENSITIVE       :type/Text
   :VARCHAR_IGNORECASE          :type/Text
   :YEAR                        :type/Integer
   (keyword "DOUBLE PRECISION") :type/Float})


;; These functions for exploding / imploding the options in the connection strings are here so we can override shady
;; options users might try to put in their connection string. e.g. if someone sets `ACCESS_MODE_DATA` to `rws` we can
;; replace that and make the connection read-only.

(defn- connection-string->file+options
  "Explode a CONNECTION-STRING like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [^String connection-string]
  {:pre [connection-string]}
  (let [[file & options] (s/split connection-string #";+")
        options          (into {} (for [option options]
                                    (s/split option #"=")))]
    [file options]))

(defn- file+options->connection-string
  "Implode the results of `connection-string->file+options` back into a connection string."
  [file options]
  (apply str file (for [[k v] options]
                    (str ";" k "=" v))))

(defn- connection-string-set-safe-options
  "Add Metabase Security Settings™ to this CONNECTION-STRING (i.e. try to keep shady users from writing nasty SQL)."
  [connection-string]
  (let [[file options] (connection-string->file+options connection-string)]
    (file+options->connection-string file (merge options {"IFEXISTS"         "TRUE"
                                                          "ACCESS_MODE_DATA" "r"}))))

(defn- connection-details->spec [details]
  (dbspec/h2 (if mdb/*allow-potentailly-unsafe-connections*
               details
               (update details :db connection-string-set-safe-options))))


(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (hsql/call :timestampadd
             (hx/literal (case seconds-or-milliseconds
                           :seconds      "second"
                           :milliseconds "millisecond"))
             expr
             (hsql/raw "timestamp '1970-01-01T00:00:00Z'")))


(defn- check-native-query-not-using-default-user [{query-type :type, database-id :database, :as query}]
  {:pre [(integer? database-id)]}
  (u/prog1 query
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the
    ;; connection string. We don't allow SQL execution on H2 databases for the default admin account for security
    ;; reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [db]}   (db/select-one-field :details Database :id database-id)
            _              (assert db)
            [_ options]    (connection-string->file+options db)
            {:strs [USER]} options]
        (when (or (s/blank? USER)
                  (= USER "sa"))        ; "sa" is the default USER
          (throw
           (Exception.
            (str (tru "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")))))))))

(defn- process-query-in-context [qp]
  (comp qp check-native-query-not-using-default-user))


;; H2 doesn't have date_trunc() we fake it by formatting a date to an appropriate string
;; and then converting back to a date.
;; Format strings are the same as those of SimpleDateFormat.
(defn- format-datetime   [format-str expr] (hsql/call :formatdatetime expr (hx/literal format-str)))
(defn- parse-datetime    [format-str expr] (hsql/call :parsedatetime expr  (hx/literal format-str)))
(defn- trunc-with-format [format-str expr] (parse-datetime format-str (format-datetime format-str expr)))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (trunc-with-format "yyyyMMddHHmm" expr)
    :minute-of-hour  (hx/minute expr)
    :hour            (trunc-with-format "yyyyMMddHH" expr)
    :hour-of-day     (hx/hour expr)
    :day             (hx/->date expr)
    :day-of-week     (hsql/call :day_of_week expr)
    :day-of-month    (hsql/call :day_of_month expr)
    :day-of-year     (hsql/call :day_of_year expr)
    :week            (trunc-with-format "YYYYww" expr) ; Y = week year; w = week in year
    :week-of-year    (hx/week expr)
    :month           (trunc-with-format "yyyyMM" expr)
    :month-of-year   (hx/month expr)
    ;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
    ;; *  extract the year and quarter from the date;
    ;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
    ;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10])
    ;; *  Concatenate the year and quarter start month together to create a yyyyMM date string;
    ;; *  Parse the string as a date. :sunglasses:
    ;;
    ;; Postgres DATE_TRUNC('quarter', x)
    ;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
    :quarter         (parse-datetime "yyyyMM"
                                     (hx/concat (hx/year expr) (hx/- (hx/* (hx/quarter expr)
                                                                           3)
                                                                     2)))
    :quarter-of-year (hx/quarter expr)
    :year            (hx/year expr)))

;; TODO - maybe rename this relative-date ?
(defn- date-interval [unit amount]
  (if (= unit :quarter)
    (recur :month (hx/* amount 3))
    (hsql/call :dateadd (hx/literal unit) amount :%now)))


(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Database .* not found .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Wrong user name or password .*$"
    (driver/connection-error-messages :username-or-password-incorrect)

    #".*" ; default
    message))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(def ^:private date-format-str   "yyyy-MM-dd HH:mm:ss.SSS zzz")
(def ^:private h2-date-formatters (driver/create-db-time-formatters date-format-str))
(def ^:private h2-db-time-query  (format "select formatdatetime(current_timestamp(),'%s') AS VARCHAR" date-format-str))

(defrecord H2Driver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "H2"))

(u/strict-extend H2Driver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :details-fields                    (constantly [{:name         "db"
                                                           :display-name (tru "Connection String")
                                                           :placeholder  (str "file:/"
                                                                              (tru "Users/camsaul/bird_sightings/toucans"))
                                                           :required     true}])
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :process-query-in-context          (u/drop-first-arg process-query-in-context)
          :current-db-time                   (driver/make-current-db-time-fn h2-db-time-query h2-date-formatters)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the H2 driver"
  []
  (driver/register-driver! :h2 (H2Driver.)))
