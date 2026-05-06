(ns metabase.explorations.timeline-interestingness-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.timeline-interestingness :as ti]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- store-fake-result!
  "Mirror the worker's serialization format for a fixture qp-result."
  [query-id qp-result]
  (let [bytes (cache.impl/do-with-serialization
               (fn [in result-fn]
                 (in qp-result)
                 (result-fn)))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :result_data          bytes})))

(defn- fixture-qp-result
  "Two-column time-series result the chart-config builder can score."
  []
  {:status :completed
   :data   {:cols [{:name           "month"
                    :base_type      :type/DateTime
                    :effective_type :type/DateTime
                    :display_name   "Month"}
                   {:name         "revenue"
                    :base_type    :type/Integer
                    :display_name "Revenue"}]
            :rows [["2025-01-01T00:00:00Z" 100]
                   ["2025-02-01T00:00:00Z" 110]
                   ["2025-03-01T00:00:00Z" 95]
                   ["2025-04-01T00:00:00Z" 220]
                   ["2025-05-01T00:00:00Z" 240]]}
   :row_count 5})

(defn- temp-thread!
  ([user-id] (temp-thread! user-id nil))
  ([user-id prompt]
   (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                            {:name "ti-test"
                                                             :creator_id user-id}))]
     (first (t2/insert-returning-instances! :model/ExplorationThread
                                            (cond-> {:exploration_id (:id exploration)
                                                     :position       0}
                                              prompt (assoc :prompt prompt)))))))

(defn- done-query!
  [thread-id card-id]
  (let [q (first (t2/insert-returning-instances! :model/ExplorationQuery
                                                 {:exploration_thread_id thread-id
                                                  :card_id               card-id
                                                  :dimension_id          "d1"
                                                  :dataset_query         (mt/mbql-query venues
                                                                           {:aggregation [[:count]]
                                                                            :breakout    [$category_id]})
                                                  :status                "done"
                                                  :position              0}))]
    (store-fake-result! (:id q) (fixture-qp-result))
    q))

(deftest score-returns-nil-when-llm-not-configured-test
  (mt/with-temp [:model/User u {:email "ti-noconfig@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
    (let [thread (temp-thread! (:id u))
          q      (done-query! (:id thread) (:id card))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
        (is (nil? (ti/score-query-timeline (:id q) (:id tl))))))))

(deftest score-returns-nil-when-query-not-done-test
  (mt/with-temp [:model/User u {:email "ti-pending@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
    (let [thread (temp-thread! (:id u))
          q      (first (t2/insert-returning-instances!
                         :model/ExplorationQuery
                         {:exploration_thread_id (:id thread)
                          :card_id               (:id card)
                          :dimension_id          "d1"
                          :dataset_query         (mt/mbql-query venues {:aggregation [[:count]]})
                          :status                "pending"
                          :position              0}))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured (fn [& _] {:score 0.5 :reasoning "x"})]
        (is (nil? (ti/score-query-timeline (:id q) (:id tl))))))))

(deftest score-returns-clamped-double-on-valid-llm-response-test
  (mt/with-temp [:model/User u {:email "ti-ok@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "Promotions" :creator_id (:id u)}
                 :model/TimelineEvent _e {:timeline_id  (:id tl)
                                          :name         "Big sale"
                                          :timestamp    #t "2025-04-01T00:00:00Z"
                                          :time_matters true
                                          :timezone     "UTC"
                                          :icon         "star"
                                          :creator_id   (:id u)}]
    (let [thread (temp-thread! (:id u) "Why did revenue jump?")
          q      (done-query! (:id thread) (:id card))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured
                    (fn [_ _ _ _ _ _] {:score 0.83 :reasoning "events line up with the spike"})]
        (let [score (ti/score-query-timeline (:id q) (:id tl))]
          (is (double? score))
          (is (<= 0.0 score 1.0))
          (is (= 0.83 score)))))))

(deftest score-clamps-out-of-range-llm-response-test
  (mt/with-temp [:model/User u {:email "ti-clamp@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "x" :creator_id (:id u)}]
    (let [thread (temp-thread! (:id u))
          q      (done-query! (:id thread) (:id card))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured (fn [_ _ _ _ _ _] {:score 1.7 :reasoning "x"})]
        (is (= 1.0 (ti/score-query-timeline (:id q) (:id tl)))))
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured (fn [_ _ _ _ _ _] {:score -0.4 :reasoning "x"})]
        (is (= 0.0 (ti/score-query-timeline (:id q) (:id tl))))))))

(deftest score-returns-nil-on-malformed-llm-response-test
  (mt/with-temp [:model/User u {:email "ti-malformed@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "x" :creator_id (:id u)}]
    (let [thread (temp-thread! (:id u))
          q      (done-query! (:id thread) (:id card))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured (fn [_ _ _ _ _ _] {:reasoning "missing score"})]
        (is (nil? (ti/score-query-timeline (:id q) (:id tl))))))))

(deftest score-returns-nil-when-llm-throws-test
  (mt/with-temp [:model/User u {:email "ti-throw@example.com"}
                 :model/Card card {:type :metric :creator_id (:id u)
                                   :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Timeline tl {:name "x" :creator_id (:id u)}]
    (let [thread (temp-thread! (:id u))
          q      (done-query! (:id thread) (:id card))]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                    metabot.self/call-llm-structured (fn [& _] (throw (ex-info "boom" {})))]
        (is (nil? (ti/score-query-timeline (:id q) (:id tl))))))))
