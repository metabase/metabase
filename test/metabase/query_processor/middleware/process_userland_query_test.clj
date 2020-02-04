(ns metabase.query-processor.middleware.process-userland-query-test
  (:require [clojure.core.async :as a]
            [clojure.core.async.impl.protocols :as a.protocols]
            [clojure.test :refer :all]
            [metabase.query-processor
             [error-type :as error-type]
             [util :as qputil]]
            [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
            [metabase.test :as mt]
            [metabase.test.util.async :as tu.async]))

(defn- process-userland-query [query result chans]
  ((process-userland-query/process-userland-query
    (fn [_ _ {:keys [finished-chan], :as chans}]
      (a/>!! finished-chan result)))
   query
   (constantly identity)
   chans))

(defn- do-with-query-execution [query run]
  (tu.async/with-open-channels [query-execution-chan (a/promise-chan)]
    (with-redefs [process-userland-query/save-query-execution! (partial a/>!! query-execution-chan)]
      (run
        (fn qe-result* []
          (let [qe (tu.async/wait-for-result query-execution-chan)]
            (cond-> qe
              (:running_time qe) (update :running_time (fnil pos? 0))
              (:hash qe)         (update :hash #(java.util.Arrays/equals
                                                 %
                                                 (qputil/query-hash query))))))))))

(defmacro ^:private with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- do-with-result [query result run]
  (mt/with-clock #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
    (tu.async/with-open-channels [finished-chan (a/promise-chan)]
      (run
        (fn result* []
          (process-userland-query query result {:finished-chan finished-chan})
          (let [result (tu.async/wait-for-result finished-chan)]
            (is (= true
                   (a.protocols/closed? finished-chan))
                "finished-chan should be closed")
            (update result :running_time (fnil pos? 0))))))))

(defmacro ^:private with-result {:style/indent 1} [[result-binding query result] & body]
  `(do-with-result ~query ~result (fn [~result-binding] ~@body)))

(defn- do-with-result-and-query-execution [query qp-result]
  (with-query-execution [qe query]
    (with-result [result query qp-result]
      {:result          (result)
       :query-execution (qe)})))

(deftest success-test
  (let [query     {:query? true}
        qp-result {:status :completed
                   :data   {:rows []}}]
    (with-query-execution [qe query]
      (with-result [result query qp-result]
        (is (= {:status                 :completed
                :data                   {:rows []}
                :database_id            nil
                :started_at             #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
                :json_query             {:query? true}
                :average_execution_time nil
                :context                nil
                :running_time           true}
               (result))
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
            "QueryExecution should be saved")))))

(deftest failure-test
  (let [query     {:query? true}
        qp-result {:status     :failed
                   :class      clojure.lang.ExceptionInfo
                   :error      "Oops!"
                   :error_type error-type/qp}]
    (with-query-execution [qe query]
      (with-result [result query qp-result]
        (is (= {:status       :failed
                :data         {:rows [], :cols []}
                :database_id  nil
                :started_at   #t "2020-02-04T12:22-08:00[US/Pacific]"
                :error_type   :qp
                :json_query   {:query? true}
                :context      nil
                :error        "Oops!"
                :row_count    0
                :running_time true}
               (result))
            "Result should have (failure) query execution info ")
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
        qp-result              {:status :interrupted}
        saved-query-execution? (atom false)]
    (with-redefs [process-userland-query/save-query-execution-async! (fn [] (reset! saved-query-execution? true))]
      (with-result [result query qp-result]
        (is (= {:status :interrupted, :running_time false}
               (result))
            "Result should have not get added query execution info for canceled query")
        (is (= false
               @saved-query-execution?)
            "No QueryExecution should get saved when a query is canceled")))))
