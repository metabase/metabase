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

(deftest ^:sequential schema-validation-test
  (testing "neighbors throws on a malformed opts map"
    (is (thrown? Exception
                 (similarity.api/neighbors {})))
    (is (thrown? Exception
                 (similarity.api/neighbors {:entity-type :card})))
    (is (thrown? Exception
                 (similarity.api/neighbors {:entity-type :card :entity-id "not-a-number"})))))

(deftest cold-seeds-empty-when-no-rows-test
  (testing "cold-seeds returns [] when similarity_pagerank is empty"
    (mt/with-model-cleanup [:model/SimilarityPagerank]
      (is (= [] (similarity.api/cold-seeds {})))
      (is (= [] (similarity.api/cold-seeds {:k 100}))))))

(deftest community-of-nil-when-no-rows-test
  (testing "community-of returns nil when similarity_community is empty"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (is (nil? (similarity.api/community-of :card 1)))
      (is (nil? (similarity.api/community-of :dashboard 999999))))))

(defn- seed-pagerank!
  [{:keys [scope entity-type entity-id score rank]
    :or   {scope :card entity-type :card}}]
  (t2/insert! :model/SimilarityPagerank
              {:scope       scope
               :entity_type entity-type
               :entity_id   entity-id
               :score       (double score)
               :rank        rank
               :computed_at (java.time.OffsetDateTime/now)}))

(defn- seed-community!
  [{:keys [scope entity-type entity-id community-id centrality]
    :or   {scope :card entity-type :card centrality 0.5}}]
  (t2/insert! :model/SimilarityCommunity
              {:scope        scope
               :entity_type  entity-type
               :entity_id    entity-id
               :community_id community-id
               :centrality   (double centrality)
               :computed_at  (java.time.OffsetDateTime/now)}))

(deftest cold-seeds-reads-pagerank-test
  (testing "cold-seeds returns rows ordered by rank, capped at :k"
    (mt/with-model-cleanup [:model/SimilarityPagerank]
      (seed-pagerank! {:entity-id 100 :score 0.05 :rank 1})
      (seed-pagerank! {:entity-id 200 :score 0.04 :rank 2})
      (seed-pagerank! {:entity-id 300 :score 0.03 :rank 3})
      (let [out (similarity.api/cold-seeds {:type :card :k 2})]
        (is (= 2 (count out)))
        (is (= [100 200] (mapv :entity_id out)))
        (is (= [1 2] (mapv :rank out)))))))

(deftest cold-seeds-defaults-to-full-scope-test
  (testing "absent :type reads scope='full'"
    (mt/with-model-cleanup [:model/SimilarityPagerank]
      (seed-pagerank! {:scope :card :entity-id 1 :score 0.1 :rank 1})
      (seed-pagerank! {:scope :full :entity-id 2 :score 0.2 :rank 1})
      (let [out (similarity.api/cold-seeds {:k 5})]
        (is (= [2] (mapv :entity_id out)))))))

(deftest community-of-reads-row-test
  (testing "community-of returns scope/community-id/centrality"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (seed-community! {:entity-id 42 :community-id 7 :centrality 0.8})
      (let [out (similarity.api/community-of :card 42)]
        (is (= :card (:scope out)))
        (is (= 7    (:community-id out)))
        (is (== 0.8 (:centrality out))))
      (is (nil? (similarity.api/community-of :card 999999))))))

(deftest dedupe-by-community-keeps-first-per-community-test
  (testing "ranked candidates collapse to one representative per community"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (seed-community! {:entity-id 10 :community-id 0 :centrality 0.9})
      (seed-community! {:entity-id 11 :community-id 0 :centrality 0.5})
      (seed-community! {:entity-id 20 :community-id 1 :centrality 0.8})
      (let [candidates [{:to_entity_type :card :to_entity_id 10}
                        {:to_entity_type :card :to_entity_id 11}
                        {:to_entity_type :card :to_entity_id 20}]
            out (similarity.api/dedupe-by-community candidates)]
        (is (= [10 20] (mapv :to_entity_id out)))))))

(deftest dedupe-by-community-passes-through-uncategorized-test
  (testing "candidates with no community row pass through untouched"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (let [candidates [{:to_entity_type :card :to_entity_id 999}
                        {:to_entity_type :card :to_entity_id 998}]
            out (similarity.api/dedupe-by-community candidates)]
        (is (= candidates out))))))

(deftest pagerank-percentile-test
  (testing "percentile is 1 - (rank-1)/total within scope"
    (mt/with-model-cleanup [:model/SimilarityPagerank]
      (doseq [r (range 1 11)]
        (seed-pagerank! {:entity-id r :score (- 0.2 (* r 0.01)) :rank r}))
      (let [approx= (fn [a b] (< (Math/abs (- (double a) (double b))) 1e-9))]
        (is (approx= 1.0 (similarity.api/pagerank-percentile-of :card :card 1)))
        (is (approx= 0.5 (similarity.api/pagerank-percentile-of :card :card 6)))
        (is (approx= 0.1 (similarity.api/pagerank-percentile-of :card :card 10))))
      (is (nil? (similarity.api/pagerank-percentile-of :card :card 999))))))
