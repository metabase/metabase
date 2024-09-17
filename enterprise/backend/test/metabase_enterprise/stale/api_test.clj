(ns metabase-enterprise.stale.api-test
  (:require  [clojure.string :as str]
             [clojure.test :refer [deftest testing is]]
             [metabase.analytics.snowplow-test :as snowplow-test]
             [metabase.models.collection :as collection]
             [metabase.models.collection-test :refer [with-collection-hierarchy!]]
             [metabase.stale-test :as stale.test]
             [metabase.test :as mt]
             [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; Stale API

(deftest stale-items-is-premium-only
  (mt/with-premium-features #{}
    (stale.test/with-stale-items [:model/Card _ {}
                                  :model/Dashboard _ {}]
      (is (str/starts-with? (mt/user-http-request :crowberto :get 402 "ee/stale/root")
                            "Collection Cleanup is a paid feature")))))

(defn- stale-url [collection-or-id]
  (str "ee/stale/" (u/the-id collection-or-id)))

(deftest can-fetch-stale-candidates
  (mt/with-premium-features #{:collection-cleanup}
    (with-collection-hierarchy! [{:keys [a b c d e]}]
      (stale.test/with-stale-items [:model/Card card {:collection_id (:id a)}
                                    :model/Dashboard dashboard {:collection_id (:id a)}]
        (let [result (mt/user-http-request :crowberto :get 200 (stale-url a))]
          (testing "With minor exceptions, the results look just like `/collection/:id/items`"
            (is (= (dissoc
                    (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id a) "/items")
                                          :models "dashboard" :models "card")
                    :models)
                   (update result :data (fn [results] (map (fn [result] (dissoc result :collection)) results))))))
          (testing "The card and dashboard are in there"
            (is (= #{["card" (u/the-id card)] ["dashboard" (u/the-id dashboard)]}
                   (->> result
                        :data
                        (map (juxt :model :id))
                        set))))
          (testing "The count is correct"
            (is (= 2 (:total result))))))
      (testing "Recursive search works"
        (stale.test/with-stale-items [:model/Card card {:collection_id (:id a)}
                                      :model/Dashboard dashboard {:collection_id (:id a)}
                                      :model/Card card-2 {:collection_id (:id b)}
                                      :model/Dashboard dashboard-2 {:collection_id (:id b)}]
          (let [result (mt/user-http-request :crowberto :get 200 (stale-url a)
                                             :is_recursive true)]
            (testing "count is correct"
              (is (= 4 (:total result))))
            (testing "Contains the correct data"
              (= #{["card" (u/the-id card)] ["dashboard" (u/the-id dashboard)]
                   ["card" (u/the-id card-2)] ["dashboard" (u/the-id dashboard-2)]}
                 (->> result :data (map (juxt :model :id)) set))))))
      (testing "Sorting works"
        (stale.test/with-stale-items [:model/Card _ {:collection_id (:id a) :name "A"}
                                      :model/Card _ {:collection_id (:id b) :name "B"}
                                      :model/Card _ {:collection_id (:id c) :name "C"}
                                      :model/Card _ {:collection_id (:id d) :name "D"}
                                      :model/Card _ {:collection_id (:id e) :name "E"}]
          (is (= ["A" "B" "C" "D" "E"]
                 (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                            :is_recursive true)
                      :data
                      (map :name))))
          (is (= ["E" "D" "C" "B" "A"]
                 (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                            :is_recursive true :sort_direction "desc")
                      :data
                      (map :name))))
          (is (= ["A" "B" "C" "D" "E"]
                 (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                            :is_recursive true :sort_column "name")
                      :data
                      (map :name))))
          (is (= ["E" "D" "C" "B" "A"]
                 (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                            :is_recursive true :sort_column "name" :sort_direction "desc")
                      :data
                      (map :name))))))
      (testing "Sanity check: we do actually include only stale items!"
        (stale.test/with-stale-items [:model/Card _ {:collection_id (:id a) :name "A"}
                                      :model/Card _ {:collection_id (:id e) :name "E"}]
          (mt/with-temp [:model/Card _ {:collection_id (:id a) :name "NOT VISIBLE"}
                         :model/Dashboard _ {:collection_id (:id a) :name "NOT VISIBLE"}
                         :model/Card _ {:collection_id (:id e) :name "NOT VISIBLE"}
                         :model/Dashboard _ {:collection_id (:id e) :name "NOT VISIBLE"}]
            (is (= ["A" "E"]
                   (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                              :is_recursive true)
                        :data
                        (map :name)))))))
      (testing "Before date is respected"
        (let [cutoff (stale.test/date-months-ago 2)
              before (.minusDays cutoff 1)
              after (.plusDays cutoff 1)]
          (mt/with-temp [:model/Card _ {:collection_id (:id a) :name "Just before" :last_used_at before}
                         :model/Card _ {:collection_id (:id a) :name "Just after" :last_used_at after}]
            (is (= #{"Just before"}
                   (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                              :before_date (str cutoff))
                        :data
                        (map :name)
                        set)))))))
    (testing "I can get stale items from the root collection"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (stale.test/with-stale-items [:model/Card card-a {:name "Card in root"}
                                      :model/Dashboard dashboard-a {:name "Dashboard in root"}
                                      :model/Card card-b {:name "Card in coll"
                                                          :collection_id coll-id}
                                      :model/Dashboard dashboard-b {:name "Dashboard in coll"
                                                                    :collection_id coll-id}]
          (is (= #{"Card in root"
                   "Card in coll"
                   "Dashboard in root"
                   "Dashboard in coll"}
                 (->> (mt/user-http-request :crowberto :get 200 "ee/stale/root"
                                            :is_recursive true)
                      :data
                      (filter #(contains? #{(u/the-id card-a)
                                            (u/the-id card-b)
                                            (u/the-id dashboard-a)
                                            (u/the-id dashboard-b)}
                                          (:id %)))
                      (map :name)
                      set))))))
    (testing "the collection data is included"
      (mt/with-temp [:model/Collection {top-coll-id :id
                                        top-coll-name :name
                                        :as top-coll} {}

                     :model/Collection
                     {child-coll-id :id
                      child-coll-name :name}
                     {:location (collection/children-location top-coll)}]
        (stale.test/with-stale-items [:model/Card card-in-root {:name "A Card in root"}
                                      :model/Dashboard dashboard-in-root {:name "B Dashboard in root"}

                                      :model/Card card-in-top-level-coll {:name "C Card in coll"
                                                                          :collection_id top-coll-id}
                                      :model/Dashboard dashboard-in-top-level-coll {:name "D Dashboard in coll"
                                                                                    :collection_id top-coll-id}

                                      :model/Card card-in-child-coll {:name "E Card in coll"
                                                                      :collection_id child-coll-id}
                                      :model/Dashboard dashboard-in-child-coll {:name "F Dashboard in coll"
                                                                                :collection_id child-coll-id}]
          (is (= [;; the first two items are in the root collection
                  {:id nil :name nil :type nil :authority_level nil :effective_ancestors []}
                  {:id nil :name nil :type nil :authority_level nil :effective_ancestors []}

                  ;; next we have two items in our top-level collection
                  {:id top-coll-id :name top-coll-name :type nil :authority_level nil :effective_ancestors []}
                  {:id top-coll-id :name top-coll-name :type nil :authority_level nil :effective_ancestors []}

                  ;; finally we have 2 items in our child collection
                  {:id child-coll-id
                   :name child-coll-name
                   :type nil
                   :authority_level nil
                   :effective_ancestors [{:id top-coll-id :name (:name top-coll) :type nil :authority_level nil}]}
                  {:id child-coll-id
                   :name child-coll-name
                   :type nil
                   :authority_level nil
                   :effective_ancestors [{:id top-coll-id :name (:name top-coll) :type nil :authority_level nil}]}]

                 (->> (mt/user-http-request :crowberto :get 200 "ee/stale/root"
                                            :is_recursive true :sort_column "name")
                      :data
                      (filter #(contains? #{(u/the-id card-in-root)
                                            (u/the-id card-in-top-level-coll)
                                            (u/the-id card-in-child-coll)
                                            (u/the-id dashboard-in-root)
                                            (u/the-id dashboard-in-top-level-coll)
                                            (u/the-id dashboard-in-child-coll)}
                                          (:id %)))
                      (map :collection)))))))))

(deftest stale-items-limits-and-offsets-work-correctly
  (mt/with-premium-features #{:collection-cleanup}
    (testing "Limits and offsets work correctly"
      (with-collection-hierarchy! [{:keys [a]}]
        (let [get-names-page (fn [limit offset]
                               (->> (mt/user-http-request :crowberto :get 200 (stale-url a)
                                                          :limit limit
                                                          :offset offset
                                                          :sort_column "name")
                                    :data
                                    (map :name)))]
          (stale.test/with-stale-items [:model/Card _ {:name "A" :collection_id (:id a)}
                                        :model/Card _ {:name "C" :collection_id (:id a)}
                                        :model/Card _ {:name "E" :collection_id (:id a)}
                                        :model/Card _ {:name "G" :collection_id (:id a)}
                                        :model/Dashboard _ {:name "B" :collection_id (:id a)}
                                        :model/Dashboard _ {:name "D" :collection_id (:id a)}
                                        :model/Dashboard _ {:name "F" :collection_id (:id a)}
                                        :model/Dashboard _ {:name "H" :collection_id (:id a)}]
            (is (= (map str "ABCDEFGH")
                   (get-names-page 100 0)))
            (doseq [limit (range 1 5)
                    [offset v] (map-indexed vector (partition limit 1 (map str "ABCDEFGH")))]
              (is (= v (get-names-page limit offset))))))))))

(deftest snowplow-events-are-emitted
  (mt/with-premium-features #{:collection-cleanup}
    (with-collection-hierarchy! [{:keys [a]}]
      (snowplow-test/with-fake-snowplow-collector
        (mt/user-http-request :crowberto :get 200 (stale-url a)
                              :before_date "1988-01-21")
        (is (= {:data {"collection_id" (:id a)
                       "event" "stale_items_read"
                       "total_stale_items_found" 0
                       "cutoff_date" "1988-01-21T00:00:00Z"}
                :user-id (str (mt/user->id :crowberto))}
               (last (snowplow-test/pop-event-data-and-user-id!))))))))
