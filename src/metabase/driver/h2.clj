(ns metabase.driver.h2
  (:require [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.util.korma-extensions :as kx]))

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


(defn- unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  (kutils/func (format "TIMESTAMPADD('%s', %%s, TIMESTAMP '1970-01-01T00:00:00Z')" (case seconds-or-milliseconds
                                                                                     :seconds      "SECOND"
                                                                                     :milliseconds "MILLISECOND"))
               [expr]))


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
(defn- format-datetime   [format-str expr] (k/sqlfn :FORMATDATETIME expr (kx/literal format-str)))
(defn- parse-datetime    [format-str expr] (k/sqlfn :PARSEDATETIME expr  (kx/literal format-str)))
(defn- trunc-with-format [format-str expr] (parse-datetime format-str (format-datetime format-str expr)))

(defn- date [_ unit expr]
  (case unit
    :default         (kx/->timestamp expr)
    :minute          (trunc-with-format "yyyyMMddHHmm" expr)
    :minute-of-hour  (kx/minute expr)
    :hour            (trunc-with-format "yyyyMMddHH" expr)
    :hour-of-day     (kx/hour expr)
    :day             (kx/->date expr)
    :day-of-week     (k/sqlfn :DAY_OF_WEEK expr)
    :day-of-month    (k/sqlfn :DAY_OF_MONTH expr)
    :day-of-year     (k/sqlfn :DAY_OF_YEAR expr)
    :week            (trunc-with-format "yyyyww" expr) ; ww = week of year
    :week-of-year    (kx/week expr)
    :month           (trunc-with-format "yyyyMM" expr)
    :month-of-year   (kx/month expr)
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
                                     (kx/concat (kx/year expr) (kx/- (kx/* (kx/quarter expr)
                                                                           3)
                                                                     2)))
    :quarter-of-year (kx/quarter expr)
    :year            (kx/year expr)))

(def ^:private now (k/sqlfn :NOW))

;; TODO - maybe rename this relative-date ?
(defn- date-interval [_ unit amount]
  (if (= unit :quarter)
    (recur nil :month (kx/* amount 3))
    (k/sqlfn :DATEADD (kx/literal (s/upper-case (name unit))) amount now)))


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
         {:active-tables                     sql/post-filtered-active-tables
          :date-interval                     date-interval
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
