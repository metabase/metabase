(ns metabase-enterprise.caching.strategies-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.caching.strategies :as caching]
   [metabase-enterprise.task.caching :as task.caching]
   [metabase.models :refer [Card Dashboard Database]]
   [metabase.models.query :as query]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment
  caching/keep-me)

(deftest query-cache-strategy-hierarchy-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/discard-setting-changes [enable-query-caching]
      (public-settings/enable-query-caching! true)
      ;; corresponding OSS tests in metabase.query-processor.card-test
      (testing "database TTL takes effect when no dashboard or card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {}
                       Card card {:database_id (u/the-id db)}]
          (is (= {:type     :duration
                  :duration 1337
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "card ttl only"
        (mt/with-temp [Card card {:cache_ttl 1337}]
          (is (= {:type     :duration
                  :duration 1337
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {}))))))
      (testing "multiple ttl, card wins if dash and database TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db) :cache_ttl 1339}]
          (is (= {:type     :duration
                  :duration 1339
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "multiple ttl, dash wins when no card TTLs are set"
        (mt/with-temp [Database db {:cache_ttl 1337}
                       Dashboard dash {:cache_ttl 1338}
                       Card card {:database_id (u/the-id db)}]
          (is (= {:type     :duration
                  :duration 1338
                  :unit     "hours"}
                 (:cache-strategy (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)})))))))))

(deftest caching-strategies
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
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
            (let [query (assoc query :cache-strategy {:type           :ttl
                                                      :multiplier     10
                                                      :min_duration   0
                                                      :execution-time 500})]
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
            (let [query (assoc query :cache-strategy {:type         :duration
                                                      :duration     1
                                                      :unit         "minutes"
                                                      :min_duration 0})]
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
          (testing "strategy = schedule || query"
            (let [query (assoc query :cache-strategy {:type       :schedule
                                                      :schedule   "0/2 * * * *"
                                                      :updated_at (t/offset-date-time #t "2024-02-13T10:00:00Z")})]
              (testing "Results are stored and available immediately"
                (mt/with-clock #t "2024-02-13T10:01:00Z"
                  (is (=? (mkres nil)
                          (-> (qp/process-query query) (dissoc :data))))
                  (is (=? (mkres #t "2024-02-13T10:01:00Z")
                          (-> (qp/process-query query) (dissoc :data))))))
              (let [query (assoc-in query [:cache-strategy :updated_at] (t/offset-date-time #t "2024-02-13T10:02:00Z"))]
                (testing "Cache is invalidated when schedule ran after the query"
                  (mt/with-clock #t "2024-02-13T10:03:00Z"
                    (is (=? (mkres nil)
                            (-> (qp/process-query query) (dissoc :data))))))
                (testing "schedule did not run - cache is still intact"
                  (mt/with-clock #t "2024-02-13T10:08:00Z"
                    (is (=? (mkres #t "2024-02-13T10:03:00Z")
                            (-> (qp/process-query query) (dissoc :data))))))))))))))

(deftest e2e-advanced-caching
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching! true)
    (mt/with-premium-features #{:cache-granular-controls}
      (mt/with-temp [:model/Card       card1 {:dataset_query (mt/mbql-query venues {:limit 5})}
                     :model/Card       card2 {:dataset_query (mt/mbql-query venues {:limit 5})}
                     :model/Card       card3 {:dataset_query (mt/mbql-query venues {:limit 5})}
                     :model/Card       card4 {:dataset_query (mt/mbql-query venues {:limit 5})}
                     :model/Card       card5 {:dataset_query (mt/mbql-query venues {:limit 5})}

                     :model/CacheConfig _c1 {:model    "question"
                                             :model_id (:id card1)
                                             :strategy :ttl
                                             :config   {:multiplier   100
                                                        :min_duration 1}}
                     :model/CacheConfig _c2 {:model    "question"
                                             :model_id (:id card2)
                                             :strategy :duration
                                             :config   {:duration 1
                                                        :unit     "minutes"}}
                     :model/CacheConfig _c3 {:model    "question"
                                             :model_id (:id card3)
                                             :strategy :schedule
                                             :config   {:schedule "0 0/2 * * * ? *"}}
                     :model/CacheConfig c4  {:model    "question"
                                             :model_id (:id card4)
                                             :strategy :query
                                             :config   {:field_id    (mt/id :venues :id)
                                                        :aggregation "max"
                                                        :schedule    "0 0/2 * * * ? *"}}]
        (let [t     (fn [seconds]
                      (t/plus #t "2024-02-13T10:00:00Z" (t/duration seconds :seconds)))
              mkres (fn [input]
                      {:cache/details (if input
                                        {:cached true, :updated_at input, :hash some?}
                                        {:stored true, :hash some?})
                       :row_count     5
                       :status        :completed})]
          (testing "strategy = ttl"
            (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
              (mt/with-clock (t 0)
                (let [q (with-redefs [query/average-execution-time-ms (constantly 1000)]
                          (#'qp.card/query-for-card card1 {} {} {} {}))]
                  (is (=? {:type :ttl}
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
                (let [q (#'qp.card/query-for-card card2 {} {} {} {})]
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
                (#'task.caching/refresh-schedule-configs)
                (let [q (#'qp.card/query-for-card card3 {} {} {} {})]
                  (is (=? {:type :schedule}
                          (:cache-strategy q)))
                  (is (=? (mkres nil)
                          (-> (qp/process-query q) (dissoc :data))))
                  (testing "There is cache on second call"
                    (is (=? (mkres (t 0))
                            (-> (qp/process-query q) (dissoc :data)))))))
              (testing "No cache after job ran again"
                (mt/with-clock (t 121)
                  (#'task.caching/refresh-schedule-configs)
                  (let [q (#'qp.card/query-for-card card3 {} {} {} {})]
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data)))))))))

          (testing "strategy = query"
            (mt/with-model-cleanup [[:model/QueryCache :updated_at]]
              (mt/with-clock (t 0)
                (#'task.caching/refresh-query-configs)
                (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                  (is (=? {:type :query}
                          (:cache-strategy q)))
                  (is (=? (mkres nil)
                          (-> (qp/process-query q) (dissoc :data))))
                  (testing "There is cache on second call"
                    (is (=? (mkres (t 0))
                            (-> (qp/process-query q) (dissoc :data)))))))

              (mt/with-clock (t 121)
                (#'task.caching/refresh-query-configs)
                (testing "There is still cache after job ran again"
                  (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                    (is (=? (mkres (t 0))
                            (-> (qp/process-query q) (dissoc :data))))))

                (t2/update! :model/CacheConfig {:id (:id c4)} {:config (assoc (:config c4) :aggregation "count")})
                (#'task.caching/refresh-query-configs)
                (testing "But no cache after the data has changed"
                  (let [q (#'qp.card/query-for-card card4 {} {} {} {})]
                    (is (=? (mkres nil)
                            (-> (qp/process-query q) (dissoc :data)))))))))

          (testing "default strategy = ttl"
            (let [q (#'qp.card/query-for-card card5 {} {} {} {})]
              (is (=? {:type :ttl}
                      (:cache-strategy q))))))))))
