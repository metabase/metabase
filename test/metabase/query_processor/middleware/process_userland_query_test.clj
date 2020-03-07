(ns metabase.query-processor.middleware.process-userland-query-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.query-processor
             [context :as context]
             [error-type :as error-type]
             [util :as qputil]]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.test :as mt]))

(defn- do-with-query-execution [query run]
  (mt/with-open-channels [save-chan (a/promise-chan)]
    (with-redefs [process-userland-query/save-query-execution!* (partial a/>!! save-chan)]
      (run
        (fn qe-result* []
          (let [qe (mt/wait-for-result save-chan)]
            (cond-> qe
              (:running_time qe) (update :running_time int?)
              (:hash qe)         (update :hash (fn [^bytes a-hash]
                                                 (when a-hash
                                                   (java.util.Arrays/equals a-hash (qputil/query-hash query))))))))))))

(defmacro ^:private with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- process-userland-query
  ([query]
   (process-userland-query query nil))

  ([query context]
   (mt/with-clock #t "2020-02-04T12:22-08:00[US/Pacific]"
     (let [result (mt/test-qp-middleware process-userland-query/process-userland-query query {} [] context)]
       (if-not (map? result)
         result
         (update (:metadata result) :running_time int?))))))

(deftest success-test
  (let [query {:query? true}]
    (with-query-execution [qe query]
      (is (= {:status                 :completed
              :data                   {}
              :row_count              0
              :database_id            nil
              :started_at             #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :json_query             {:query? true}
              :average_execution_time nil
              :context                nil
              :running_time           true}
             (process-userland-query query))
          "Result should have query execution info ")
      (is (= {:hash         true
              :database_id  nil
              :result_rows  0
              :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :executor_id  nil
              :json_query   {:query? true}
              :native       false
              :pulse_id     nil
              :card_id      nil
              :context      nil
              :running_time true
              :dashboard_id nil}
             (qe))
          "QueryExecution should be saved"))))

(deftest failure-test
  (let [query {:query? true}]
    (with-query-execution [qe query]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Oops!"
           (process-userland-query query {:runf (fn [_ _ context]
                                                  (context/raisef (ex-info "Oops!" {:type error-type/qp})
                                                                  context))})))
      (is (= {:hash         true
              :database_id  nil
              :error        "Oops!"
              :result_rows  0
              :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :executor_id  nil
              :json_query   {:query? true}
              :native       false
              :pulse_id     nil
              :card_id      nil
              :context      nil
              :running_time true
              :dashboard_id nil}
             (qe))
          "QueryExecution saved in the DB should have query execution info. empty `:data` should get added to failures"))))

(defn- async-middleware [qp]
  (fn async-middleware-qp [query rff context]
    (future
      (try
        (qp query rff context)
        (catch Throwable e
          (context/raisef e context))))
    nil))

(deftest cancel-test
  (let [saved-query-execution? (atom false)]
    (with-redefs [process-userland-query/save-query-execution! (fn [_] (reset! saved-query-execution? true))]
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (future
          (let [out-chan (mt/test-qp-middleware [process-userland-query/process-userland-query async-middleware]
                                                {} {} []
                                                {:canceled-chan canceled-chan
                                                 :async?        true
                                                 :runf          (fn [_ _ _]
                                                                  (Thread/sleep 1000))})]
            (Thread/sleep 100)
            (a/close! out-chan)))
        (testing "canceled-chan should get get a :cancel message"
          (let [[val port] (a/alts!! [canceled-chan (a/timeout 500)])]
            (is (= 'canceled-chan
                   (if (= port canceled-chan) 'canceled-chan 'timeout))
                "port")
            (is (= :metabase.query-processor.reducible/cancel
                   val)
                "val")))
        (testing "No QueryExecution should get saved when a query is canceled"
          (is (= false
                 @saved-query-execution?)))))))
