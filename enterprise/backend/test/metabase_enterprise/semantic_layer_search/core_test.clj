(ns metabase-enterprise.semantic-layer-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-layer-search.core :as semantic-layer-search.core]
   [metabase-enterprise.semantic-layer-search.index-table :as index-table]
   [metabase-enterprise.semantic-layer-search.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.metabot.tools.semantic-layer-search :as tools.semantic-layer-search]
   [metabase.semantic-layer-search.mirror :as mirror]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn- approx [target] #(< (abs (- (double %) (double target))) 1e-9))

(deftest score-shape-matches-regular-search-test
  (let [score (var-get #'semantic-layer-search.core/score)]
    (testing "weighted-scorer breakdown: per-factor {name score weight contribution} + total_score"
      (is (=? {:scores [{:name :similarity :score (approx 0.8) :weight 1.0  :contribution (approx 0.8)}
                        {:name :canonical  :score 1.0          :weight 0.15 :contribution (approx 0.15)}
                        {:name :verified   :score 0.0          :weight 0.1  :contribution 0.0}]
               :total_score (approx 0.95)}
              (score {:distance 0.2 :canonical true :verified false}))))
    (testing "verified-only and canonical+verified totals apply the right weights"
      (is (=? {:total_score (approx 0.9)}  (score {:distance 0.2 :canonical false :verified true})))
      (is (=? {:total_score (approx 1.05)} (score {:distance 0.2 :canonical true  :verified true})))
      (is (=? {:total_score (approx 0.8)}  (score {:distance 0.2 :canonical false :verified false}))))
    (testing "total_score = sum of contributions, and boosts strictly increase it"
      (let [s (score {:distance 0.2 :canonical true :verified true})]
        (is (=? (approx (reduce + (map :contribution (:scores s)))) (:total_score s))))
      (is (> (:total_score (score {:distance 0.2 :canonical true :verified true}))
             (:total_score (score {:distance 0.2 :canonical true :verified false}))
             (:total_score (score {:distance 0.2 :canonical false :verified false})))))))

(deftest dispatch-without-pgvector-test
  (testing "with the feature enabled but pgvector unconfigured, the EE impls degrade gracefully"
    ;; Pin db-url to nil so the result is deterministic regardless of any ambient MB_PGVECTOR_DB_URL:
    ;; available? is false, so search returns [] and the sync nudge no-ops rather than throwing.
    (mt/with-premium-features #{:semantic-search}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (= [] (mirror/search "anything" 10)))
        (is (nil? (mirror/request-sync!)))))))

(deftest request-sync-triggers-the-job-test
  (testing "when the mirror is available, the nudge fires trigger-now! on the sync job — and nothing else"
    (mt/with-premium-features #{:semantic-search}
      ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required here.
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (let [triggered (atom [])]
          (mt/with-dynamic-fn-redefs [task/trigger-now! (fn [job-key] (swap! triggered conj job-key))]
            (mirror/request-sync!)
            (is (= [semantic-layer-search.core/sync-job-key] @triggered))))))))

(defn- create-entry!
  "POST an entry through the CRUD API; returns the created row's id."
  [search-prompt type entities verified]
  (:id (mt/user-http-request :crowberto :post 200 "semantic-layer-search/"
                             {:search_prompt search-prompt :type type
                              :entities entities :verified verified})))

(deftest ^:sequential crud-api-to-tool-end-to-end-test
  (testing "CRUD API write -> reconcile -> pgvector -> semantic_layer_search tool, end to end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this; locally with the
    ;; dev pgvector running it exercises the whole pipeline. Uses the mock embedding model (4-dim,
    ;; deterministic, no network) against isolated temp tables, with the reconciler run directly in
    ;; place of the background Quartz job.
    (when semantic.db.datasource/db-url
      (let [suffix    (System/nanoTime)
            ds        (semantic.db.datasource/ensure-initialized-data-source!)
            ent-1     [{:model "table" :id (mt/id :orders)}]
            ent-2     [{:model "table" :id (mt/id :people)}]
            ent-3     [{:model "table" :id (mt/id :products)}]
            ;; All prompts + the query embed to the same vector, so cosine distance ties and the
            ;; canonical (0.15) > verified (0.10) > plain (0.0) boosts alone decide the ranking.
            vec1      [1.0 0.0 0.0 0.0]
            p-canon   "revenue by region (canonical)"
            p-verif   "revenue by region (verified)"
            p-plain   "revenue by region (plain)"
            q         "monthly revenue per region"
            search!   #(get-in (tools.semantic-layer-search/semantic-layer-search-tool
                                {:user_search_prompt q})
                               [:structured-output :data])]
        (mt/with-premium-features #{:semantic-search}
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "semantic_layer_index_vectors_test_" suffix)
                      index-table/*meta-table*    (str "semantic_layer_index_meta_test_" suffix)]
              (semantic.tu/with-mock-embeddings {p-canon vec1 p-verif vec1 p-plain vec1 q vec1}
                (try
                  (let [id-canon  (create-entry! p-canon "canonical" ent-1 false)
                        id-verif  (create-entry! p-verif "sources" ent-2 true)
                        id-plain  (create-entry! p-plain "sources" ent-3 false)
                        _         (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                        results   (search!)]
                    (testing "all three distinct entities mirrored and returned, ranked by boost"
                      (is (= [p-canon p-verif p-plain] (mapv :saved_search_prompt results))))
                    (testing "data is flat per-entity hydrated records; total_score reflects the boosts, similarity=1.0 (vectors tie)"
                      (is (=? [{:type "table" :id (mt/id :orders)   :canonical true  :similarity (approx 1.0)
                                :score {:total_score (approx 1.15)}}
                               {:type "table" :id (mt/id :people)   :canonical false :similarity (approx 1.0)
                                :score {:total_score (approx 1.1)}}
                               {:type "table" :id (mt/id :products) :canonical false :similarity (approx 1.0)
                                :score {:total_score (approx 1.0)}}]
                              results)))
                    (testing "deleting via the CRUD API + reconcile removes the row from search results"
                      (mt/user-http-request :crowberto :delete 204 (str "semantic-layer-search/" id-canon))
                      (is (=? {:deleted 1} (reconcile/reconcile! ds semantic.tu/mock-embedding-model)))
                      (is (= [p-verif p-plain] (mapv :saved_search_prompt (search!)))))
                    ;; clean up the appdb rows we created
                    (doseq [id [id-verif id-plain]]
                      (mt/user-http-request :crowberto :delete 204 (str "semantic-layer-search/" id))))
                  (finally
                    (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                            index-table/*vectors-table* ", "
                                            index-table/*meta-table*)])))))))))))
