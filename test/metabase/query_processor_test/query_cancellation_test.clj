(ns metabase.query-processor-test.query-cancellation-test
  "TODO - This is sql-jdbc specific, so it should go in a sql-jdbc test namespace."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.test.util :as tu]
            [metabase.test.util.log :as tu.log]))

(defrecord ^:private FakePreparedStatement [called-cancel?]
  java.sql.PreparedStatement
  (closeOnCompletion [_]) ; no-op
  (cancel [_] (deliver called-cancel? true))
  (close [_] true))

(defn- make-fake-prep-stmt
  "Returns `fake-value` whenenver the `sql` parameter returns a truthy value when passed to `use-fake-value?`."
  [orig-make-prep-stmt & {:keys [use-fake-value? faked-value]
                          :or   {use-fake-value? (constantly false)}}]
  (fn [connection sql options]
    (if (use-fake-value? sql)
      faked-value
      (orig-make-prep-stmt connection sql options))))

(defn- fake-query
  "Function to replace the `clojure.java.jdbc/query` function. Will invoke `on-fake-prepared-statement` when passed an
  instance of `FakePreparedStatement`."
  {:style/indent 1}
  [orig-jdbc-query & {:keys [on-fake-prepared-statement]}]
  (fn
    ([conn stmt+params]
     (orig-jdbc-query conn stmt+params))

    ([conn stmt+params opts]
     (if (instance? FakePreparedStatement (first stmt+params))
       (when on-fake-prepared-statement (on-fake-prepared-statement))
       (orig-jdbc-query conn stmt+params opts)))))

(expect
  ::tu/success
  ;; this might dump messages about the connection being closed; we don't need to worry about that
  (tu.log/suppress-output
    (tu/call-with-paused-query
     (fn [query-thunk called-query? called-cancel? pause-query]
       (let [ ;; This fake prepared statement is cancelable like a prepared statement, but will allow us to tell the
             ;; difference between our Prepared statement and the real thing
             fake-prep-stmt  (->FakePreparedStatement called-cancel?)
             ;; Much of the underlying plumbing of MB requires a working jdbc/query and jdbc/prepared-statement (such
             ;; as queryies for the application database). Let binding the original versions of the functions allows
             ;; us to delegate to them when it's not the query we're trying to test
             orig-jdbc-query jdbc/query
             orig-prep-stmt  jdbc/prepare-statement]
         (future
           (try
             (with-redefs [jdbc/prepare-statement (make-fake-prep-stmt
                                                   orig-prep-stmt
                                                   :use-fake-value? (fn [sql] (re-find #"checkins" (str/lower-case sql)))
                                                   :faked-value     fake-prep-stmt)
                           jdbc/query             (fake-query orig-jdbc-query
                                                    :on-fake-prepared-statement
                                                    (fn []
                                                      (deliver called-query? true)
                                                      @pause-query))]
               (query-thunk))
             (catch Throwable e
               (throw e)))))))))
