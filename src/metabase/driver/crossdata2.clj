(ns metabase.driver.crossdata2
  ;; TODO - rework this to be like newer-style namespaces that use `u/drop-first-arg`
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [set :refer [rename-keys], :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver
             [generic-sql :as sql]
             [hive-like :as hive-like]]
            [metabase.util :as u]
            [metabase.driver.generic-sql.query-processor :as qprocessor]
            [metabase.query-processor.util :as qputil]
            [metabase.models.field :as fieldd]
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h]
                      types)
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import java.util.UUID
           (java.util Collections Date)
           (metabase.query_processor.interface DateTimeValue Value)
           (metabase.query_processor.interface DateTimeValue)
           metabase.query_processor.interface.Field))

(defrecord CrossdataDriver []
  clojure.lang.Named
  (getName [_] "Crossdata2"))


(def ^:private ^:const column->base-type
  "Map of Crossdata2 column types -> Field base types.
   Add more mappings here as you come across them."
  {
   :SQL_DECIMAL             :type/Float
   :SQL_DOUBLE              :type/Decimal
   :SQL_FLOAT               :type/Float
   :SQL_INTEGER             :type/Integer
   :SQL_REAL                :type/Decimal
   :SQL_VARCHAR             :type/Text
   :SQL_LONGVARCHAR         :type/Text
   :SQL_CHAR                :type/Text
   :TIMESTAMP               :type/DateTime
   :DATE                    :type/Date
   :SQL_BOOLEAN             :type/Boolean
   (keyword "bit varying")                :type/*
   (keyword "character varying")          :type/Text
   (keyword "double precision")           :type/Float
   (keyword "time with time zone")        :type/Time
   (keyword "time without time zone")     :type/Time
   (keyword "timestamp with timezone")    :type/DateTime
   (keyword "timestamp without timezone") :type/DateTime})

(defn- column->special-type
  "Attempt to determine the special-type of a Field given its name and Crossdata2 column type."
  [column-name column-type]
  ;; this is really, really simple right now.  if its crossdata :json type then it's :type/SerializedJSON special-type
  (case column-type
    :json :type/SerializedJSON
    :inet :type/IPAddress
    nil))

(def ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        false
   :sslmode    "require"
   :sslfactory "org.crossdata.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(def ^:const disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defn- dash-to-underscore [s]
  (when s
    (s/replace s #"-" "_")))

;; workaround for SPARK-9686 Spark Thrift server doesn't return correct JDBC metadata
(defn- describe-table [driver {:keys [details] :as database} table]
  (with-open [conn (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
    (jdbc/query {:connection conn}
                [(if (:schema table)
                   (format "refresh table `%s`.`%s`"
                           (dash-to-underscore (:schema table))
                           (dash-to-underscore (:name table)))
                   (str "refresh table " (dash-to-underscore (:name table))))])
    {:name (:name table)
     :schema (:schema table)
     :fields (set (for [result (jdbc/query {:connection conn}
                                           [(if (:schema table)
                                              (format "describe `%s`.`%s`"
                                                      (dash-to-underscore (:schema table))
                                                      (dash-to-underscore (:name table)))
                                              (str "describe " (dash-to-underscore (:name table))))])]
                    {:name (:col_name result)
                     :database-type (:data_type result)
                     :base-type (hive-like/column->base-type (keyword (:data_type result)))}))}))

(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings ], query :native, {sql :query, params :params} :native, :as outer-query}]
  (let [sql (str
              (if (seq params)
                (unprepare/unprepare (cons sql params))
                sql))]
    (let [query (assoc query :remark  "", :query  sql, :params  nil)]
      (qprocessor/do-with-try-catch
        (fn []
          (let [db-connection (sql/db->jdbc-connection-spec database)]
            (qprocessor/do-in-transaction db-connection (partial qprocessor/run-query-with-out-remark query))))))))

(defn apply-order-by
  "Apply `order-by` clause to HONEYSQL-FORM. Default implementation of `apply-order-by` for SQL drivers."
  [_ honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(keyword (qprocessor/display_name field)) (case direction
                                                                             :ascending  :asc
                                                                             :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- connection-details->spec [{ssl? :ssl, :as details-map}]
  (-> details-map
      (update :port (fn [port]
                      (if (string? port)
                        (Integer/parseInt port)
                        port)))
      ;; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (dissoc :ssl)
      (merge (if ssl?
               ssl-params
               disable-ssl-params))
      (rename-keys {:dbname :db})
      dbspec/crossdata2
      (sql/handle-additional-options details-map)))


(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :to_timestamp expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- date-trunc [unit expr]
  (hsql/call unit expr))

(defn- extract    [unit expr]
  (hsql/call :extract    unit              expr))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const one-day
  (hsql/raw "INTERVAL '1 day'"))

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (date-trunc :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (date-trunc :hour expr)
    :day             (date-trunc :day expr)
    ;; Crossdata DOW is 0 (Sun) - 6 (Sat); increment this to be consistent with Java, H2, MySQL, and Mongo (1-7)
    :day-of-week     (hx/inc (extract-integer :dow expr))
    :day-of-month    (extract-integer :day expr)
    :day-of-year     (extract-integer :doy expr)
    ;; Crossdata weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
    :week            (date-trunc :weekofyear expr)
    :week-of-year    (date-trunc :weekofyear expr)
    :month           (date-trunc :month expr)
    :month-of-year   (date-trunc :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (date-trunc :year expr)))

(defn- date-interval [unit amount]
  (hsql/raw (format "(now() + INTERVAL %d %s)" (int amount) (name unit))))

(defn- humanize-connection-error-message [message]
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
  (if-not value
    value
    (cond
      (isa? base-type :type/UUID)      (UUID/fromString value)
      (isa? base-type :type/IPAddress) (hx/cast :inet value)
      :else                            value)))

(defn- string-length-fn [field-key]
  (hsql/call :length (hx/cast :STRING field-key)))

;; ignore the schema when producing the identifier
(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`.
   This function should be used by databases where schemas do not make much sense."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  (conj (vec (if-let [parent (metabase.models.field/Field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name} (db/select-one ['Table :name], :id table-id)]
                 [table-name])))
        field-name))

(defn field->identifier
  "Returns an identifier for the given field"
  [field]
  (apply hsql/qualify (qualified-name-components field)))

;;; ------------------------------------------ Custom HoneySQL Clause Impls ------------------------------------------

(def ^:private source-table-alias "t1")

(defn- resolve-table-alias [{:keys [schema-name table-name special-type field-name] :as field}]
  (let [source-table (or (get-in qprocessor/*query* [:query :source-table])
                         (get-in qprocessor/*query* [:query :source-query :source-table]))]
    (if (and (= schema-name (:schema source-table))
             (= table-name (:name source-table)))
      (-> (assoc field :schema-name nil)
          (assoc :table-name source-table-alias))
      (if-let [matching-join-table (->> (get-in qprocessor/*query* [:query :join-tables])
                                        (filter #(and (= schema-name (:schema %))
                                                  (= table-name (:table-name %))))
                                        first)]
        (-> (assoc field :schema-name nil)
            (assoc :table-name (:join-alias matching-join-table)))
        field))))

(defmethod  qprocessor/->honeysql [CrossdataDriver Field]
  [driver field-before-aliasing]
  (let [{:keys [table-name special-type field-name]} (resolve-table-alias field-before-aliasing)
        field (keyword (hx/qualify-and-escape-dots table-name field-name))]
    (cond
      (isa? special-type :type/UNIXTimestampSeconds)      (sql/unix-timestamp->timestamp driver field :seconds)
      (isa? special-type :type/UNIXTimestampMilliseconds) (sql/unix-timestamp->timestamp driver field :milliseconds)
      :else                                               field)))

(defn- apply-join-tables
  [honeysql-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [honeysql-form honeysql-form, [{:keys [table-name pk-field source-field schema join-alias]} & more] join-tables]
    (let [honeysql-form (h/merge-left-join honeysql-form
                                           [(hx/qualify-and-escape-dots schema table-name) (keyword join-alias)]
                                           [:= (hx/qualify-and-escape-dots source-table-alias (:field-name source-field))
                                            (hx/qualify-and-escape-dots join-alias         (:field-name pk-field))])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- apply-page-using-row-number-for-offset
  "Apply `page` clause to HONEYSQL-FROM, using row_number() for drivers that do not support offsets"
  [honeysql-form {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-form items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-form [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :mysql)))]
        (-> (apply h/select (map last (:select honeysql-form)))
            (h/from (h/merge-select honeysql-form [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

(defn- apply-source-table
  [honeysql-form {{table-name :name, schema :schema} :source-table}]
  {:pre [table-name]}
  (h/from honeysql-form [(hx/qualify-and-escape-dots schema table-name) source-table-alias]))

(defrecord CrossdataDriver []
  clojure.lang.Named
  (getName [_] "Crossdata2"))

(def CrossdataISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `CrossdataDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-source-table        (u/drop-first-arg apply-source-table)
          :apply-join-tables         (u/drop-first-arg apply-join-tables)
          :column->base-type         (u/drop-first-arg column->base-type)
          :column->special-type      (u/drop-first-arg column->special-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :field->identifier         (u/drop-first-arg field->identifier)
          :quote-style               (constantly :mysql)
          :set-timezone-sql          (constantly "UPDATE pg_settings SET setting = ? WHERE name ILIKE 'timezone';")
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(u/strict-extend CrossdataDriver
                 driver/IDriver
                 (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval                     (u/drop-first-arg date-interval)
          :describe-table     describe-table
          :details-fields                    (constantly [{:name         "host"
                                                           :display-name "Host"
                                                           :default      "localhost"}
                                                          {:name         "port"
                                                           :display-name "Port"
                                                           :type         :integer
                                                           :default      13422}
                                                          {:name         "dbname"
                                                           :display-name "Use a secure connection (SSL)?"
                                                           :default      false
                                                           :type         :boolean}
                                                          {:name         "user"
                                                           :display-name "Database username"
                                                           :placeholder  "What username do you use to login to the database?"
                                                           :required     true}
                                                          {:name         "ssl"
                                                           :display-name "Use a secure connection (SSL)?"
                                                           :type         :boolean
                                                           :default      false}
                                                          {:name         "additional-options"
                                                           :display-name "Additional JDBC connection string options"
                                                           :placeholder  "prepareThreshold=0"}])
          :execute-query            execute-query
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)})


                 sql/ISQLDriver CrossdataISQLDriverMixin)
:crossdata2
(driver/register-driver! :crossdata2 (CrossdataDriver.))

(defn -init-driver
  "Register the PostgreSQL driver"
  []
  (driver/register-driver! :crossdata2 (CrossdataDriver.)))
