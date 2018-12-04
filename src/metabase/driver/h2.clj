(ns metabase.driver.h2
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]]))

(driver/register! :h2, :parent :sql-jdbc)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/connection-properties :h2 [_]
  [{:name         "db"
    :display-name (tru "Connection String")
    :placeholder  (str "file:/" (tru "Users/camsaul/bird_sightings/toucans"))
    :required     true}])

(defn- connection-string->file+options
  "Explode a CONNECTION-STRING like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [^String connection-string]
  {:pre [connection-string]}
  (let [[file & options] (str/split connection-string #";+")
        options          (into {} (for [option options]
                                    (str/split option #"=")))]
    [file options]))

(defn- check-native-query-not-using-default-user [{query-type :type, database-id :database, :as query}]
  {:pre [(integer? database-id)]}
  (u/prog1 query
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the
    ;; connection string. We don't allow SQL execution on H2 databases for the default admin account for security
    ;; reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [db]}   (:details (qp.store/database))
            _              (assert db)
            [_ options]    (connection-string->file+options db)
            {:strs [USER]} options]
        (when (or (str/blank? USER)
                  (= USER "sa"))        ; "sa" is the default USER
          (throw
           (Exception.
            (str (tru "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")))))))))

(defmethod driver/process-query-in-context :h2 [_ qp]
  (comp qp check-native-query-not-using-default-user))


(defmethod driver/date-interval :h2 [driver unit amount]
  (if (= unit :quarter)
    (recur driver :month (hx/* amount 3))
    (hsql/call :dateadd (hx/literal unit) amount :%now)))


(defmethod driver/humanize-connection-error-message :h2 [_ message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Database .* not found .*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Wrong user name or password .*$"
    (driver.common/connection-error-messages :username-or-password-incorrect)

    #".*"                               ; default
    message))

(def ^:private date-format-str "yyyy-MM-dd HH:mm:ss.SSS zzz")

(defmethod driver.common/current-db-time-date-formatters :h2 [_]
  (driver.common/create-db-time-formatters date-format-str))

(defmethod driver.common/current-db-time-native-query :h2 [_]
  (format "select formatdatetime(current_timestamp(),'%s') AS VARCHAR" date-format-str))

(defmethod driver/current-db-time :h2 [& args]
  (apply driver.common/current-db-time args))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-to-1970 [expr unit-str]
  (hsql/call :timestampadd
    (hx/literal unit-str)
    expr
    (hsql/raw "timestamp '1970-01-01T00:00:00Z'")))

(defmethod sql.qp/unix-timestamp->timestamp [:h2 :seconds] [_ _ expr]
  (add-to-1970 expr "second"))

(defmethod sql.qp/unix-timestamp->timestamp [:h2 :millisecond] [_ _ expr]
  (add-to-1970 expr "millisecond"))


;; H2 doesn't have date_trunc() we fake it by formatting a date to an appropriate string
;; and then converting back to a date.
;; Format strings are the same as those of SimpleDateFormat.
(defn- format-datetime   [format-str expr] (hsql/call :formatdatetime expr (hx/literal format-str)))
(defn- parse-datetime    [format-str expr] (hsql/call :parsedatetime expr  (hx/literal format-str)))
(defn- trunc-with-format [format-str expr] (parse-datetime format-str (format-datetime format-str expr)))

(defmethod sql.qp/date [:h2 :minute]          [_ _ expr] (trunc-with-format "yyyyMMddHHmm" expr))
(defmethod sql.qp/date [:h2 :minute-of-hour]  [_ _ expr] (hx/minute expr))
(defmethod sql.qp/date [:h2 :hour]            [_ _ expr] (trunc-with-format "yyyyMMddHH" expr))
(defmethod sql.qp/date [:h2 :hour-of-day]     [_ _ expr] (hx/hour expr))
(defmethod sql.qp/date [:h2 :day]             [_ _ expr] (hx/->date expr))
(defmethod sql.qp/date [:h2 :day-of-week]     [_ _ expr] (hsql/call :day_of_week expr))
(defmethod sql.qp/date [:h2 :day-of-month]    [_ _ expr] (hsql/call :day_of_month expr))
(defmethod sql.qp/date [:h2 :day-of-year]     [_ _ expr] (hsql/call :day_of_year expr))
(defmethod sql.qp/date [:h2 :week]            [_ _ expr] (trunc-with-format "YYYYww" expr)) ; Y = week year; w = week in year
(defmethod sql.qp/date [:h2 :week-of-year]    [_ _ expr] (hx/week expr))
(defmethod sql.qp/date [:h2 :month]           [_ _ expr] (trunc-with-format "yyyyMM" expr))
(defmethod sql.qp/date [:h2 :month-of-year]   [_ _ expr] (hx/month expr))
(defmethod sql.qp/date [:h2 :quarter-of-year] [_ _ expr] (hx/quarter expr))
(defmethod sql.qp/date [:h2 :year]            [_ _ expr] (hx/year expr))

;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
;; *  extract the year and quarter from the date;
;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10])
;; *  Concatenate the year and quarter start month together to create a yyyyMM date string;
;; *  Parse the string as a date. :sunglasses:
;;
;; Postgres DATE_TRUNC('quarter', x)
;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
(defmethod sql.qp/date [:h2 :quarter] [_ _ expr]
  (parse-datetime "yyyyMM"
                  (hx/concat (hx/year expr) (hx/- (hx/* (hx/quarter expr)
                                                        3)
                                                  2))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.sync/database-type->base-type :h2 [_ database-type]
  ({:ARRAY                       :type/*
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
    (keyword "DOUBLE PRECISION") :type/Float} database-type))


;; These functions for exploding / imploding the options in the connection strings are here so we can override shady
;; options users might try to put in their connection string. e.g. if someone sets `ACCESS_MODE_DATA` to `rws` we can
;; replace that and make the connection read-only.

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

(defmethod sql-jdbc.conn/connection-details->spec :h2 [_ details]
  (dbspec/h2 (if mdb/*allow-potentailly-unsafe-connections*
               details
               (update details :db connection-string-set-safe-options))))

(defmethod sql-jdbc.sync/active-tables :h2 [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))
