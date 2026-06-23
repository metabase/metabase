(ns metabase-enterprise.curated-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.curated-search.core :as curated-search.core]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.curated-search.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.curated-search.mirror :as mirror]
   [metabase.metabot.tools.curated-search :as tools.curated-search]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn- approx [target] #(< (abs (- (double %) (double target))) 1e-9))

(deftest score-shape-matches-regular-search-test
  (let [score (var-get #'curated-search.core/score)]
    (testing "weighted-scorer breakdown: per-factor {name score weight contribution} + total_score"
      (is (=? {:scores [{:name :similarity :score (approx 0.8) :weight 1.0 :contribution (approx 0.8)}
                        {:name :verified   :score 0.0          :weight 0.1 :contribution 0.0}]
               :total_score (approx 0.8)}
              (score {:distance 0.2 :verified false}))))
    (testing "the verified boost applies its weight and strictly increases the total"
      (is (=? {:total_score (approx 0.9)} (score {:distance 0.2 :verified true})))
      (let [s (score {:distance 0.2 :verified true})]
        (is (=? (approx (reduce + (map :contribution (:scores s)))) (:total_score s))))
      (is (> (:total_score (score {:distance 0.2 :verified true}))
             (:total_score (score {:distance 0.2 :verified false})))))))

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
            (is (= [curated-search.core/sync-job-key] @triggered))))))))

(deftest pgvector-configured-decoupled-from-feature-test
  (testing "scheduling gates on pgvector config, independent of the feature flag, so a license enabled after boot still gets the periodic sync"
    ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required here.
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
      (mt/with-premium-features #{}
        (is (true? (curated-search.core/pgvector-configured?)))
        (is (false? (curated-search.core/available?))))
      (mt/with-premium-features #{:semantic-search}
        (is (true? (curated-search.core/available?)))))))

(deftest ^:sequential verified-boost-applies-before-limit-test
  (testing "the SQL LIMIT ranks by blended score: a verified row slightly farther by raw distance still wins top-1"
    (when semantic.db.datasource/db-url
      (let [suffix  (System/nanoTime)
            ds      (semantic.db.datasource/ensure-initialized-data-source!)
            p-verif "verified entry"
            p-plain "plain entry"
            q       "the query"]
        (mt/with-premium-features #{:semantic-search}
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "curated_search_index_test_" suffix)
                      index-table/*meta-table*    (str "curated_search_index_meta_test_" suffix)]
              ;; plain ties the query exactly (distance 0); verified sits at distance ~0.006, within its
              ;; 0.1 boost. A raw-distance LIMIT 1 would keep only the plain row.
              (semantic.tu/with-mock-embeddings {q       [1.0 0.0 0.0 0.0]
                                                 p-plain [1.0 0.0 0.0 0.0]
                                                 p-verif [0.9 0.1 0.0 0.0]}
                (mt/with-temp [:model/CuratedSearchEntry _
                               {:search_prompt p-plain :entity {:model "table" :id 1}}
                               :model/CuratedSearchEntry _
                               {:search_prompt p-verif :verified true :entity {:model "table" :id 2}}]
                  (try
                    (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                    (is (= [p-verif] (mapv :saved_search_prompt (mirror/search q 1))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(defn- create-entry!
  "POST an entry through the CRUD API; returns the created row's id."
  [search-prompt entity verified]
  (:id (mt/user-http-request :crowberto :post 200 "curated-search/"
                             {:search_prompt search-prompt :entity entity :verified verified})))

(deftest ^:sequential crud-api-to-tool-end-to-end-test
  (testing "CRUD API write -> reconcile -> pgvector -> search_curated tool, end to end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this; locally with the
    ;; dev pgvector running it exercises the whole pipeline. Uses the mock embedding model (4-dim,
    ;; deterministic, no network) against isolated temp tables, with the reconciler run directly in
    ;; place of the background Quartz job.
    (when semantic.db.datasource/db-url
      (let [suffix    (System/nanoTime)
            ds        (semantic.db.datasource/ensure-initialized-data-source!)
            ent-1     {:model "table" :id (mt/id :orders)}
            ent-2     {:model "table" :id (mt/id :people)}
            ;; Both prompts + the query embed to the same vector, so cosine distance ties and the
            ;; verified boost (0.10) alone decides the ranking.
            vec1      [1.0 0.0 0.0 0.0]
            p-verif   "revenue by region (verified)"
            p-plain   "revenue by region (plain)"
            q         "monthly revenue per region"
            ;; bind a user: the tool's hydration permission-filters via mi/can-read?, which needs
            ;; *current-user-id* (a superuser can read the test tables).
            search!   #(mt/with-test-user :crowberto
                         (get-in (tools.curated-search/curated-search-tool
                                  {:user_search_prompt q})
                                 [:structured-output :data]))]
        (mt/with-premium-features #{:semantic-search}
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "curated_search_index_test_" suffix)
                      index-table/*meta-table*    (str "curated_search_index_meta_test_" suffix)]
              (semantic.tu/with-mock-embeddings {p-verif vec1 p-plain vec1 q vec1}
                (try
                  (let [id-verif (create-entry! p-verif ent-1 true)
                        id-plain (create-entry! p-plain ent-2 false)
                        _        (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                        results  (search!)]
                    (testing "both distinct entities mirrored and returned, the verified one boosted first"
                      (is (= [p-verif p-plain] (mapv :saved_search_prompt results))))
                    (testing "data is per-entity hydrated records; total_score reflects the boost, similarity=1.0 (vectors tie)"
                      (is (=? [{:type "table" :id (mt/id :orders) :similarity (approx 1.0)
                                :score {:total_score (approx 1.1)}}
                               {:type "table" :id (mt/id :people) :similarity (approx 1.0)
                                :score {:total_score (approx 1.0)}}]
                              results)))
                    (testing "deleting via the CRUD API + reconcile removes the row from search results"
                      (mt/user-http-request :crowberto :delete 204 (str "curated-search/" id-verif))
                      (is (=? {:deleted 1} (reconcile/reconcile! ds semantic.tu/mock-embedding-model)))
                      (is (= [p-plain] (mapv :saved_search_prompt (search!)))))
                    ;; clean up the appdb rows we created
                    (mt/user-http-request :crowberto :delete 204 (str "curated-search/" id-plain)))
                  (finally
                    (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                            index-table/*vectors-table* ", "
                                            index-table/*meta-table*)])))))))))))
