(ns metabase-enterprise.similarity.graph.runner-test
  "DB-backed lifecycle tests for the graph runner.

   Tests that exercise the edge-loader's CTE chain are gated on `(= :postgres
   (mdb/db-type))` (same H2 caveat as `views/ensemble.clj`). Tests that don't
   touch the loader (empty-graph, scope-isolation, failure-path) run on H2."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.similarity.graph.pagerank :as graph-pagerank]
   [metabase-enterprise.similarity.graph.runner :as graph-runner]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- seed-ensemble!
  [{:keys [from-id to-id score]}]
  (t2/insert! :model/SimilarEdge
              {:from_entity_type :card
               :from_entity_id   from-id
               :to_entity_type   :card
               :to_entity_id     to-id
               :view             :ensemble
               :score            (double score)
               :last_computed_at (t/offset-date-time)}))

(deftest ^:sequential unknown-job-throws-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Unknown graph job"
                        (graph-runner/run-job! :no-such-job-xyz))))

(deftest ^:sequential empty-graph-returns-ok-with-zero-inserts-test
  (testing "no ensemble rows → :pagerank-card runs cleanly with :inserted 0"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus
                            :model/SimilarityPagerank]
      (let [{:keys [status inserted]} (graph-runner/run-job! :pagerank-card)]
        (is (= :ok status))
        (is (zero? inserted)))
      (let [row (t2/select-one :model/SimilarEdgeStatus :view :pagerank-card)]
        (is (= :ok (:status row)))
        (is (some? (:last_full_run_at row)))))))

(deftest ^:sequential scope-isolation-test
  (testing "running :pagerank-card does not delete :pagerank-full rows"
    (mt/with-model-cleanup [:model/SimilarityPagerank :model/SimilarEdgeStatus]
      (t2/insert! :model/SimilarityPagerank
                  {:scope       "full"
                   :entity_type :card
                   :entity_id   42
                   :score       0.123
                   :rank        1
                   :computed_at (t/offset-date-time)})
      (graph-runner/run-job! :pagerank-card)
      (is (t2/exists? :model/SimilarityPagerank
                      :scope "full" :entity_id 42)))))

(deftest ^:sequential failure-records-error-test
  (testing "exceptions inside compute leave status :error with a truncated message"
    (mt/with-model-cleanup [:model/SimilarEdgeStatus :model/SimilarityPagerank]
      (with-redefs [graph-pagerank/pagerank
                    (fn [& _] (throw (ex-info "intentional failure" {:reason :test})))]
        (let [result (graph-runner/run-job! :pagerank-card)]
          (is (= :error (:status result)))
          (is (re-find #"intentional failure" (:error result))))
        (let [row (t2/select-one :model/SimilarEdgeStatus :view :pagerank-card)]
          (is (= :error (:status row)))
          (is (re-find #"intentional failure" (:last_error row))))))))

(deftest ^:sequential pagerank-card-happy-path-test
  (when (= :postgres (mdb/db-type))
    (testing "ensemble fixture → :pagerank-card produces expected node count and ranks"
      (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus
                              :model/SimilarityPagerank]
        ;; A tiny triangle plus an outlier
        (doseq [[from to score] [[1 2 0.9] [2 1 0.9]
                                 [2 3 0.8] [3 2 0.8]
                                 [1 3 0.7] [3 1 0.7]
                                 [4 1 0.05]]]
          (seed-ensemble! {:from-id from :to-id to :score score}))
        (let [{:keys [status inserted converged?]} (graph-runner/run-job! :pagerank-card)]
          (is (= :ok status))
          (is (= 4 inserted))
          (is (true? converged?)))
        (let [rows (t2/select :model/SimilarityPagerank :scope :card
                              {:order-by [[:rank :asc]]})]
          (is (= [1 2 3 4] (sort (mapv :rank rows))))
          (is (every? #(= :card (:entity_type %)) rows))
          (is (every? pos? (mapv :score rows))))))))

(deftest ^:sequential louvain-card-happy-path-test
  (when (= :postgres (mdb/db-type))
    (testing "two strongly-connected triangles → 2 communities, centrality populated"
      (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus
                              :model/SimilarityCommunity]
        ;; Cluster A: cards 1-3
        (doseq [[from to] [[1 2] [2 1] [1 3] [3 1] [2 3] [3 2]]]
          (seed-ensemble! {:from-id from :to-id to :score 0.5}))
        ;; Cluster B: cards 4-6
        (doseq [[from to] [[4 5] [5 4] [4 6] [6 4] [5 6] [6 5]]]
          (seed-ensemble! {:from-id from :to-id to :score 0.5}))
        (let [{:keys [status inserted n-communities]}
              (graph-runner/run-job! :louvain-card)]
          (is (= :ok status))
          (is (= 6 inserted))
          (is (= 2 n-communities)))
        (let [rows (t2/select :model/SimilarityCommunity :scope :card)]
          (is (every? #(some? (:centrality %)) rows))
          (is (every? #(<= 0.0 (:centrality %) 1.0) rows)))))))

(deftest ^:sequential idempotent-rerun-test
  (when (= :postgres (mdb/db-type))
    (testing "two consecutive run-job! calls produce same row count + scores"
      (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus
                              :model/SimilarityPagerank]
        (doseq [[from to score] [[1 2 0.9] [2 1 0.9] [2 3 0.5] [3 2 0.5]]]
          (seed-ensemble! {:from-id from :to-id to :score score}))
        (graph-runner/run-job! :pagerank-card)
        (let [first-rows (t2/select :model/SimilarityPagerank :scope :card
                                    {:order-by [[:rank :asc]]})]
          (graph-runner/run-job! :pagerank-card)
          (let [second-rows (t2/select :model/SimilarityPagerank :scope :card
                                       {:order-by [[:rank :asc]]})]
            (is (= (mapv :entity_id first-rows) (mapv :entity_id second-rows)))
            (is (= (mapv :rank first-rows) (mapv :rank second-rows)))
            (is (= (mapv #(double (:score %)) first-rows)
                   (mapv #(double (:score %)) second-rows)))))))))

(deftest ^:sequential run-all-pr-before-louvain-test
  (testing "run-all! returns 7 results: 4 pageranks then 3 louvains"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus
                            :model/SimilarityPagerank :model/SimilarityCommunity]
      (let [results (graph-runner/run-all!)
            jobs    (mapv :job results)]
        (is (= 7 (count results)))
        (is (every? #(= :ok (:status %)) results))
        (let [pr-jobs  (take-while #(re-find #"^pagerank" (name %)) jobs)
              lv-jobs  (drop-while #(re-find #"^pagerank" (name %)) jobs)]
          (is (= 4 (count pr-jobs)))
          (is (= 3 (count lv-jobs)))
          (is (every? #(re-find #"^louvain" (name %)) lv-jobs)))))))
