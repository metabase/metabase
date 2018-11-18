(ns metabase.query-processor-test.query-cancellation-test
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [metabase.test.util :as tu]
            [metabase.test.util.log :as tu.log]))

(deftype FakePreparedStatement [called-cancel?]
  java.sql.PreparedStatement
  (cancel [_] (deliver called-cancel? true))
  (close [_] true))

(defn- make-fake-prep-stmt
  "Returns `fake-value` whenenver the `sql` parameter returns a truthy value when passed to `use-fake-value?`"
  [orig-make-prep-stmt use-fake-value? faked-value]
  (fn [connection sql options]
    (if (use-fake-value? sql)
      faked-value
      (orig-make-prep-stmt connection sql options))))

(defn- fake-query
  "Function to replace the `clojure.java.jdbc/query` function. Will invoke `call-on-query`, then `call-to-pause` whe
  passed an instance of `FakePreparedStatement`"
  [orig-jdbc-query call-on-query call-to-pause]
  (fn
    ([conn stmt+params]
     (orig-jdbc-query conn stmt+params))
    ([conn stmt+params opts]
     (if (instance? FakePreparedStatement (first stmt+params))
       (do
         (call-on-query)
         (call-to-pause))
       (orig-jdbc-query conn stmt+params opts)))))

(expect
  [false ;; Ensure the query promise hasn't fired yet
   false ;; Ensure the cancellation promise hasn't fired yet
   true  ;; Was query called?
   false ;; Cancel should not have been called yet
   true  ;; Cancel should have been called now
   true  ;; The paused query can proceed now
   ]
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
           (with-redefs [jdbc/prepare-statement (make-fake-prep-stmt orig-prep-stmt (fn [table-name] (re-find #"CHECKINS" table-name)) fake-prep-stmt)
                         jdbc/query             (fake-query orig-jdbc-query #(deliver called-query? true) #(deref pause-query))]
             (query-thunk))))))))
