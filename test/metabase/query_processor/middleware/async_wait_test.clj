(ns metabase.query-processor.middleware.async-wait-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor.middleware.async-wait :as async-wait]
            [metabase.test.util.async :as tu.async]
            [toucan.util.test :as tt])
  (:import java.util.concurrent.Executors
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(def ^:private ^:dynamic *dynamic-var* false)

(defn- async-wait-bound-value
  "Check the bound value of `*dynamic-var*` when a function is executed after the `async-wait` using the thread pool for
  Database with `db-id`."
  [db-id]
  (let [bound-value (promise)]
    (tu.async/with-open-channels [canceled-chan (a/promise-chan)]
      (mt/test-qp-middleware
       async-wait/wait-for-turn
       {:database db-id}
       {}
       []
       {:chans {:canceled-chan canceled-chan}
        :run   (fn []
                 (deliver bound-value *dynamic-var*))}))
    (u/deref-with-timeout bound-value 1000)))

(deftest sanity-check-test
  (testing "basic sanity check: bound value of `*dynamic-var*` should be `false`"
    (tt/with-temp Database [{db-id :id}]
      (= false
         (async-wait-bound-value db-id)))))

(deftest bindings-test
  (testing "bound dynamic vars should get re-bound by in the async wait fn"
    (tt/with-temp Database [{db-id :id}]
      (binding [*dynamic-var* ::wow]
        (is (= ::wow
               (async-wait-bound-value db-id))))))

  (testing "binding should not be persisted between executions -- should be reset when we reuse a thread"
    (let [thread-pool (Executors/newSingleThreadExecutor
                       (.build
                        (doto (BasicThreadFactory$Builder.)
                          (.daemon true))))]
      (with-redefs [async-wait/db-thread-pool (constantly thread-pool)]
        (tt/with-temp Database [{db-id :id}]
          (binding [*dynamic-var* true]
            (async-wait-bound-value db-id))
          (is (= false
                 (async-wait-bound-value db-id))))))))
