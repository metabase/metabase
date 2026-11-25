(ns metabase.queries.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.queries.db :as queries.db]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Card          {c1 :id} {}
                 :model/Card          {c2 :id} {}
                 :model/Card          {c3 :id} {}
                 :model/Card          {c4 :id} {}
                 :model/Card          {c5 :id} {}
                 :model/Dashboard     {d1 :id} {}
                 :model/DashboardCard _        {:dashboard_id d1 :card_id c1}
                 :model/DashboardCard _        {:dashboard_id d1 :card_id c2}
                 :model/DashboardCard _        {:dashboard_id d1 :card_id c2}
                 :model/DashboardCard _        {:dashboard_id d1 :card_id c4}]
    (let [card-ids [c1 c2 c3 c4 c5]
          reads    {:vector-of-cards   #(set (map :id (queries.db/cards card-ids)))
                    :map-of-cards      #(queries.db/cards-by-ids card-ids)
                    :set-of-ids        #(queries.db/existing-card-ids card-ids)
                    :grouped-counts    #(set (queries.db/dashcard-counts-by-card card-ids))}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (mt/with-partition-size 2
                           (read-fn))))))))))

(deftest set-reads-answer-nil-for-no-rows-test
  (testing "no matching row answers nil, as Toucan's set selects do"
    (is (nil? (queries.db/archived-document-ids #{Integer/MAX_VALUE})))
    (is (nil? (queries.db/implicit-action-ids-for-models [Integer/MAX_VALUE]))))
  (testing "no ids answers an empty set"
    (is (= #{} (queries.db/archived-document-ids #{})))
    (is (= #{} (queries.db/card-notification-ids-for-cards [])))))

(deftest positioned-reads-answer-root-rows-for-no-ids-test
  (mt/with-temp [:model/Collection {coll :id}  {}
                 :model/Card       {root :id}  {:collection_id nil :collection_position 1}
                 :model/Card       {inner :id} {:collection_id coll :collection_position 1}]
    (let [ids (set (map :id (queries.db/positioned-cards-in-collections [])))]
      (is (contains? ids root))
      (is (not (contains? ids inner))))))
