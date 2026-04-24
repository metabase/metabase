(ns metabase-enterprise.cache.strategies-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.cache.strategies :as strategies]
   [metabase-enterprise.cache.task.refresh-cache-configs :as task.cache]
   [metabase.queries.models.query :as query]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.test :as qp]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  strategies/keep-me)

(deftest caching-strategies
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:cache-granular-controls}
      (let [query (mt/mbql-query venues {:order-by [[:asc $id]] :limit 5})
            mkres (fn [input]
                    {:cache/details (if input
                                      {:cached true, :updated_at input, :hash some?}
                                      {:stored true, :hash some?})
                     :row_count     5
                     :status        :completed})]
        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = ttl"
            (let [query (assoc query :cache-strategy {:type             :ttl
                                                      :multiplier       10
                                                      :min-duration-ms  0
                                                      :avg-execution-ms 500})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:00:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (testing "4 seconds past that results are still there - 10 * 500 = 5 seconds"
                (mt/with-clock #t "2024-02-13T10:00:04Z"
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (testing "6 seconds later results are unavailable"
                (mt/with-clock #t "2024-02-13T10:00:06Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data)))))))))

        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = duration"
            (let [query (assoc query :cache-strategy {:type            :duration
                                                      :duration        1
                                                      :unit            "minutes"
                                                      :min-duration-ms 0})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:00:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data)))))
                (mt/with-clock #t "2024-02-13T10:00:59Z"
                  (is (=? (mkres #t "2024-02-13T10:00:00Z")
                          (-> (qp/process-query query) (dissoc :data)))))
                (mt/with-clock #t "2024-02-13T10:01:01Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data)))))))))

        (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
          (testing "strategy = schedule"
            (let [query (assoc query :cache-strategy {:type           :schedule
                                                      :schedule       "0/2 * * * *"
                                                      :invalidated-at (t/offset-date-time #t "2024-02-13T10:00:00Z")})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:01:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:01:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (let [query (assoc-in query [:cache-strategy :invalidated-at] (t/offset-date-time #t "2024-02-13T10:02:00Z"))]
                (testing "Cache is invalidated when schedule ran after the query"
                  (mt/with-clock #t "2024-02-13T10:03:00Z"
                    (is (=? (mkres nil)
                            (-> (qp/process-query query) (dissoc :data))))))
                (testing "schedule did not run - cache is still intact"
                  (mt/with-clock #t "2024-02-13T10:08:00Z"
                    (is (=? (mkres #t "2024-02-13T10:03:00Z")
                            (-> (qp/process-query query) (dissoc :data))))))))))))))

(deftest e2e-advanced-caching
  (binding [search.ingestion/*force-sync* true
            search.ingestion/*disable-updates* true]
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:cache-granular-controls}
        (mt/dataset (mt/dataset-definition "caching1"
                                           [["table"
                                             [{:field-name "value" :indexed? true :base-type :type/Text}]
                                             [["a"] ["b"] ["c"]]]])
          (mt/with-temp [:model/Card       card1 {:dataset_query (mt/mbql-query table)}
                         :model/Card       card2 {:dataset_query (mt/mbql-query table)}
                         :model/Card       card3 {:dataset_query (mt/mbql-query table)}
                         :model/Card       card4 {:dataset_query (mt/mbql-query table)}

                         :model/CacheConfig _cr {:model    "root"
                                                 :model_id 0
                                                 :strategy :ttl
                                                 :config   {:multiplier      200
                                                            :min_duration_ms 10}}
                         :model/CacheConfig _c1 {:model    "question"
                                                 :model_id (:id card1)
                                                 :strategy :ttl
                                                 :config   {:multiplier      100
                                                            :min_duration_ms 0}}
                         :model/CacheConfig _c2 {:model    "question"
                                                 :model_id (:id card2)
                                                 :strategy :duration
                                                 :config   {:duration 1
                                                            :unit     "minutes"}}
                         :model/CacheConfig _c3 {:model    "question"
                                                 :model_id (:id card3)
                                                 :strategy :schedule
                                                 :config   {:schedule "0 0/2 * * * ? *"}}]
            (let [t     (fn [seconds]
                          (t/plus #t "2024-02-13T10:00:00Z" (t/duration seconds :seconds)))
                  mkres (fn [input]
                          {:cache/details (if input
                                            {:cached true, :updated_at input, :hash some?}
                                            {:stored true, :hash some?})
                           :row_count     3
                           :status        :completed})]
              (testing "strategy = ttl"
                (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                  (mt/with-clock (t 0)
                    (let [q (with-redefs [query/average-execution-time-ms (constantly 1000)]
                              (#'qp.card/query-for-card card1 [] {} {} {}))]
                      (is (=? {:type :ttl :multiplier 100}
                              (:cache-strategy q)))
                      (is (=? (mkres nil)
                              (-> (qp/process-query q) (dissoc :data))))
                      (testing "There is cache on second call"
                        (is (=? (mkres (t 0))
                                (-> (qp/process-query q) (dissoc :data)))))
                      (testing "No cache after expiration"
                        (mt/with-clock (t 101) ;; avg execution time 1s * multiplier 100 + 1
                          (is (=? (mkres nil)
                                  (-> (qp/process-query q) (dissoc :data))))))))))

              (testing "strategy = duration"
                (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                  (mt/with-clock (t 0)
                    (let [q (#'qp.card/query-for-card card2 [] {} {} {})]
                      (is (=? {:type :duration}
                              (:cache-strategy q)))
                      (is (=? (mkres nil)
                              (-> (qp/process-query q) (dissoc :data))))
                      (testing "There is cache on the next call"
                        (is (=? (mkres (t 0))
                                (-> (qp/process-query q) (dissoc :data)))))
                      (testing "No cache after expiration"
                        (mt/with-clock (t 61)
                          (is (=? (mkres nil)
                                  (-> (qp/process-query q) (dissoc :data))))))))))

              (testing "strategy = schedule"
                (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
                  (mt/with-clock (t 0)
                    (is (pos? (:schedule-invalidated (#'task.cache/refresh-cache-configs!))))
                    (let [q (#'qp.card/query-for-card card3 [] {} {} {})]
                      (is (=? {:type :schedule}
                              (:cache-strategy q)))
                      (is (=? (mkres nil)
                              (-> (qp/process-query q) (dissoc :data))))
                      (testing "There is cache on second call"
                        (is (=? (mkres (t 0))
                                (-> (qp/process-query q) (dissoc :data)))))))
                  (testing "No cache after job ran again"
                    (mt/with-clock (t 121)
                      (is (pos? (:schedule-invalidated (#'task.cache/refresh-cache-configs!))))
                      (let [q (#'qp.card/query-for-card card3 [] {} {} {})]
                        (is (=? (mkres nil)
                                (-> (qp/process-query q) (dissoc :data)))))))))

              (testing "default strategy = ttl"
                (let [q (#'qp.card/query-for-card card4 [] {} {} {})]
                  (is (=? {:type :ttl :multiplier 200}
                          (:cache-strategy q))))))))))))

(deftest warm-question-cache-configs-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/with-temp [:model/Card        {c1 :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Card        {c2 :id} {:dataset_query (mt/mbql-query venues)}
                   :model/Card        {c3 :id} {:dataset_query (mt/mbql-query venues)}
                   :model/CacheConfig _        {:model    "question"
                                                :model_id c1
                                                :strategy :ttl
                                                :config   {:multiplier 100 :min_duration_ms 0}}
                   :model/CacheConfig _        {:model    "question"
                                                :model_id c2
                                                :strategy :duration
                                                :config   {:duration 5 :unit "minutes"}}]
      (testing "warming populates cache for all card IDs, including nil for cards without configs"
        (binding [strategies/*cache-strategy-cache* (atom {})]
          (strategies/warm-question-cache-configs! #{c1 c2 c3})
          (let [cache @strategies/*cache-strategy-cache*]
            (is (some? (get cache [::strategies/question-config c1]))
                "card with config should be cached")
            (is (some? (get cache [::strategies/question-config c2]))
                "card with config should be cached")
            (is (contains? cache [::strategies/question-config c3])
                "card without config should still have a cache entry")
            (is (nil? (get cache [::strategies/question-config c3]))
                "card without config should have nil cached"))))

      (testing "after warming, find-question-cache-config doesn't hit DB"
        (binding [strategies/*cache-strategy-cache* (atom {})]
          (strategies/warm-question-cache-configs! #{c1 c2 c3})
          (t2/with-call-count [call-count]
            ;; These should all be served from the cache atom
            (#'strategies/find-question-cache-config c1)
            (#'strategies/find-question-cache-config c2)
            (#'strategies/find-question-cache-config c3)
            (is (zero? (call-count))
                "no DB calls should occur after warming")))))))
