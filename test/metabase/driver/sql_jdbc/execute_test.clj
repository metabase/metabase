(ns metabase.driver.sql-jdbc.execute-test
  (:require [clojure.core.async :as a]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.driver.sql-jdbc-test :as sql-jdbc-test]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.query-processor.test-util :as qp.tu]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util.log :as tu.log]
            [schema.core :as s])
  (:import [java.sql PreparedStatement ResultSet]))

(defn- do-with-max-rows [f]
  ;; force loading of the test data before swapping out `jdbc/query`, otherwise things might not sync correctly
  (data/id)
  (let [orig-query jdbc/query
        max-rows   (atom nil)]
    (with-redefs [jdbc/query (fn [conn sql-params & [opts]]
                               (when (sequential? sql-params)
                                 (let [[statement] sql-params]
                                   (when (instance? PreparedStatement statement)
                                     (reset! max-rows (.getMaxRows ^PreparedStatement statement)))))
                               (orig-query conn sql-params opts))]
      (let [result (f)]
        (or (when @max-rows
              {:max-rows @max-rows})
            result)))))

(defmacro ^:private with-max-rows
  "Runs query in `body`, and returns the max rows that was set for (via `PreparedStatement.setMaxRows()`) for that
  query. This number is the number we've instructed JDBC to limit the results to."
  [& body]
  `(do-with-max-rows (fn [] ~@body)))

;; We should be setting statement max rows based on appropriate limits when running queries (Snowflake runs tests with
(datasets/expect-with-drivers @sql-jdbc-test/sql-jdbc-drivers
  {:max-rows 10}
  (with-max-rows
    (qp/process-query
      {:database (data/id)
       :type     :query
       :query    {:source-table (data/id :venues)
                  :limit        10}})))

(datasets/expect-with-drivers @sql-jdbc-test/sql-jdbc-drivers
  {:max-rows 5}
  (with-max-rows
    (qp/process-query
      {:database (data/id)
       :type     :query
       :query    {:source-table (data/id :venues)
                  :limit        10}
       :constraints {:max-results 5}})))


(datasets/expect-with-drivers @sql-jdbc-test/sql-jdbc-drivers
  {:max-rows 15}
  (with-max-rows
    (qp/process-query
      {:database    (data/id)
       :type        :native
       :native      (qp/query->native {:database (data/id)
                                       :type     :query
                                       :query    {:source-table (data/id :venues)}})
       :constraints {:max-results 15}})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Query Cancelation & Resource Closing Tests                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defrecord ^:private FakePreparedStatement [called-cancel? called-close? fake-resultset]
  java.sql.PreparedStatement
  (closeOnCompletion [_])               ; no-op
  (cancel [_] (some-> called-cancel? (deliver true)))
  (close [_] (some-> called-close? (deliver true)))
  (executeQuery [_] fake-resultset))

(defrecord ^:private FakeResultSet [called-close?]
  ResultSet
  (close [_] (some-> called-close? (deliver true)))
  (next [_] false)
  (getMetaData [_]
    (reify java.sql.ResultSetMetaData
      (getColumnCount [_] 0))))

(defn- fake-prepare-statement
  "Returns `fake-value` whenenver the `sql` parameter returns a truthy value when passed to `use-fake-value?`."
  [& {:keys [use-fake-value? faked-value]
      :or   {use-fake-value? (constantly false)}}]
  (let [original-prepare-statement jdbc/prepare-statement]
    (fn [connection sql options]
      (if (use-fake-value? sql)
        faked-value
        (original-prepare-statement connection sql options)))))

(defn- fake-query
  "Function to replace the `clojure.java.jdbc/query` function. Will invoke `on-fake-prepared-statement` when passed an
  instance of `FakePreparedStatement`."
  [& {:keys [on-fake-prepared-statement]}]
  (let [original-query jdbc/query]
    (fn
      ([conn stmt+params]
       (conn stmt+params))

      ([conn stmt+params opts]
       (if (instance? FakePreparedStatement (first stmt+params))
         (when on-fake-prepared-statement (on-fake-prepared-statement))
         (original-query conn stmt+params opts))))))

;; make sure queries properly clean up after themselves and close result sets and prepared statements when finished
(expect
  {:prepared-statement-closed? true, :result-set-closed? true}
  (let [closed-prepared-statement? (promise)
        closed-result-set?         (promise)
        fake-resultset             (->FakeResultSet closed-result-set?)
        fake-prepared-statement    (->FakePreparedStatement nil closed-prepared-statement? fake-resultset)
        placeholder-query          "SELECT 1;"]
    (with-redefs [jdbc/prepare-statement (fake-prepare-statement
                                          :use-fake-value? #(str/includes? % placeholder-query)
                                          :faked-value fake-prepared-statement)]
      (let [{{:keys [rows]} :data, :as results} (qp/process-query
                                                  {:database (data/id)
                                                   :type     :native
                                                   :native   {:query placeholder-query}})]
        (when-not rows
          (throw (ex-info "Query failed to run!" results)))
        ;; make sure results are fully realized!
        (mapv vec rows))
      {:prepared-statement-closed? (deref closed-prepared-statement? 1000 false)
       :result-set-closed?         (deref closed-result-set?         1000 false)})))

;; make sure a prepared statement is canceled & closed when the async QP channel is closed
(expect
  {:prepared-statement-canceled? true, :prepared-statement-closed? true}
  (let [started?                     (promise)
        canceled-prepared-statement? (promise)
        closed-prepared-statement?   (promise)
        fake-prepared-statement      (->FakePreparedStatement canceled-prepared-statement? closed-prepared-statement? nil)
        placeholder-query            "SLEEP PLACEHOLDER"]
    (with-redefs [jdbc/prepare-statement (fake-prepare-statement
                                          :use-fake-value? #(str/includes? % placeholder-query)
                                          :faked-value fake-prepared-statement)
                  jdbc/query             (fake-query
                                          :on-fake-prepared-statement
                                          (fn [& _]
                                            (deliver started? true)
                                            (Thread/sleep 2000)
                                            (->FakeResultSet nil)))]
      (let [chan (qp/process-query
                   {:database (data/id)
                    :type     :native
                    :native   {:query placeholder-query}
                    :async?   true})]
        (u/deref-with-timeout started? 1000)
        (a/close! chan)
        {:prepared-statement-canceled? (deref canceled-prepared-statement? 3000 false)
         :prepared-statement-closed?   (deref closed-prepared-statement?   1000 false)}))))

;; The test below sort of tests the same thing (I think). But it is written in a much more confusing manner. If you
;; dare, try to work out why happens by reading source `call-with-paused-query`. - Cam
(expect
  ::tu/success
  ;; this might dump messages about the connection being closed; we don't need to worry about that
  (tu.log/suppress-output
    (tu/call-with-paused-query
     (fn [query-thunk called-query? called-cancel? pause-query]
       (let [ ;; This fake prepared statement is cancelable like a prepared statement, but will allow us to tell the
             ;; difference between our Prepared statement and the real thing
             fake-prep-stmt  (->FakePreparedStatement called-cancel? nil nil)]
         (future
           (try
             (with-redefs [jdbc/prepare-statement (fake-prepare-statement
                                                   :use-fake-value? (fn [sql] (re-find #"checkins" (str/lower-case sql)))
                                                   :faked-value     fake-prep-stmt)
                           jdbc/query             (fake-query
                                                   :on-fake-prepared-statement
                                                   (fn []
                                                     (deliver called-query? true)
                                                     @pause-query))]
               (query-thunk))
             (catch Throwable e
               (throw e)))))))))

;; If the DB throws an exception, is it properly returned by the query processor? Is it status :failed? (#9942)
(tu/expect-schema
  {:status     (s/eq :failed)
   :class      (s/eq java.lang.Exception)
   :error      (s/eq "Column \"ADSASDASD\" not found")
   :stacktrace [s/Str]
   :query      s/Any
   :cause      {:class (s/eq org.h2.jdbc.JdbcSQLException)
                :error #"Column \"ADSASDASD\" not found; SQL statement:.*"}}
  (tu.log/suppress-output
    (qp/process-query
      {:database (data/id)
       :type     :native
       :native   {:query "SELECT adsasdasd;"}})))

;; do we run query with a timezone if one is present in the Settings?
(defn- ran-with-timezone? [driver query]
  (let [ran-with-timezone? (promise)
        timezone           (promise)]
    (with-redefs [sql-jdbc.execute/run-query-without-timezone
                  (let [orig @#'sql-jdbc.execute/run-query-without-timezone]
                    (fn [& args]
                      (deliver ran-with-timezone? false)
                      (deliver timezone nil)
                      (apply orig args)))

                  sql-jdbc.execute/run-query-with-timezone
                  (let [orig @#'sql-jdbc.execute/run-query-with-timezone]
                    (fn [& args]
                      (deliver ran-with-timezone? true)
                      (apply orig args)))

                  sql-jdbc.execute/set-timezone!
                  (let [orig @#'sql-jdbc.execute/set-timezone!]
                    (fn [driver {:keys [report-timezone], :as settings} connection]
                      (deliver timezone report-timezone)
                      (orig driver settings connection)))]
      (qp.tu/with-everything-store
        (sql-jdbc.execute/execute-query driver query))
      {:ran-with-timezone? (u/deref-with-timeout ran-with-timezone? 1000)
       :timezone           (u/deref-with-timeout timezone 1000)})))

(expect
  {:ran-with-timezone? false, :timezone nil}
  (ran-with-timezone?
   :h2
   {:database (data/id)
    :type     :native
    :native   {:query "SELECT * FROM VENUES LIMIT 1;"}}))

(expect
  {:ran-with-timezone? true, :timezone "US/Pacific"}
  (ran-with-timezone?
   :h2
   {:database (data/id)
    :type     :native
    :native   {:query "SELECT * FROM VENUES LIMIT 1;"}
    :settings {:report-timezone "US/Pacific"}}))
