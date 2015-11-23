(ns metabase.driver.h2
  (:require [clojure.string :as s]
            [korma.db :as kdb]
            [korma.sql.utils :as utils]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.util :refer [funcs]]
            [metabase.models.database :refer [Database]]))

(defn- column->base-type [_ column-type]
  ({:ARRAY                       :UnknownField
     :BIGINT                      :BigIntegerField
     :BINARY                      :UnknownField
     :BIT                         :BooleanField
     :BLOB                        :UnknownField
     :BOOL                        :BooleanField
     :BOOLEAN                     :BooleanField
     :BYTEA                       :UnknownField
     :CHAR                        :CharField
     :CHARACTER                   :CharField
     :CLOB                        :TextField
     :DATE                        :DateField
     :DATETIME                    :DateTimeField
     :DEC                         :DecimalField
     :DECIMAL                     :DecimalField
     :DOUBLE                      :FloatField
     :FLOAT                       :FloatField
     :FLOAT4                      :FloatField
     :FLOAT8                      :FloatField
     :GEOMETRY                    :UnknownField
     :IDENTITY                    :IntegerField
     :IMAGE                       :UnknownField
     :INT                         :IntegerField
     :INT2                        :IntegerField
     :INT4                        :IntegerField
     :INT8                        :BigIntegerField
     :INTEGER                     :IntegerField
     :LONGBLOB                    :UnknownField
     :LONGTEXT                    :TextField
     :LONGVARBINARY               :UnknownField
     :LONGVARCHAR                 :TextField
     :MEDIUMBLOB                  :UnknownField
     :MEDIUMINT                   :IntegerField
     :MEDIUMTEXT                  :TextField
     :NCHAR                       :CharField
     :NCLOB                       :TextField
     :NTEXT                       :TextField
     :NUMBER                      :DecimalField
     :NUMERIC                     :DecimalField
     :NVARCHAR                    :TextField
     :NVARCHAR2                   :TextField
     :OID                         :UnknownField
     :OTHER                       :UnknownField
     :RAW                         :UnknownField
     :REAL                        :FloatField
     :SIGNED                      :IntegerField
     :SMALLDATETIME               :DateTimeField
     :SMALLINT                    :IntegerField
     :TEXT                        :TextField
     :TIME                        :TimeField
     :TIMESTAMP                   :DateTimeField
     :TINYBLOB                    :UnknownField
     :TINYINT                     :IntegerField
     :TINYTEXT                    :TextField
     :UUID                        :TextField
     :VARBINARY                   :UnknownField
     :VARCHAR                     :TextField
     :VARCHAR2                    :TextField
     :VARCHAR_CASESENSITIVE       :TextField
     :VARCHAR_IGNORECASE          :TextField
     :YEAR                        :IntegerField
    (keyword "DOUBLE PRECISION") :FloatField} column-type))


;; These functions for exploding / imploding the options in the connection strings are here so we can override shady options
;; users might try to put in their connection string. e.g. if someone sets `ACCESS_MODE_DATA` to `rws` we can replace that
;; and make the connection read-only.

(defn- connection-string->file+options
  "Explode a CONNECTION-STRING like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [connection-string]
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

(defn- connection-details->spec [_ details]
  (kdb/h2 (if db/*allow-potentailly-unsafe-connections* details
              (update details :db connection-string-set-safe-options))))


(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (utils/func (format "TIMESTAMPADD('%s', %%s, TIMESTAMP '1970-01-01T00:00:00Z')" (case seconds-or-milliseconds
                                                                                    :seconds      "SECOND"
                                                                                    :milliseconds "MILLISECOND"))
              [field-or-value]))


(defn- process-query-in-context [_ qp]
  (fn [{query-type :type, :as query}]
    {:pre [query-type]}
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the connection string.
    ;; We don't allow SQL execution on H2 databases for the default admin account for security reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [db]}   (db/sel :one :field [Database :details] :id (:database query))
            _              (assert db)
            [_ options]    (connection-string->file+options db)
            {:strs [USER]} options]
        (when (or (s/blank? USER)
                  (= USER "sa")) ; "sa" is the default USER
          (throw (Exception. "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")))))
    (qp query)))


;; H2 doesn't have date_trunc() we fake it by formatting a date to an appropriate string
;; and then converting back to a date.
;; Format strings are the same as those of SimpleDateFormat.
(defn- trunc-with-format [format-str]
  (format "PARSEDATETIME(FORMATDATETIME(%%s, '%s'), '%s')" format-str format-str))

;; Rounding dates to quarters is a bit involved but still doable. Here's the plan:
;; *  extract the year and quarter from the date;
;; *  convert the quarter (1 - 4) to the corresponding starting month (1, 4, 7, or 10).
;;    (do this by multiplying by 3, giving us [3 6 9 12]. Then subtract 2 to get [1 4 7 10])
;; *  Concatenate the year and quarter start month together to create a yyyyMM date string;
;; *  Parse the string as a date. :sunglasses:
;;
;; Postgres DATE_TRUNC('quarter', x)
;; becomes  PARSEDATETIME(CONCAT(YEAR(x), ((QUARTER(x) * 3) - 2)), 'yyyyMM')
(defn- trunc-to-quarter [field-or-value]
  (funcs "PARSEDATETIME(%s, 'yyyyMM')"
         ["CONCAT(%s)"
          ["YEAR(%s)" field-or-value]
          ["((QUARTER(%s) * 3) - 2)" field-or-value]]))

(defn- date [_ unit field-or-value]
  (if (= unit :quarter)
    (trunc-to-quarter field-or-value)
    (utils/func (case unit
                  :default         "CAST(%s AS TIMESTAMP)"
                  :minute          (trunc-with-format "yyyyMMddHHmm")
                  :minute-of-hour  "MINUTE(%s)"
                  :hour            (trunc-with-format "yyyyMMddHH")
                  :hour-of-day     "HOUR(%s)"
                  :day             "CAST(%s AS DATE)"
                  :day-of-week     "DAY_OF_WEEK(%s)"
                  :day-of-month    "DAY_OF_MONTH(%s)"
                  :day-of-year     "DAY_OF_YEAR(%s)"
                  :week            (trunc-with-format "yyyyww") ; ww = week of year
                  :week-of-year    "WEEK(%s)"
                  :month           (trunc-with-format "yyyyMM")
                  :month-of-year   "MONTH(%s)"
                  :quarter-of-year "QUARTER(%s)"
                  :year            "YEAR(%s)")
                [field-or-value])))


;; TODO - maybe rename this relative-date ?
(defn- date-interval [_ unit amount]
  (utils/generated (if (= unit :quarter)
                     (format "DATEADD('MONTH', (%d * 3), NOW())" amount)
                     (format "DATEADD('%s', %d, NOW())" (s/upper-case (name unit)) amount))))


(defn- humanize-connection-error-message [_ message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Database .* not found .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Wrong user name or password .*$"
    (driver/connection-error-messages :username-or-password-incorrect)

    #".*" ; default
    message))

(defrecord H2Driver []
  clojure.lang.Named
  (getName [_] "H2"))

(extend H2Driver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     date-interval
          :details-fields                    (constantly [{:name         "db"
                                                           :display-name "Connection String"
                                                           :placeholder  "file:/Users/camsaul/bird_sightings/toucans;AUTO_SERVER=TRUE"
                                                           :required     true}])
          :humanize-connection-error-message humanize-connection-error-message
          :process-query-in-context          process-query-in-context})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:column->base-type         column->base-type
          :connection-details->spec  connection-details->spec
          :date                      date
          :date-interval             date-interval
          :string-length-fn          (constantly :LENGTH)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :h2 (H2Driver.))
