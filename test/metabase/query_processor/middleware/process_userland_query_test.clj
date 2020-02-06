(ns metabase.query-processor.middleware.process-userland-query-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.query-processor
             [error-type :as error-type]
             [util :as qputil]]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.test :as mt]))

(defn- do-with-query-execution [query run]
  (mt/with-open-channels [query-execution-chan (a/promise-chan)]
    (with-redefs [process-userland-query/save-query-execution! (partial a/>!! query-execution-chan)]
      (run
        (fn qe-result* []
          (let [qe (mt/wait-for-result query-execution-chan)]
            (cond-> qe
              (:running_time qe) (update :running_time int?)
              (:hash qe)         (update :hash (fn [^bytes a-hash]
                                                 (when a-hash
                                                   (java.util.Arrays/equals a-hash (qputil/query-hash query))))))))))))

(defmacro ^:private with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- process-userland-query
  ([query]
   (mt/with-open-channels [raise-chan (a/promise-chan)]
     (process-userland-query query {:chans {:raise-chan raise-chan}})))

  ([query options]
   (mt/with-clock #t "2020-02-04T12:22-08:00[US/Pacific]"
     (-> (:post (mt/test-qp-middleware process-userland-query/process-userland-query query {} [] options))
         (update :running_time int?)))))

(deftest success-test
  (let [query {:query? true}]
    (with-query-execution [qe query]
      (is (= {:status                 :completed
              :data                   {:rows []}
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
      (mt/with-open-channels [raise-chan (a/promise-chan)]
        (process-userland-query query {:chans {:raise-chan raise-chan}
                                       :run   (fn []
                                                (a/>!! raise-chan (ex-info "Oops!"
                                                                    {:type error-type/qp}))
                                                (Thread/sleep 100))})
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
            "Result should have query execution info. empty `:data` should get added to failures")))))

(deftest cancel-test
  (let [query                  {:query? true}
        saved-query-execution? (atom false)]
    (with-redefs [process-userland-query/save-query-execution-async! (fn [] (reset! saved-query-execution? true))]
      (mt/with-open-channels [canceled-chan (a/promise-chan)
                              raise-chan    (a/promise-chan)]
        (process-userland-query query {:chans {:canceled-chan canceled-chan, :raise-chan raise-chan}
                                       :run   (fn []
                                                (a/>!! canceled-chan :cancel)
                                                (Thread/sleep 100))})
        (is (= false
               @saved-query-execution?)
            "No QueryExecution should get saved when a query is canceled")))))
