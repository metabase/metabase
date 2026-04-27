(ns metabase-enterprise.similarity.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.api :as similarity.api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- seed-edge!
  [{:keys [from to view score target-type]
    :or   {view :ensemble target-type :card}}]
  (t2/insert! :model/SimilarEdge
              {:from_entity_type :card :from_entity_id from
               :to_entity_type   target-type :to_entity_id to
               :view             view
               :score            (double score)
               :last_computed_at (java.time.OffsetDateTime/now)}))

(deftest ^:sequential happy-path-ranks-by-score-desc-test
  (testing "neighbors returns rows in score-desc order, capped at :k"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {hi :id}  {}
                     :model/Card {mid :id} {}
                     :model/Card {lo :id}  {}]
        (seed-edge! {:from src :to hi :score 0.9})
        (seed-edge! {:from src :to mid :score 0.5})
        (seed-edge! {:from src :to lo :score 0.1})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [out (similarity.api/neighbors {:entity-type :card :entity-id src :k 5})]
            (is (= 3 (count out)))
            (is (= [hi mid lo] (mapv :to_entity_id out)))
            (is (= [:card :card :card] (mapv :to_entity_type out)))))))))

(deftest ^:sequential k-truncates-result-test
  (testing ":k caps the visible result count after permission filtering"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {n1 :id}  {}
                     :model/Card {n2 :id}  {}
                     :model/Card {n3 :id}  {}]
        (seed-edge! {:from src :to n1 :score 0.9})
        (seed-edge! {:from src :to n2 :score 0.7})
        (seed-edge! {:from src :to n3 :score 0.5})
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= 2 (count (similarity.api/neighbors
                           {:entity-type :card :entity-id src :k 2})))))))))

(deftest ^:sequential target-type-filter-test
  (testing ":target-type :card filters out non-card neighbors"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {peer :id} {}]
        (seed-edge! {:from src :to peer :score 0.9 :target-type :card})
        (seed-edge! {:from src :to (mt/id :orders) :score 0.95 :target-type :table})
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "target-type :any returns both"
            (is (= #{:card :table}
                   (->> (similarity.api/neighbors
                         {:entity-type :card :entity-id src :target-type :any :k 10})
                        (map :to_entity_type)
                        set))))
          (testing "target-type :card filters out the table"
            (let [out (similarity.api/neighbors
                       {:entity-type :card :entity-id src :target-type :card :k 10})]
              (is (= [:card] (distinct (map :to_entity_type out))))
              (is (= [peer] (mapv :to_entity_id out))))))))))

(deftest ^:sequential views-override-reads-base-rows-test
  (testing ":views override returns raw view rows instead of ensemble"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {peer :id} {}]
        (seed-edge! {:from src :to peer :score 0.5  :view :co-dashboard})
        (seed-edge! {:from src :to peer :score 0.99 :view :ensemble})
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "default :ensemble surfaces the ensemble row"
            (let [[row] (similarity.api/neighbors
                         {:entity-type :card :entity-id src :k 5})]
              (is (= :ensemble (:view row)))
              (is (== 0.99 (:score row)))))
          (testing ":views override surfaces just the requested view"
            (let [[row] (similarity.api/neighbors
                         {:entity-type :card :entity-id src
                          :views #{:co-dashboard} :k 5})]
              (is (= :co-dashboard (:view row)))
              (is (== 0.5 (:score row))))))))))

(deftest ^:sequential permission-attrition-filters-unreadable-test
  (testing "neighbors a user can't read are filtered out (over-fetch covers small loss)"
    (mt/with-model-cleanup [:model/Card :model/Collection :model/SimilarEdge]
      (mt/with-temp [:model/Collection {hidden-coll :id}
                     {:personal_owner_id (mt/user->id :crowberto)}
                     :model/Card {src :id}    {}
                     :model/Card {readable :id} {}
                     :model/Card {hidden :id}   {:collection_id hidden-coll}]
        ;; Hidden card has the higher raw score, so without filtering it would be #1.
        (seed-edge! {:from src :to hidden   :score 0.9})
        (seed-edge! {:from src :to readable :score 0.5})
        (mt/with-current-user (mt/user->id :rasta)
          (let [out (similarity.api/neighbors
                     {:entity-type :card :entity-id src :k 5})]
            (is (= [readable] (mapv :to_entity_id out)))))))))

(deftest ^:sequential cold-instance-empty-edge-table-test
  (testing "no rows for the source ⇒ empty list, no exception"
    (mt/with-model-cleanup [:model/SimilarEdge]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= [] (similarity.api/neighbors
                   {:entity-type :card :entity-id 0 :k 10})))))))

(deftest ^:sequential schema-validation-test
  (testing "neighbors throws on a malformed opts map"
    (is (thrown? Exception
                 (similarity.api/neighbors {})))
    (is (thrown? Exception
                 (similarity.api/neighbors {:entity-type :card})))
    (is (thrown? Exception
                 (similarity.api/neighbors {:entity-type :card :entity-id "not-a-number"})))))

(deftest cold-seeds-stub-test
  (testing "Phase 3 cold-seeds returns []"
    (is (= [] (similarity.api/cold-seeds {})))
    (is (= [] (similarity.api/cold-seeds {:k 100})))))

(deftest community-of-stub-test
  (testing "Phase 3 community-of returns nil"
    (is (nil? (similarity.api/community-of :card 1)))
    (is (nil? (similarity.api/community-of :dashboard 999999)))))
