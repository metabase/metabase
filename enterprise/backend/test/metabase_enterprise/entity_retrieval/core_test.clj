(ns metabase-enterprise.entity-retrieval.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn- approx [target] #(< (abs (- (double %) (double target))) 1e-9))

(deftest score-shape-matches-regular-search-test
  (let [score (var-get #'entity-retrieval.core/score)]
    (testing "weighted-scorer breakdown: similarity factor + doc_type bump + total_score"
      (is (=? {:scores [{:name :similarity :score (approx 0.8) :weight 1.0 :contribution (approx 0.8)}
                        {:name :doc-type :score 1.0 :weight (approx 0.02) :contribution (approx 0.02)}]
               :total_score (approx 0.82)}
              (score {:distance 0.2 :doc_type "name"}))))
    (testing "the doc_type bump favors name over synonym, and is zero for unweighted types"
      (is (> (:total_score (score {:distance 0.2 :doc_type "name"}))
             (:total_score (score {:distance 0.2 :doc_type "synonym"}))))
      (is (=? {:total_score (approx 0.8)} (score {:distance 0.2 :doc_type "example"}))))
    (testing "a nearer document (smaller distance) scores strictly higher"
      (is (> (:total_score (score {:distance 0.1 :doc_type "name"}))
             (:total_score (score {:distance 0.5 :doc_type "name"})))))))

(deftest dispatch-without-pgvector-test
  (testing "with the feature enabled but pgvector unconfigured, the EE impls degrade gracefully"
    ;; Pin db-url to nil so the result is deterministic regardless of any ambient MB_PGVECTOR_DB_URL:
    ;; available? is false, so search returns [] and the sync nudge no-ops rather than throwing.
    (mt/with-premium-features #{:semantic-search}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (= [] (mirror/search "anything" 10)))
        (is (nil? (mirror/request-sync!)))))))

(deftest request-sync-triggers-the-job-test
  (testing "when the index is available, the nudge fires trigger-now! on the sync job — and nothing else"
    (mt/with-premium-features #{:semantic-search}
      ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required here.
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (let [triggered (atom [])]
          (mt/with-dynamic-fn-redefs [task/trigger-now! (fn [job-key] (swap! triggered conj job-key))]
            (mirror/request-sync!)
            (is (= [entity-retrieval.core/sync-job-key] @triggered))))))))

(deftest pgvector-configured-decoupled-from-feature-test
  (testing "scheduling gates on pgvector config, independent of the feature flag, so a license enabled after boot still gets the periodic sync"
    ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required here.
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
      (mt/with-premium-features #{}
        (is (true? (entity-retrieval.core/pgvector-configured?)))
        (is (false? (entity-retrieval.core/available?))))
      (mt/with-premium-features #{:semantic-search}
        (is (true? (entity-retrieval.core/available?)))))))

(deftest ^:sequential ranks-by-similarity-test
  (testing "search ranks library documents by cosine similarity, nearest first"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :semantic-search}
        (let [suffix (System/nanoTime)
              ds     (semantic.db.datasource/ensure-initialized-data-source!)
              q      "the query"]
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix)
                      index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix)]
              ;; the two tables' name docs embed "near"/"far"; q ties "near" exactly and is orthogonal to "far".
              (semantic.tu/with-mock-embeddings {q      [1.0 0.0 0.0 0.0]
                                                 "near" [1.0 0.0 0.0 0.0]
                                                 "far"  [0.0 1.0 0.0 0.0]}
                (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                               :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                               :model/Database   {db-id :id}    {}
                               :model/Table      {near-id :id}  {:db_id db-id :collection_id data-id :is_published true
                                                                 :active true :name "near" :display_name "near"}
                               :model/Table      {far-id :id}   {:db_id db-id :collection_id data-id :is_published true
                                                                 :active true :name "far" :display_name "far"}]
                  (try
                    (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                    (testing "the nearer table ranks first; each hit carries the entity ref + matched doc"
                      (is (=? [{:entity {:model "table" :id near-id} :doc_type "name" :doc_text "near"}
                               {:entity {:model "table" :id far-id}}]
                              (mirror/search q 10))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(defn- put-ai-context!
  "POST an ai_context entry through the CRUD API; returns the created row's id."
  [entity-type entity-local-id ai-context]
  (:id (mt/user-http-request :crowberto :post 200 "osi/ai-context/"
                             {:entity_type entity-type :entity_local_id entity-local-id :ai_context ai-context})))

(deftest ^:sequential crud-api-to-tool-end-to-end-test
  (testing "CRUD API write -> reconcile -> pgvector -> retrieve_library_entities tool, end to end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this; locally with the
    ;; dev pgvector running it exercises the whole pipeline. Uses the mock embedding model (4-dim,
    ;; deterministic, no network) against isolated temp tables, with the reconciler run directly in
    ;; place of the background Quartz job.
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :semantic-search}
        (let [suffix  (System/nanoTime)
              ds      (semantic.db.datasource/ensure-initialized-data-source!)
              q       "monthly revenue per region"
              synonym "revenue per region"
              ;; bind a user: the tool's hydration permission-filters via mi/can-read?, which needs
              ;; *current-user-id* (a superuser can read the test tables).
              search! #(mt/with-test-user :crowberto
                         (get-in (tools.entity-retrieval/retrieve-library-entities-tool {:user_search_prompt q})
                                 [:structured-output :data]))]
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix)
                      index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix)]
              ;; the curated synonym ties the query exactly; the table's own name "orders" is orthogonal.
              (semantic.tu/with-mock-embeddings {q       [1.0 0.0 0.0 0.0]
                                                 synonym [1.0 0.0 0.0 0.0]
                                                 "orders" [0.0 1.0 0.0 0.0]}
                (mt/with-temp [:model/Collection {lib-id :id}   {:type "library" :location "/"}
                               :model/Collection {data-id :id}  {:type "library-data" :location (str "/" lib-id "/")}
                               :model/Database   {db-id :id}     {}
                               :model/Table      {table-id :id}  {:db_id db-id :collection_id data-id :is_published true
                                                                  :active true :name "orders" :display_name "orders"}]
                  (try
                    (let [cse-id (put-ai-context! "table" table-id
                                                  {:instructions "Group by month." :synonyms [synonym]})]
                      (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                      (testing "the tool returns the table, matched on the curated synonym, with usage_instructions"
                        (is (=? [{:type "table" :id table-id :matched_doc_type "synonym" :matched_text synonym
                                  :usage_instructions "Group by month." :similarity (approx 1.0)}]
                                (search!))))
                      (testing "deleting the ai_context via the CRUD API + reconcile drops the synonym doc"
                        (mt/user-http-request :crowberto :delete 204 (str "osi/ai-context/" cse-id))
                        (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                        (is (empty? (jdbc/execute! ds [(format "SELECT 1 FROM \"%s\" WHERE doc_type = 'synonym' AND entity_local_id = %d"
                                                               index-table/*vectors-table* table-id)])))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(deftest ^:sequential doc-type-boost-breaks-ties-test
  (testing "on a distance tie, a name match outranks a synonym match (blended ORDER BY, not raw NN)"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :semantic-search}
        (let [suffix  (System/nanoTime)
              ds      (semantic.db.datasource/ensure-initialized-data-source!)
              q       "the query"
              synonym "a curated synonym"]
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix)
                      index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix)]
              ;; alpha's name and beta's curated synonym both tie the query exactly; beta's name is orthogonal.
              (semantic.tu/with-mock-embeddings {q       [1.0 0.0 0.0 0.0]
                                                 "alpha" [1.0 0.0 0.0 0.0]
                                                 synonym [1.0 0.0 0.0 0.0]
                                                 "beta"  [0.0 1.0 0.0 0.0]}
                (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                               :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                               :model/Database   {db-id :id}    {}
                               :model/Table      {alpha :id}    {:db_id db-id :collection_id data-id :is_published true
                                                                 :active true :name "alpha" :display_name "alpha"}
                               :model/Table      {beta :id}     {:db_id db-id :collection_id data-id :is_published true
                                                                 :active true :name "beta" :display_name "beta"}]
                  (try
                    (put-ai-context! "table" beta {:synonyms [synonym]})
                    (reconcile/reconcile! ds semantic.tu/mock-embedding-model)
                    ;; raw NN would tie both at distance 0; the 0.02 vs 0.01 doc_type bump puts alpha's name first.
                    (is (= [[alpha "name"] [beta "synonym"]]
                           (mapv (juxt (comp :id :entity) :doc_type) (take 2 (mirror/search q 10)))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))
