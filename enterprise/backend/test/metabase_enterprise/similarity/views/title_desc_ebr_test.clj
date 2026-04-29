(ns metabase-enterprise.similarity.views.title-desc-ebr-test
  "Tests for the `:title-desc-ebr` lexical/semantic similarity view.

   Helper-level tests (`neighbors-of`, `indexed-row-count`) run without a real
   pgvector index by stubbing `try-active-index-state`.

   Full pipeline tests are gated on `(:mb-pgvector-db-url env)` via the shared
   `semantic-search.test-util/once-fixture` and use the `:mock-initialized`
   setup mode (4-dimensional mock embeddings, mock provider). The H2 lane
   degrades to a no-op."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase-enterprise.similarity.views.title-desc-ebr :as title-desc-ebr]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(set! *warn-on-reflection* true)

;; -- text/embedding fixtures ----------------------------------------------

(defn- card-doc
  "Build a card document for `upsert-index!`. The `:embeddable_text` is what the
   mock embedder hashes against `mock-embeddings`."
  [id text]
  {:model           "card"
   :id              id
   :name            text
   :searchable_text text
   :embeddable_text text
   :archived        false
   :legacy_input    {:model "card" :id id}
   :metadata        {:title text}})

(defn- archived-card-doc [id text]
  (assoc (card-doc id text) :archived true))

(defn- dashboard-doc [id text]
  {:model           "dashboard"
   :id              id
   :name            text
   :searchable_text text
   :embeddable_text text
   :archived        false
   :legacy_input    {:model "dashboard" :id id}
   :metadata        {:title text}})

(def ^:private fixture-vectors
  "Unit-norm 4-D vectors for fixture text. Distances from `card-1` to each:
     card-1 → card-2 ≈ 0.01 (closest)
     card-1 → card-3 ≈ 0.05
     card-1 → card-4 ≈ 0.30
     card-1 → card-5 = 1.00 (orthogonal)"
  {"card-1" [1.00  0.00  0.0 0.0]
   "card-2" [0.99  0.141 0.0 0.0]
   "card-3" [0.95  0.31  0.0 0.0]
   "card-4" [0.84  0.55  0.0 0.0]
   "card-5" [0.0   1.00  0.0 0.0]
   ;; Dashboards live on a different axis so the cross-type filter is non-trivial.
   "dash-1" [0.0   0.0   1.0 0.0]
   "dash-2" [0.0   0.0   0.0 1.0]})

;; -- helper tests: behavior with no active index --------------------------
;; `try-active-index-state` is private; the var-quoted ref lets `with-redefs`
;; reach it and exercises the real helper bodies without standing up pgvector.

(deftest ^:sequential neighbors-of-nil-when-no-active-index-test
  (testing "returns nil — never throws — when no active pgvector index"
    (with-redefs [semantic.pgvector-api/try-active-index-state (constantly nil)]
      (is (nil? (semantic.core/neighbors-of "card" "1" 3))))))

(deftest ^:sequential indexed-row-count-zero-when-no-active-index-test
  (testing "returns 0 — never throws — when no active pgvector index"
    (with-redefs [semantic.pgvector-api/try-active-index-state (constantly nil)]
      (is (= 0 (semantic.core/indexed-row-count "card"))))))

(deftest ^:sequential reduce-indexed-ids-init-when-no-active-index-test
  (testing "returns init when no active pgvector index — no rf invocation"
    (with-redefs [semantic.pgvector-api/try-active-index-state (constantly nil)]
      (is (= ::sentinel
             (semantic.core/reduce-indexed-ids
              "card"
              (fn [_acc _row] (throw (ex-info "rf must not run" {})))
              ::sentinel))))))

;; -- helper + scorer tests: real pgvector --------------------------------

(defn- index-fixture-cards! []
  (semantic.tu/upsert-index!
   [(card-doc 1 "card-1")
    (card-doc 2 "card-2")
    (card-doc 3 "card-3")
    (card-doc 4 "card-4")
    (card-doc 5 "card-5")]))

(deftest ^:sequential neighbors-of-returns-top-k-by-distance-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (index-fixture-cards!)
          (testing "top-3 neighbors of card-1 are 2, 3, 4 in ascending distance"
            (let [results (semantic.core/neighbors-of "card" "1" 3 :target-model "card")
                  ids    (mapv :model_id results)
                  dists  (mapv :distance results)]
              (is (= ["2" "3" "4"] ids))
              (is (apply <= dists)
                  "results are sorted by ascending cosine distance"))))))))

(deftest ^:sequential neighbors-of-respects-target-model-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (semantic.tu/upsert-index!
           [(card-doc 1 "card-1")
            (card-doc 2 "card-2")
            (dashboard-doc 10 "dash-1")
            (dashboard-doc 11 "dash-2")])
          (testing "with :target-model \"card\" results are cards only"
            (let [results (semantic.core/neighbors-of "card" "1" 5 :target-model "card")]
              (is (every? #(= "card" (:model %)) results))))
          (testing "without :target-model dashboards may appear"
            (let [results (semantic.core/neighbors-of "card" "1" 5)
                  models  (set (map :model results))]
              (is (contains? models "dashboard")))))))))

(deftest ^:sequential neighbors-of-excludes-archived-by-default-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (semantic.tu/upsert-index!
           [(card-doc 1 "card-1")
            (card-doc 2 "card-2")
            (archived-card-doc 3 "card-3")])
          (testing "archived rows excluded by default"
            (let [results (semantic.core/neighbors-of "card" "1" 5 :target-model "card")
                  ids    (set (map :model_id results))]
              (is (contains? ids "2"))
              (is (not (contains? ids "3"))
                  "archived card-3 is filtered out")))
          (testing ":exclude-archived? false includes them"
            (let [results (semantic.core/neighbors-of "card" "1" 5
                                                      :target-model "card"
                                                      :exclude-archived? false)
                  ids    (set (map :model_id results))]
              (is (contains? ids "3")))))))))

(deftest ^:sequential neighbors-of-empty-when-seed-missing-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (index-fixture-cards!)
          (testing "missing seed id returns [] (not nil, not exception)"
            (is (= [] (semantic.core/neighbors-of "card" "999999" 3
                                                  :target-model "card")))))))))

(deftest ^:sequential indexed-row-count-counts-non-archived-by-default-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (semantic.tu/upsert-index!
           [(card-doc 1 "card-1")
            (card-doc 2 "card-2")
            (archived-card-doc 3 "card-3")
            (archived-card-doc 4 "card-4")])
          (testing "default excludes archived"
            (is (= 2 (semantic.core/indexed-row-count "card"))))
          (testing ":exclude-archived? false counts them"
            (is (= 4 (semantic.core/indexed-row-count "card"
                                                      :exclude-archived? false)))))))))

;; -- scorer tests: end-to-end through the runner --------------------------

(def ^:private permissive-density
  "Threshold low enough to pass with our 5-card fixture."
  {:min-indexed-cards 1})

(defn- run-with-permissive-density! [k]
  (with-redefs [title-desc-ebr/density-thresholds permissive-density
                title-desc-ebr/k-neighbors        k]
    (runner/run-view! :title-desc-ebr)))

(deftest ^:sequential scorer-emits-asymmetric-knn-edges-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (index-fixture-cards!)
          (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
            (let [result (run-with-permissive-density! 2)]
              (testing "runner reports OK (not skipped) and inserted edges"
                (is (= :ok (:status result)))
                (is (not (:skipped? result)))
                (is (pos? (:inserted result))))
              (testing "every edge is :card → :card"
                (let [edges (t2/select :model/SimilarEdge :view :title-desc-ebr)]
                  (is (every? #(= :card (:from_entity_type %)) edges))
                  (is (every? #(= :card (:to_entity_type %)) edges))))
              (testing "card 1's outbound neighbors are 2 and 3 (closest two)"
                (let [out (->> (t2/select :model/SimilarEdge
                                          :view :title-desc-ebr
                                          :from_entity_type :card
                                          :from_entity_id 1)
                               (sort-by :score >)
                               (mapv :to_entity_id))]
                  (is (= [2 3] out)))))))))))

(deftest ^:sequential scorer-score-equals-one-minus-distance-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (index-fixture-cards!)
          (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
            (run-with-permissive-density! 4)
            (testing "score = 1 - distance for each edge"
              (doseq [{:keys [score contributing_data]} (t2/select :model/SimilarEdge
                                                                   :view :title-desc-ebr)]
                (let [distance (-> contributing_data :metric :distance double)]
                  (is (< (Math/abs (- (double score) (- 1.0 distance))) 1e-9)))))))))))

(deftest ^:sequential scorer-contributing-data-shape-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (semantic.tu/with-test-db! {:mode :mock-initialized}
        (semantic.tu/with-mock-embeddings fixture-vectors
          (index-fixture-cards!)
          (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
            (run-with-permissive-density! 3)
            (testing "every edge carries source, embedding-model, and rank+distance"
              (doseq [{:keys [contributing_data]} (t2/select :model/SimilarEdge
                                                             :view :title-desc-ebr)]
                (is (= "semantic-index" (-> contributing_data :source name)))
                (is (some? (:embedding-model contributing_data)))
                (is (number? (-> contributing_data :metric :distance)))
                (is (number? (-> contributing_data :metric :rank)))))
            (testing "ranks per source are 1..K with no gaps"
              (let [edges-by-from (group-by :from_entity_id
                                            (t2/select :model/SimilarEdge
                                                       :view :title-desc-ebr))]
                (doseq [[_ edges] edges-by-from]
                  (let [ranks (sort (mapv #(-> % :contributing_data :metric :rank)
                                          edges))]
                    (is (= ranks (range 1 (inc (count ranks))))
                        (str "expected contiguous 1..K ranks, got " (vec ranks)))))))))))))

;; -- density-gate tests ---------------------------------------------------

(deftest ^:sequential density-gate-skips-when-no-active-index-test
  (testing "no active index → runner returns :ok :skipped? true, no edges inserted"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (with-redefs [semantic.core/active-embedding-model (constantly nil)]
        (let [result (runner/run-view! :title-desc-ebr)]
          (is (= :ok (:status result)))
          (is (true? (:skipped? result)))
          (is (= "no active semantic-search index" (:skip-reason result)))
          (is (zero? (:inserted result)))
          (is (zero? (t2/count :model/SimilarEdge :view :title-desc-ebr))))))))

(deftest ^:sequential density-gate-skips-when-too-few-rows-test
  (testing "indexed cards below min-indexed-cards → :ok :skipped?"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (with-redefs [semantic.core/active-embedding-model
                    (constantly {:provider "mock" :model-name "model"})
                    semantic.core/indexed-row-count
                    (constantly 3)
                    title-desc-ebr/density-thresholds
                    {:min-indexed-cards 100}]
        (let [result (runner/run-view! :title-desc-ebr)]
          (is (= :ok (:status result)))
          (is (true? (:skipped? result)))
          (is (= "active index has too few card rows" (:skip-reason result))))))))
