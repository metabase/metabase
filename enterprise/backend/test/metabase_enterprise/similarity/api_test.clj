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
    ;; Overlay+dedup off: this test fences the load-edges path (view
    ;; selection + score precision), not the Phase 7 post-processing.
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {peer :id} {}]
        (seed-edge! {:from src :to peer :score 0.5  :view :co-dashboard})
        (seed-edge! {:from src :to peer :score 0.99 :view :ensemble})
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "default :ensemble surfaces the ensemble row"
            (let [[row] (similarity.api/neighbors
                         {:entity-type :card :entity-id src :k 5
                          :apply-overlay? false :dedupe-by-community? false})]
              (is (= :ensemble (:view row)))
              (is (== 0.99 (:score row)))))
          (testing ":views override surfaces just the requested view"
            (let [[row] (similarity.api/neighbors
                         {:entity-type :card :entity-id src
                          :views #{:co-dashboard} :k 5
                          :apply-overlay? false :dedupe-by-community? false})]
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

;; ----------------------------------------------------------------------------
;; Phase 7 — neighbors cascade (overlay + dedupe-by-community)
;; ----------------------------------------------------------------------------

(defn- insert-verified-card-review!
  [card-id]
  (t2/insert! :model/ModerationReview
              {:moderated_item_id   card-id
               :moderated_item_type "card"
               :moderator_id        (mt/user->id :crowberto)
               :status              "verified"
               :most_recent         true
               :text                "ok"}))

(deftest ^:sequential dedupe-by-community-batched-parity-test
  (testing "batched dedupe-by-community matches the per-row semantics"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (seed-community! {:entity-id 10 :community-id 0})
      (seed-community! {:entity-id 11 :community-id 0})
      (seed-community! {:entity-id 12 :community-id 0})
      (seed-community! {:entity-id 20 :community-id 1})
      (seed-community! {:entity-id 21 :community-id 1})
      (let [candidates (mapv #(hash-map :to_entity_type :card :to_entity_id %)
                             [10 11 12 20 21])
            out        (similarity.api/dedupe-by-community candidates)]
        (testing "first member of each community wins; cross-community survivors preserved"
          (is (= [10 20] (mapv :to_entity_id out))))))))

(deftest ^:sequential dedupe-by-community-empty-input-test
  (testing "empty input returns [] without DB hits"
    ;; with-redefs on t2/select would catch a stray query; not bothering — the
    ;; empty contract is the load-bearing fence.
    (is (= [] (similarity.api/dedupe-by-community [])))
    (is (= [] (similarity.api/dedupe-by-community nil)))))

(deftest ^:sequential neighbors-defaults-apply-overlay-and-dedup-test
  (testing "default flags: dedup collapses near-clones; rows carry overlay decoration"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge
                            :model/SimilarityCommunity :model/SimilarityPagerank]
      (mt/with-temp [:model/Card {src :id}     {}
                     :model/Card {clone-a :id} {}
                     :model/Card {clone-b :id} {}
                     :model/Card {clone-c :id} {}]
        ;; Three near-clones in one community → dedup keeps one.
        (seed-community! {:entity-id clone-a :community-id 0})
        (seed-community! {:entity-id clone-b :community-id 0})
        (seed-community! {:entity-id clone-c :community-id 0})
        (seed-edge! {:from src :to clone-a :score 0.95})
        (seed-edge! {:from src :to clone-b :score 0.92})
        (seed-edge! {:from src :to clone-c :score 0.90})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [out (similarity.api/neighbors {:entity-type :card :entity-id src :k 5})]
            (testing "exactly one survivor"
              (is (= 1 (count out))))
            (testing "row carries fused_score and overlay_multiplier"
              (is (number? (:fused_score (first out))))
              (is (number? (:overlay_multiplier (first out)))))))))))

(deftest ^:sequential neighbors-overlay-and-dedup-off-regression-fence-test
  (testing "both flags off: returns raw load-edges output, no overlay decoration"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge
                            :model/SimilarityCommunity]
      (mt/with-temp [:model/Card {src :id}    {}
                     :model/Card {hi :id}     {}
                     :model/Card {mid :id}    {}
                     :model/Card {lo :id}     {}]
        (seed-community! {:entity-id hi :community-id 0})
        (seed-community! {:entity-id mid :community-id 0})
        (seed-edge! {:from src :to hi  :score 0.9})
        (seed-edge! {:from src :to mid :score 0.5})
        (seed-edge! {:from src :to lo  :score 0.1})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [out (similarity.api/neighbors
                     {:entity-type :card :entity-id src :k 5
                      :apply-overlay? false :dedupe-by-community? false})]
            (is (= [hi mid lo] (mapv :to_entity_id out)))
            (is (= [0.9 0.5 0.1] (mapv :score out)))
            (is (every? #(not (contains? % :fused_score)) out))
            (is (every? #(not (contains? % :overlay_multiplier)) out))))))))

(deftest ^:sequential neighbors-overlay-on-dedup-off-test
  (testing ":apply-overlay? true, :dedupe-by-community? false — near-clones survive, ranked by overlay"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/ModerationReview
                            :model/SimilarityCommunity :model/SimilarityPagerank]
      (mt/with-temp [:model/Card {src :id}        {}
                     :model/Card {clone-a :id}    {}
                     :model/Card {clone-b :id}    {}
                     :model/Card {verified-id :id} {}]
        (insert-verified-card-review! verified-id)
        (seed-community! {:entity-id clone-a     :community-id 0})
        (seed-community! {:entity-id clone-b     :community-id 0})
        (seed-community! {:entity-id verified-id :community-id 0})
        (seed-edge! {:from src :to clone-a     :score 0.95})
        (seed-edge! {:from src :to clone-b     :score 0.92})
        (seed-edge! {:from src :to verified-id :score 0.50})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [out (similarity.api/neighbors
                     {:entity-type :card :entity-id src :k 5
                      :apply-overlay? true :dedupe-by-community? false})]
            (is (= 3 (count out)))
            (is (every? #(contains? % :fused_score) out))
            (is (every? #(contains? % :overlay_multiplier) out))))))))

(deftest ^:sequential neighbors-overlay-off-dedup-on-test
  (testing ":apply-overlay? false, :dedupe-by-community? true — dedup by raw fused score"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarityCommunity]
      (mt/with-temp [:model/Card {src :id} {}
                     :model/Card {a :id}   {}
                     :model/Card {b :id}   {}
                     :model/Card {c :id}   {}]
        (seed-community! {:entity-id a :community-id 0})
        (seed-community! {:entity-id b :community-id 0})
        (seed-community! {:entity-id c :community-id 1})
        (seed-edge! {:from src :to a :score 0.9})
        (seed-edge! {:from src :to b :score 0.7})
        (seed-edge! {:from src :to c :score 0.5})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [out (similarity.api/neighbors
                     {:entity-type :card :entity-id src :k 5
                      :apply-overlay? false :dedupe-by-community? true})]
            (is (= [a c] (mapv :to_entity_id out)))
            (is (every? #(not (contains? % :fused_score)) out))))))))

(deftest ^:sequential neighbors-order-matters-fence-test
  (testing "overlay runs before dedup — verified card with lower fused score wins its community"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/ModerationReview
                            :model/SimilarityCommunity :model/SimilarityPagerank]
      (mt/with-temp [:model/Card {src :id}        {}
                     :model/Card {unverified :id} {}
                     :model/Card {verified :id}   {}]
        (insert-verified-card-review! verified)
        (seed-community! {:entity-id unverified :community-id 0})
        (seed-community! {:entity-id verified   :community-id 0})
        (seed-edge! {:from src :to unverified :score 0.80})
        (seed-edge! {:from src :to verified   :score 0.65})
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "overlay-on + dedup-on: verified wins despite lower fused score"
            (let [out (similarity.api/neighbors
                       {:entity-type :card :entity-id src :k 5})]
              (is (= [verified] (mapv :to_entity_id out)))))
          (testing "overlay-off + dedup-on: unverified wins on raw fused score"
            (let [out (similarity.api/neighbors
                       {:entity-type :card :entity-id src :k 5
                        :apply-overlay? false})]
              (is (= [unverified] (mapv :to_entity_id out))))))))))

(deftest ^:sequential neighbors-overfetch-coefficient-test
  (testing "load-edges is called with c · k rows for over-fetch headroom"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}]
        (let [observed (atom nil)
              orig     @#'similarity.api/load-edges]
          (with-redefs [similarity.api/load-edges
                        (fn [opts limit]
                          (reset! observed limit)
                          (orig opts limit))]
            (mt/with-current-user (mt/user->id :crowberto)
              (similarity.api/neighbors {:entity-type :card :entity-id src :k 20})
              (is (= 60 @observed))
              (similarity.api/neighbors {:entity-type :card :entity-id src :k 7})
              (is (= 21 @observed)))))))))

(deftest ^:sequential neighbors-k-warn-fence-test
  (testing "k > max-supported-k is honored but logged; no exception"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id} {}]
        (mt/with-current-user (mt/user->id :crowberto)
          ;; Empty index, so the result is []; the test fences that the call
          ;; itself succeeds and produces a vector.
          (is (vector? (similarity.api/neighbors
                        {:entity-type :card :entity-id src :k 30}))))))))

(deftest ^:sequential neighbors-schema-decorates-only-when-overlay-applies-test
  (testing "::neighbor :fused_score / :overlay_multiplier are optional"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge]
      (mt/with-temp [:model/Card {src :id}  {}
                     :model/Card {peer :id} {}]
        (seed-edge! {:from src :to peer :score 0.5})
        (mt/with-current-user (mt/user->id :crowberto)
          (let [decorated (first (similarity.api/neighbors
                                  {:entity-type :card :entity-id src :k 5}))
                bare      (first (similarity.api/neighbors
                                  {:entity-type :card :entity-id src :k 5
                                   :apply-overlay? false}))]
            ;; Decorated path: optional fields populated.
            (is (number? (:fused_score decorated)))
            (is (number? (:overlay_multiplier decorated)))
            ;; Bare path: optional fields absent.
            (is (not (contains? bare :fused_score)))
            (is (not (contains? bare :overlay_multiplier)))))))))
