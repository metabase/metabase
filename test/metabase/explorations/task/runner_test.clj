(ns metabase.explorations.task.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.task.runner :as runner]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private run-one-iteration! #'runner/run-one-iteration!)

(defn- temp-thread!
  [user-id]
  (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                           {:name "runner-test"
                                                            :creator_id user-id}))]
    (first (t2/insert-returning-instances! :model/ExplorationThread
                                           {:exploration_id (:id exploration)
                                            :position       0}))))

(defn- pending-query!
  [thread-id card-id mbql]
  (first (t2/insert-returning-instances! :model/ExplorationQuery
                                         {:exploration_thread_id thread-id
                                          :card_id               card-id
                                          :dimension_id          "d1"
                                          :dataset_query         mbql
                                          :status                "pending"
                                          :position              0})))

(defn- drain-until-terminal!
  "Repeatedly call `run-one-iteration!` until the row with `row-id` reaches a terminal state, or
  `max-iters` is exhausted. Necessary because other concurrent tests may have their own pending
  rows that get processed first."
  [row-id max-iters]
  (loop [n max-iters]
    (when (zero? n)
      (throw (ex-info "ran out of iterations waiting for row" {:row-id row-id})))
    (run-one-iteration!)
    (let [r (t2/select-one :model/ExplorationQuery :id row-id)]
      (if (#{"done" "error"} (:status r))
        r
        (recur (dec n))))))

(deftest run-one-iteration-happy-path-test
  (testing "A pending row gets executed, result_data is written, and status flips to done"
    (mt/with-temp [:model/User u {:email "happy@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues {:aggregation [[:count]]}))
            final  (drain-until-terminal! (:id row) 10)
            result (t2/select-one :model/ExplorationQueryResult
                                  :exploration_query_id (:id row))]
        (is (= "done" (:status final)))
        (is (some? (:started_at final)))
        (is (some? (:finished_at final)))
        (is (nil? (:error_message final)))
        (is (some? result))
        (is (pos? (count (:result_data result))))))))

(deftest run-one-iteration-writes-interestingness-score-test
  (testing "A 2-column result gets scored and the score lands on the result row"
    (mt/with-temp [:model/User u {:email "score@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues
                                     {:aggregation [[:count]]
                                      :breakout    [$category_id]}))
            _      (drain-until-terminal! (:id row) 10)
            result (t2/select-one :model/ExplorationQueryResult
                                  :exploration_query_id (:id row))
            score  (:interestingness_score result)]
        (is (some? result))
        (is (double? score))
        (is (<= 0.0 score 1.0))))))

(deftest run-one-iteration-survives-scoring-failure-test
  (testing "A scoring exception leaves the row done with a nil score; the result blob is still written"
    (mt/with-temp [:model/User u {:email "scorefail@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues
                                     {:aggregation [[:count]]
                                      :breakout    [$category_id]}))]
        (with-redefs [explorations.interestingness/qp-result->chart-config
                      (fn [& _] (throw (ex-info "boom" {})))]
          (let [final  (drain-until-terminal! (:id row) 10)
                result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (= "done" (:status final)))
            (is (some? result))
            (is (pos? (count (:result_data result))))
            (is (nil? (:interestingness_score result)))))))))

(deftest run-one-iteration-error-path-test
  (testing "A row whose query blows up is marked error, no result row is written"
    (mt/with-temp [:model/User u {:email "err@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   {:database 999999 :type :query
                                    :query {:source-table 1 :aggregation [[:count]]}})
            final  (drain-until-terminal! (:id row) 10)]
        (is (= "error" (:status final)))
        (is (some? (:error_message final)))
        (is (some? (:finished_at final)))
        (is (zero? (t2/count :model/ExplorationQueryResult
                             :exploration_query_id (:id row))))))))
