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
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

;; the dedicated-harness tests below hit the app db before any auto-initializing mt helper — on the
;; appdb-mode CI job this namespace can be an early db touch in a fresh JVM
(use-fixtures :once (fixtures/initialize :db :test-users))

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

(deftest search-degrades-when-configured-model-cannot-be-resolved-test
  (mt/with-premium-features #{:library-retrieval}
    (with-redefs [entity-retrieval.core/available?                        (constantly true)
                  semantic.db.datasource/ensure-initialized-data-source! (constantly ::datasource)
                  semantic.embedding/get-configured-model                (constantly semantic.tu/mock-embedding-model)
                  semantic.embedding/resolve-model                       (fn [_]
                                                                           (throw (ex-info "model changed"
                                                                                           {:type ::model-changed})))
                  index-table/index-compatible?                           (fn [& _]
                                                                            (throw (ex-info "must not inspect index" {})))
                  semantic.embedding/get-embedding                        (fn [& _]
                                                                            (throw (ex-info "must not embed" {})))
                  jdbc/execute!                                           (fn [& _]
                                                                            (throw (ex-info "must not query" {})))]
      (is (= [] (entity-retrieval.core/search "the query" 10))))))

(deftest dispatch-without-pgvector-test
  (testing "with the feature enabled but pgvector unconfigured, the EE impls degrade gracefully"
    ;; Pin db-url to nil so the result is deterministic regardless of any ambient MB_PGVECTOR_DB_URL:
    ;; entity retrieval is dedicated-only, so no URL means available? is false, search returns [] and the
    ;; write-path nudge no-ops rather than throwing.
    (mt/with-premium-features #{:library :library-retrieval}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (= [] (mirror/search "anything" 10)))
        (is (nil? (mirror/request-entity-sync! "table" 1)))))))

(deftest targeted-drain-reconciles-each-dirty-entity-test
  (testing "a targeted run snapshots and clears the dirty set, reconciling each entity once"
    (let [dirty           @#'entity-retrieval.core/dirty-entities
          do-targeted-run (var-get #'entity-retrieval.core/do-targeted-run)
          reconciled      (atom [])]
      (reset! dirty #{["table" 7] ["metric" 9]})
      (mt/with-dynamic-fn-redefs
        [semantic.db.datasource/ensure-initialized-data-source! (constantly ::ds)
         semantic.embedding/get-configured-model                (constantly semantic.tu/mock-embedding-model)
         reconcile/reconcile-entity!                            (fn [_ds _model entity-type entity-local-id]
                                                                  (swap! reconciled conj [entity-type entity-local-id])
                                                                  {:inserted 1 :deleted 0 :unchanged 0})]
        (do-targeted-run nil)
        (is (= #{["table" 7] ["metric" 9]} (set @reconciled)))
        (is (empty? @dirty) "the dirty set is cleared at the run's start")))))

(deftest request-entity-sync-is-fire-and-forget-test
  (testing "request-entity-sync! returns nil without throwing on the calling thread, even if the reconcile fails"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (let [tc    @#'entity-retrieval.core/targeted-current
              tn    @#'entity-retrieval.core/targeted-next
              dirty @#'entity-retrieval.core/dirty-entities]
          (reset! tc nil) (reset! tn nil) (reset! dirty #{})
          (mt/with-dynamic-fn-redefs
            [semantic.db.datasource/ensure-initialized-data-source! (constantly ::ds)
             semantic.embedding/get-configured-model                (constantly semantic.tu/mock-embedding-model)
             reconcile/reconcile-entity!                            (fn [& _] (throw (ex-info "boom" {})))]
            (is (nil? (entity-retrieval.core/request-entity-sync! "table" 1)))
            ;; let the fire-and-forget drain settle so its logged error doesn't bleed into later tests
            (when-let [f @tc] (deref f 5000 nil))
            (reset! tc nil) (reset! tn nil) (reset! dirty #{})))))))

(deftest force-reconcile-coalescing-test
  (testing "force-reconcile! never joins the in-flight run, queues one shared follow-up, and reports index + timing"
    (mt/with-premium-features #{:library :library-retrieval}
      ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required here.
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (let [current @#'entity-retrieval.core/full-current
              nxt     @#'entity-retrieval.core/full-next
              calls   (atom 0)]
          (mt/with-dynamic-fn-redefs
            [semantic.db.datasource/ensure-initialized-data-source! (constantly ::ds)
             semantic.embedding/get-configured-model                (constantly semantic.tu/mock-embedding-model)
             reconcile/reconcile!                                   (fn [_ds _resolve-model]
                                                                      (swap! calls inc)
                                                                      {:inserted 3 :deleted 1 :unchanged 2})]
            (testing "idle: the caller starts the run, gets its index diff + timing, and the schedule clears"
              (reset! current nil) (reset! nxt nil) (reset! calls 0)
              (is (=? {:index     {:inserted 3 :deleted 1 :unchanged 2}
                       :execution {:waited_ms int? :ran_ms int?}}
                      (entity-retrieval.core/force-reconcile!)))
              (is (= 1 @calls))
              (is (nil? @current)) (is (nil? @nxt)))
            (testing "a run in flight: the caller queues a fresh follow-up instead of reusing the in-flight run"
              ;; a completed future stands in for the in-flight run — the caller must still run a fresh pass.
              (reset! current (future {:index {} :execution {}})) (reset! nxt nil) (reset! calls 0)
              (is (=? {:index {:inserted 3 :deleted 1 :unchanged 2}}
                      (entity-retrieval.core/force-reconcile!)))
              (is (= 1 @calls) "a fresh reconcile ran; the in-flight run's result was not reused"))
            (testing "a follow-up already queued: further callers coalesce onto it (no extra run)"
              (reset! current (future {:index {} :execution {}}))
              (reset! nxt (future {:index {:inserted 7 :deleted 0 :unchanged 0} :execution {:waited_ms 5 :ran_ms 9}}))
              (reset! calls 0)
              (is (=? {:index     {:inserted 7 :deleted 0 :unchanged 0}
                       :execution {:waited_ms 5 :ran_ms 9}}
                      (entity-retrieval.core/force-reconcile!)))
              (is (zero? @calls) "joined the queued follow-up; no new reconcile")
              (reset! current nil) (reset! nxt nil))))))))

(deftest force-reconcile-unavailable-returns-nil-test
  (testing "force-reconcile! is nil (so the API can 400) when pgvector isn't configured"
    (mt/with-premium-features #{:library :library-retrieval}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (nil? (entity-retrieval.core/force-reconcile!)))))))

(deftest available?-gates-test
  (testing "available? requires pgvector + :library + :library-retrieval + a configured embedder; each gate alone is decisive"
    ;; The mock model's provider is "mock" -> embedding-supported? true, so these cases isolate the other gates.
    ;; db-url is read directly as a var, so with-redefs (not with-dynamic-fn-redefs) is required for it.
    (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model (constantly semantic.tu/mock-embedding-model)]
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (mt/with-premium-features #{}
          (is (true?  (entity-retrieval.core/pgvector-configured?))
              "scheduling gates on pgvector config, not the license, so a post-boot license still syncs")
          (is (false? (entity-retrieval.core/available?))))
        (mt/with-premium-features #{:library-retrieval}
          (is (false? (entity-retrieval.core/available?))
              ":library-retrieval alone is not enough — retrieval also requires the :library feature"))
        (mt/with-premium-features #{:library}
          (is (false? (entity-retrieval.core/available?))
              ":library without :library-retrieval does not entitle the tool"))
        (mt/with-premium-features #{:library :library-retrieval}
          (is (true? (entity-retrieval.core/available?)))))
      ;; no URL -> unconfigured and unavailable regardless of license, even on a pgvector-capable
      ;; Postgres app db: entity retrieval's tables aren't schema-isolated yet, so it stays dedicated-only
      (with-redefs [semantic.db.datasource/db-url nil]
        (mt/with-premium-features #{:library :library-retrieval}
          (is (false? (entity-retrieval.core/pgvector-configured?)))
          (is (false? (entity-retrieval.core/available?))))))
    (testing "fully licensed + pgvector, but no way to compute embeddings -> unavailable"
      (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://stub"]
        (mt/with-premium-features #{:library :library-retrieval}
          ;; an unrecognized provider hits embedding-supported?'s :default (false)
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model (constantly {:provider "no-embedder"})]
            (is (false? (entity-retrieval.core/available?)))))))))

(deftest ^:sequential entity-retrieval-available?-requires-a-populated-index-test
  (testing "the curated tool is offered only once the index has documents (else the nlq profile falls back)"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :library-retrieval}
        (let [suffix (System/nanoTime)
              ds     (semantic.db.datasource/ensure-initialized-data-source!)]
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix)
                      index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix)]
              (try
                (testing "configured + licensed but no index table yet -> unavailable"
                  (is (true?  (entity-retrieval.core/available?)))
                  (is (false? (entity-retrieval.core/entity-retrieval-available?))))
                (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                               :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                               :model/Database   {db-id :id}    {}
                               :model/Table      _              {:db_id db-id :collection_id data-id :is_published true
                                                                 :active true :name "t" :display_name "T"}]
                  (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                  (testing "after a reconcile populates the index -> available"
                    (is (true? (entity-retrieval.core/entity-retrieval-available?))))
                  (testing "but a configured model that no longer matches the built index -> unavailable"
                    ;; e.g. an embedding-dimension change before the rebuild reconcile runs: querying the
                    ;; stale index would degrade to empty, so the tool must not be offered.
                    (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                                (constantly (assoc semantic.tu/mock-embedding-model
                                                                   :vector-dimensions 8))]
                      (is (false? (entity-retrieval.core/entity-retrieval-available?))))))
                (finally
                  (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                          index-table/*vectors-table* ", "
                                          index-table/*meta-table*)]))))))))))

(deftest ^:sequential ranks-by-similarity-test
  (testing "search ranks library documents by cosine similarity, nearest first"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :library-retrieval}
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
                    (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                    (testing "the nearer table ranks first; each hit carries the entity ref + matched doc"
                      (is (=? [{:entity {:model "table" :id near-id} :doc_type "name" :doc_text "near"}
                               {:entity {:model "table" :id far-id}}]
                              (mirror/search q 10))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(defn- put-ai-context!
  "PUT an ai_context entry through the CRUD API."
  [entity-type entity-local-id ai-context]
  (mt/user-http-request :crowberto :put 200 (format "osi/ai-context/%s/%d" entity-type entity-local-id)
                        {:ai_context ai-context}))

(deftest ^:sequential crud-api-to-tool-end-to-end-test
  (testing "CRUD API write -> reconcile -> pgvector -> retrieve_library_entities tool, end to end"
    ;; Self-gated on MB_PGVECTOR_DB_URL — CI without semantic-search infra skips this; locally with the
    ;; dev pgvector running it exercises the whole pipeline. Uses the mock embedding model (4-dim,
    ;; deterministic, no network) against isolated temp tables, with the reconciler run directly in
    ;; place of the background Quartz job.
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :library-retrieval}
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
                    (let [_ (put-ai-context! "table" table-id
                                             {:instructions "Group by month." :synonyms [synonym]})]
                      (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                      (testing "the tool returns the table, matched on the curated synonym, with usage_instructions"
                        (is (=? [{:type "table" :id table-id :matched_doc_type "synonym" :matched_text synonym
                                  :usage_instructions "Group by month." :similarity (approx 1.0)}]
                                (search!))))
                      (testing "an entity that has left the library is post-filtered out before the index catches up"
                        ;; unpublish without reconciling: the index still holds the docs, but the tool drops
                        ;; the hit because the table is no longer a current library member.
                        (mt/with-temp-vals-in-db :model/Table table-id {:is_published false}
                          (is (empty? (search!)))))
                      (testing "deleting the ai_context via the CRUD API + reconcile drops the synonym doc"
                        (mt/user-http-request :crowberto :delete 204 (format "osi/ai-context/table/%d" table-id))
                        (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                        (is (empty? (jdbc/execute!
                                     ds
                                     [(format (str "SELECT 1 FROM \"%s\" "
                                                   "WHERE doc_type = 'synonym' AND entity_local_id = %d")
                                              index-table/*vectors-table* table-id)])))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(deftest ^:sequential doc-type-boost-breaks-ties-test
  (testing "on a distance tie, a name match outranks a synonym match (blended ORDER BY, not raw NN)"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :library-retrieval}
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
                    (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model))
                    ;; raw NN would tie both at distance 0; the 0.02 vs 0.01 doc_type bump puts alpha's name first.
                    (is (= [[alpha "name"] [beta "synonym"]]
                           (mapv (juxt (comp :id :entity) :doc_type) (take 2 (mirror/search q 10)))))
                    (finally
                      (jdbc/execute! ds [(str "DROP TABLE IF EXISTS "
                                              index-table/*vectors-table* ", "
                                              index-table/*meta-table*)]))))))))))))

(deftest ^:sequential search-degrades-on-dimension-mismatch-test
  ;; A post-upgrade embedding-dimension change leaves the query vector incompatible with the index column
  ;; until the next reconcile rebuilds it; search must degrade to [] rather than throw in that window.
  (testing "an index/query vector dimension mismatch degrades search to [] instead of throwing"
    (when semantic.db.datasource/db-url
      (mt/with-premium-features #{:library :library-retrieval}
        (let [suffix (System/nanoTime)
              ds     (semantic.db.datasource/ensure-initialized-data-source!)]
          (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model
                                      (constantly semantic.tu/mock-embedding-model)]
            (binding [index-table/*vectors-table* (str "library_entity_index_test_" suffix)
                      index-table/*meta-table*    (str "library_entity_index_meta_test_" suffix)]
              (mt/with-temp [:model/Collection {lib-id :id}  {:type "library" :location "/"}
                             :model/Collection {data-id :id} {:type "library-data" :location (str "/" lib-id "/")}
                             :model/Database   {db-id :id}    {}
                             :model/Table      {_t :id}       {:db_id db-id :collection_id data-id :is_published true
                                                               :active true :name "orders" :display_name "orders"}]
                (try
                  (semantic.tu/with-mock-embeddings {"orders" [1.0 0.0 0.0 0.0]}
                    (reconcile/reconcile! ds (constantly semantic.tu/mock-embedding-model)))
                  ;; a dim-1 query vector against the dim-4 index column -> pgvector SQLState 22000 -> degrade to []
                  (semantic.tu/with-mock-embeddings {"q" [1.0]}
                    (is (= [] (entity-retrieval.core/search "q" 10))))
                  (finally
                    (jdbc/execute! ds [(str "DROP TABLE IF EXISTS \"" index-table/*vectors-table*
                                            "\", \"" index-table/*meta-table* "\"")])))))))))))
