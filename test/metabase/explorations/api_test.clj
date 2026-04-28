(ns metabase.explorations.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- valid-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query {:database 1
                   :type     :query
                   :query    {:source-table 1
                              :aggregation  [[:count]]}}})

(deftest exploration-create-persists-everything-and-runs-test
  (testing "POST / creates an exploration with one thread, persists selections, and materializes queries"
    (mt/with-temp [:model/User u {:email "create@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [body {:name         "Why is revenue down"
                  :description  "Q3 dip"
                  :prompt       "break down by region"
                  :metrics      [{:card_id (:id metric)
                                  :dimension_mappings [{:dimension_id "d1"
                                                        :table_id 1
                                                        :target ["field" {} 1]}]}]
                  :dimensions   [{:dimension_id "d1" :display_name "Region"}]
                  :timeline_ids [(:id tl)]}
            resp (mt/user-http-request u :post 200 "exploration" body)
            thread (-> resp :threads first)
            q      (-> thread :queries first)]
        (is (= "Why is revenue down" (:name resp)))
        (is (= 1 (count (:threads resp))))
        (is (= "break down by region" (:prompt thread)))
        (is (some? (:started_at thread)))
        (is (= 1 (count (:metrics thread))))
        (is (= 1 (count (:dimensions thread))))
        (is (= 1 (count (:timelines thread))))
        (is (= 1 (count (:queries thread))))
        (is (= ["d1"] (:dimension_ids q)))
        (is (= [["field" {} 1]] (-> q :dataset_query :query :breakout))
            "snapshot MBQL adds a breakout from the dimension's target")))))

(deftest exploration-create-without-selections-test
  (testing "POST / works without metrics/dimensions/timelines (drafty exploration)"
    (mt/with-temp [:model/User u {:email "empty@example.com"}]
      (let [resp (mt/user-http-request u :post 200 "exploration" {:name "empty"})]
        (is (= 1 (count (:threads resp))))
        (is (zero? (count (-> resp :threads first :metrics))))
        (is (zero? (count (-> resp :threads first :queries))))))))

(deftest exploration-get-permissions-test
  (testing "Only the creator (or a superuser) can GET an exploration"
    (mt/with-temp [:model/User owner {:email "p-owner@example.com"}
                   :model/User other {:email "p-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration" {:name "private"})]
        (mt/user-http-request other :get 403 (format "exploration/%d" eid))
        (let [resp (mt/user-http-request owner :get 200 (format "exploration/%d" eid))]
          (is (= eid (:id resp))))))))

(deftest exploration-cascade-delete-test
  (testing "Deleting an exploration cascades to threads, selections, and queries"
    (mt/with-temp [:model/User u {:email "cd@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "cascade"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]
                                        :timeline_ids [(:id tl)]})
            eid  (:id resp)
            tid  (-> resp :threads first :id)]
        (t2/delete! :model/Exploration :id eid)
        (is (zero? (t2/count :model/ExplorationThread :exploration_id eid)))
        (is (zero? (t2/count :model/ExplorationThreadMetric :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadDimension :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id tid)))))))
