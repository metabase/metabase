(ns metabase.explorations.task.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.task.runner :as runner]
   [metabase.explorations.timeline-interestingness :as explorations.timeline-interestingness]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private run-one-iteration! #'runner/run-one-iteration!)

(defn- temp-thread!
  ([user-id] (temp-thread! user-id nil))
  ([user-id prompt]
   (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                            {:name "runner-test"
                                                             :creator_id user-id}))]
     (first (t2/insert-returning-instances! :model/ExplorationThread
                                            (cond-> {:exploration_id (:id exploration)
                                                     :position       0}
                                              prompt (assoc :prompt prompt)))))))

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

(deftest run-one-iteration-writes-contextual-score-test
  (testing "When the thread has a prompt and the lego returns a score, it lands on the result row"
    (mt/with-temp [:model/User u {:email "ctx-score@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u) "Why are venue counts dropping in this region?")
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues
                                     {:aggregation [[:count]]
                                      :breakout    [$category_id]}))]
        (with-redefs [contextual-interestingness/contextual-chart-interestingness
                      (fn [_chart _prompt] 0.73)]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (= 0.73 (:contextual_interestingness_score result)))))))))

(deftest run-one-iteration-skips-contextual-when-prompt-blank-test
  (testing "Threads with no prompt → contextual_interestingness_score is nil and the lego is not called"
    (mt/with-temp [:model/User u {:email "ctx-noprompt@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues
                                     {:aggregation [[:count]]
                                      :breakout    [$category_id]}))
            calls  (atom 0)]
        (with-redefs [contextual-interestingness/contextual-chart-interestingness
                      (fn [_chart _prompt] (swap! calls inc) 0.99)]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (nil? (:contextual_interestingness_score result)))
            (is (zero? @calls) "lego must not be called when the thread has no prompt")))))))

(deftest run-one-iteration-survives-contextual-failure-test
  (testing "A throwing contextual scorer leaves the row done, heuristic still scored, contextual nil"
    (mt/with-temp [:model/User u {:email "ctx-throw@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues
                                                      {:aggregation [[:count]]})}]
      (let [thread (temp-thread! (:id u) "anything")
            row    (pending-query! (:id thread) (:id card)
                                   (mt/mbql-query venues
                                     {:aggregation [[:count]]
                                      :breakout    [$category_id]}))]
        (with-redefs [contextual-interestingness/contextual-chart-interestingness
                      (fn [& _] (throw (ex-info "boom" {})))]
          (let [final  (drain-until-terminal! (:id row) 10)
                result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (= "done" (:status final)))
            (is (some? result))
            (is (pos? (count (:result_data result))))
            (is (nil? (:contextual_interestingness_score result)))
            (is (double? (:interestingness_score result))
                "heuristic score still computed when contextual fails")))))))

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

(defn- store-fake-result!
  [query-id qp-result]
  (let [bytes (cache.impl/do-with-serialization
               (fn [in result-fn]
                 (in qp-result)
                 (result-fn)))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :result_data          bytes})))

(defn- done-query-with-fake-result!
  [thread-id card-id]
  (let [q (first (t2/insert-returning-instances!
                  :model/ExplorationQuery
                  {:exploration_thread_id thread-id
                   :card_id               card-id
                   :dimension_id          "d1"
                   :dataset_query         (mt/mbql-query venues {:aggregation [[:count]]})
                   :status                "done"
                   :position              0}))]
    (store-fake-result! (:id q) {:status :completed
                                 :data   {:cols [{:name "x"} {:name "y"}]
                                          :rows [["a" 1] ["b" 2]]}})
    q))

(deftest timeline-iteration-claims-and-scores-pair-test
  (testing "When a thread-selected timeline has no score for a done query, the worker scores it"
    (mt/with-temp [:model/User u {:email "ti-runner-claim@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (with-redefs [explorations.timeline-interestingness/score-query-timeline
                      (fn [_ _] 0.71)]
          (run-one-iteration!)
          ;; If the iteration picked up a different unrelated row first (e.g. a leftover
          ;; pending query from another test), drain a few more times until ours is scored.
          (loop [n 5]
            (when (and (pos? n)
                       (zero? (t2/count :model/ExplorationQueryTimelineInterestingness
                                        :exploration_query_id (:id q)
                                        :timeline_id (:id tl))))
              (run-one-iteration!)
              (recur (dec n)))))
        (let [scored (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                    :exploration_query_id (:id q)
                                    :timeline_id (:id tl))]
          (is (some? scored))
          (is (= 0.71 (:interestingness_score scored)))
          (is (some? (:scored_at scored))))))))

(deftest timeline-iteration-records-nil-on-scorer-failure-test
  (testing "If the scorer throws or returns nil, scored_at is still set so we don't retry forever"
    (mt/with-temp [:model/User u {:email "ti-runner-fail@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (with-redefs [explorations.timeline-interestingness/score-query-timeline
                      (fn [_ _] (throw (ex-info "boom" {})))]
          (run-one-iteration!)
          (loop [n 5]
            (when (and (pos? n)
                       (zero? (t2/count :model/ExplorationQueryTimelineInterestingness
                                        :exploration_query_id (:id q)
                                        :timeline_id (:id tl))))
              (run-one-iteration!)
              (recur (dec n)))))
        (let [scored (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                    :exploration_query_id (:id q)
                                    :timeline_id (:id tl))]
          (is (some? scored))
          (is (nil? (:interestingness_score scored)))
          (is (some? (:scored_at scored))))))))

(deftest timeline-iteration-is-idempotent-test
  (testing "Once a (query, timeline) pair is scored, subsequent iterations don't duplicate it"
    (mt/with-temp [:model/User u {:email "ti-runner-idem@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (with-redefs [explorations.timeline-interestingness/score-query-timeline
                      (fn [_ _] 0.5)]
          (dotimes [_ 6] (run-one-iteration!)))
        (is (= 1 (t2/count :model/ExplorationQueryTimelineInterestingness
                           :exploration_query_id (:id q)
                           :timeline_id (:id tl))))))))
