(ns metabase.driver.sql-jdbc.execute
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]])
  (:import [java.sql PreparedStatement ResultSet ResultSetMetaData SQLException]
           [java.util Calendar Date TimeZone]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-timezone-sql
  "Return a format string containing a SQL statement to be used to set the timezone for the current transaction.
  The `%s` will be replaced with a string literal for a timezone, e.g. `US/Pacific.`

    \"SET @@session.timezone = %s;\""
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-timezone-sql :sql-jdbc [_] nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Parsing Results                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- parse-date-as-string
  "Most databases will never invoke this code. It's possible with SQLite to get here if the timestamp was stored
  without milliseconds. Currently the SQLite JDBC driver will throw an exception even though the SQLite datetime
  functions will return datetimes that don't include milliseconds. This attempts to parse that datetime in Clojure
  land"
  [^TimeZone tz ^ResultSet rs ^Integer i]
  (let [date-string (.getString rs i)]
    (if-let [parsed-date (du/str->date-time date-string tz)]
      parsed-date
      (throw (Exception. (str (tru "Unable to parse date ''{0}''" date-string)))))))

(defn- get-date [^TimeZone tz]
  (fn [^ResultSet rs _ ^Integer i]
    (try
      (.getDate rs i (Calendar/getInstance tz))
      (catch SQLException e
        (parse-date-as-string tz rs i)))))

(defn- get-timestamp [^TimeZone tz]
  (fn [^ResultSet rs _ ^Integer i]
    (try
      (.getTimestamp rs i (Calendar/getInstance tz))
      (catch SQLException e
        (parse-date-as-string tz rs i)))))

(defn- get-object [^ResultSet rs _ ^Integer i]
  (.getObject rs i))

(defn- make-column-reader
  "Given `COLUMN-TYPE` and `TZ`, return a function for reading that type of column from a ResultSet"
  [column-type tz]
  (cond
    (and tz (= column-type java.sql.Types/DATE))
    (get-date tz)

    (and tz (= column-type java.sql.Types/TIMESTAMP))
    (get-timestamp tz)

    :else
    get-object))

(defn- read-columns-with-date-handling
  "Returns a function that will read a row from `RS`, suitable for
  being passed into the clojure.java.jdbc/query function"
  [timezone]
  (fn [^ResultSet rs ^ResultSetMetaData rsmeta idxs]
    (let [data-read-functions (map (fn [^Integer i] (make-column-reader (.getColumnType rsmeta i) timezone)) idxs)]
      (mapv (fn [^Integer i data-read-fn]
              (jdbc/result-set-read-column (data-read-fn rs rsmeta i) rsmeta i)) idxs data-read-functions))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- set-parameters-with-timezone
  "Returns a function that will set date/timestamp PreparedStatement
  parameters with the correct timezone"
  [^TimeZone tz]
  (fn [^PreparedStatement stmt params]
    (mapv (fn [^Integer i value]
            (cond

              (and tz (instance? java.sql.Time value))
              (.setTime stmt i value (Calendar/getInstance tz))

              (and tz (instance? java.sql.Timestamp value))
              (.setTimestamp stmt i value (Calendar/getInstance tz))

              (and tz (instance? java.util.Date value))
              (.setDate stmt i value (Calendar/getInstance tz))

              :else
              (jdbc/set-parameter value stmt i)))
          (rest (range)) params)))

(defmacro ^:private with-ensured-connection
  "In many of the clojure.java.jdbc functions, it checks to see if there's already a connection open before opening a
  new one. This macro checks to see if one is open, or will open a new one. Will bind the connection to `conn-sym`."
  [conn-sym db & body]
  `(let [db# ~db]
     (if-let [~conn-sym (jdbc/db-find-connection db#)]
       (do ~@body)
       (with-open [~conn-sym (jdbc/get-connection db#)]
         ~@body))))

(defn- cancelable-run-query
  "Runs `sql` in such a way that it can be interrupted via a `future-cancel`"
  [db sql params opts]
  (with-ensured-connection conn db
    ;; This is normally done for us by java.jdbc as a result of our `jdbc/query` call
    (with-open [^PreparedStatement stmt (jdbc/prepare-statement conn sql opts)]
      ;; Need to run the query in another thread so that this thread can cancel it if need be
      (try
        (let [query-future (future (jdbc/query conn (into [stmt] params) opts))]
          ;; This thread is interruptable because it's awaiting the other thread (the one actually running the
          ;; query). Interrupting this thread means that the client has disconnected (or we're shutting down) and so
          ;; we can give up on the query running in the future
          @query-future)
        (catch InterruptedException e
          (log/warn e (tru "Client closed connection, cancelling query"))
          ;; This is what does the real work of cancelling the query. We aren't checking the result of
          ;; `query-future` but this will cause an exception to be thrown, saying the query has been cancelled.
          (.cancel stmt)
          (throw e))))))

(defn- run-query
  "Run the query itself."
  [driver {sql :query, params :params, remark :remark} timezone connection]
  (let [sql              (str "-- " remark "\n" (hx/unescape-dots sql))
        statement        (into [sql] params)
        [columns & rows] (cancelable-run-query connection sql params
                                                {:identifiers    identity
                                                 :as-arrays?     true
                                                 :read-columns   (read-columns-with-date-handling timezone)
                                                 :set-parameters (set-parameters-with-timezone timezone)})]
    {:rows    (or rows [])
     :columns (map u/keyword->qualified-name columns)}))


;;; -------------------------- Running queries: exception handling & disabling auto-commit ---------------------------

(defn- exception->nice-error-message ^String [^SQLException e]
  (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
           (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
           second)             ; so just return the part of the exception that is relevant
      (.getMessage e)))

(defn do-with-try-catch
  "Tries to run the function `f`, catching and printing exception chains if SQLException is thrown,
  and rethrowing the exception as an Exception with a nicely formatted error message."
  {:style/indent 0}
  [f]
  (try (f)
       (catch SQLException e
         (log/error (jdbc/print-sql-exception-chain e))
         (throw (Exception. (exception->nice-error-message e))))))

(defn- do-with-auto-commit-disabled
  "Disable auto-commit for this transaction, and make the transaction `rollback-only`, which means when the
  transaction finishes `.rollback` will be called instead of `.commit`. Furthermore, execute F in a try-finally block;
  in the `finally`, manually call `.rollback` just to be extra-double-sure JDBC any changes made by the transaction
  aren't committed."
  {:style/indent 1}
  [conn f]
  (jdbc/db-set-rollback-only! conn)
  (.setAutoCommit (jdbc/get-connection conn) false)
  ;; TODO - it would be nice if we could also `.setReadOnly` on the transaction as well, but that breaks setting the
  ;; timezone. Is there some way we can have our cake and eat it too?
  (try (f)
       (finally (.rollback (jdbc/get-connection conn)))))

(defn- do-in-transaction [connection f]
  (jdbc/with-db-transaction [transaction-connection connection]
    (do-with-auto-commit-disabled transaction-connection (partial f transaction-connection))))


;;; ---------------------------------------------- Running w/ Timezone -----------------------------------------------

(defn- set-timezone!
  "Set the timezone for the current connection."
  [driver settings connection]
  (let [timezone      (u/prog1 (:report-timezone settings)
                        (assert (re-matches #"[A-Za-z\/_]+" <>)))
        format-string (set-timezone-sql driver)
        sql           (format format-string (str \' timezone \'))]
    (log/debug (u/format-color 'green (tru "Setting timezone with statement: {0}" sql)))
    (jdbc/db-do-prepared connection [sql])))

(defn- run-query-without-timezone [driver _ connection query]
  (do-in-transaction connection (partial run-query driver query nil)))

(defn- run-query-with-timezone [driver {:keys [^String report-timezone] :as settings} connection query]
  (try
    (do-in-transaction connection (fn [transaction-connection]
                                    (set-timezone! driver settings transaction-connection)
                                    (run-query driver
                                               query
                                               (some-> report-timezone TimeZone/getTimeZone)
                                               transaction-connection)))
    (catch SQLException e
      (log/error (tru "Failed to set timezone:") "\n" (with-out-str (jdbc/print-sql-exception-chain e)))
      (run-query-without-timezone driver settings connection query))
    (catch Throwable e
      (log/error (tru "Failed to set timezone:") "\n" (.getMessage e))
      (run-query-without-timezone driver settings connection query))))


;;; ------------------------------------------------- execute-query --------------------------------------------------

(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {settings :settings, query :native, :as outer-query}]
  (let [query (assoc query :remark (qputil/query->remark outer-query))]
    (do-with-try-catch
      (fn []
        (let [db-connection (sql-jdbc.conn/db->pooled-connection-spec (qp.store/database))]
          ((if (seq (:report-timezone settings))
             run-query-with-timezone
             run-query-without-timezone) driver settings db-connection query))))))
