(ns metabase.query-processor.middleware.process-userland-query-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events :as events]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.process-userland-query
    :as process-userland-query]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(defn do-with-query-execution [query run]
  (mt/with-clock #t "2020-02-04T12:22-08:00[US/Pacific]"
    (let [original-hash (qp.util/query-hash query)
          result        (promise)]
      (with-redefs [process-userland-query/save-query-execution!* (fn [query-execution]
                                                                    (when-let [^bytes qe-hash (:hash query-execution)]
                                                                      (when (java.util.Arrays/equals qe-hash original-hash)
                                                                        (deliver result query-execution))))]
        (run
          (fn qe-result* []
            (let [qe (deref result 1000 ::timed-out)]
              (cond-> qe
                (:running_time qe) (update :running_time int?)
                (:hash qe)         (update :hash (fn [^bytes a-hash]
                                                   (some-> a-hash codecs/bytes->hex)))))))))))

(defmacro with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- process-userland-query
  ([query]
   (process-userland-query query nil))

  ([query context]
   (let [result (mt/test-qp-middleware process-userland-query/process-userland-query query {} [] context)]
     (if-not (map? result)
       result
       (update (:metadata result) :running_time int?)))))

(deftest success-test
  (let [query {:query {:type ::success-test}}]
    (with-query-execution [qe query]
      (is (= #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
             (t/zoned-date-time))
          "sanity check")
      (is (= {:status                 :completed
              :data                   {}
              :row_count              0
              :database_id            nil
              :started_at             #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :json_query             query
              :average_execution_time nil
              :context                nil
              :running_time           true
              :cached                 false}
             (process-userland-query query))
          "Result should have query execution info")
      (is (= {:hash         "29f0bca06d6679e873b1f5a3a36dac18a5b4642c6545d24456ad34b1cad4ecc6"
              :database_id  nil
              :result_rows  0
              :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :executor_id  nil
              :json_query   query
              :native       false
              :pulse_id     nil
              :card_id      nil
              :action_id    nil
              :is_sandboxed false
              :context      nil
              :running_time true
              :cache_hit    false
              :cache_hash   nil ;; this is filled only for eligible queries
              :dashboard_id nil}
             (qe))
          "QueryExecution should be saved"))))

(deftest failure-test
  (let [query {:query {:type ::failure-test}}]
    (with-query-execution [qe query]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Oops!"
           (process-userland-query query {:runf (fn [_ _ context]
                                                  (qp.context/raisef (ex-info "Oops!" {:type qp.error-type/qp})
                                                                     context))})))
      (is (= {:hash         "d673f355de41679623bfcbda4923d29c1ca64aec6314d79de0369bea2ac246d1"
              :database_id  nil
              :error        "Oops!"
              :result_rows  0
              :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
              :executor_id  nil
              :json_query   query
              :native       false
              :pulse_id     nil
              :action_id    nil
              :card_id      nil
              :context      nil
              :running_time true
              :dashboard_id nil}
             (qe))
          "QueryExecution saved in the DB should have query execution info. empty `:data` should get added to failures"))))

(def ^:private ^:dynamic *viewlog-call-count* nil)

(methodical/defmethod events/publish-event! ::event
  [_topic _event]
  (when *viewlog-call-count*
    (swap! *viewlog-call-count* inc)))

(deftest ^:parallel viewlog-call-test
  (testing "no viewlog event with nil card id"
    (binding [*viewlog-call-count* (atom 0)]
      (mt/test-qp-middleware process-userland-query/process-userland-query {:query? true} {} [] nil)
      (is (zero? @*viewlog-call-count*)))))

(defn- async-middleware [qp]
  (fn async-middleware-qp [query rff context]
    (future
      (try
        (qp query rff context)
        (catch Throwable e
          (qp.context/raisef e context))))
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
