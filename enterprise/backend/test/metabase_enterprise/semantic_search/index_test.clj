(ns metabase-enterprise.semantic-search.index-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.semantic-search.index-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   ;; loaded for its :event/semantic-search-hnsw-enabled handler, which the setter test exercises
   [metabase-enterprise.semantic-search.events]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.spec-trace-test-util :as spec-trace]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- vector-search-sql
  "Format the private vector subquery for `strategy` against a stub index, returning the SQL string."
  [strategy]
  (let [index   {:table-name "idx_tbl"}
        ctx     (cond-> {:search-string "pasta" :archived? false}
                  strategy (assoc :vector-search-strategy strategy))
        embedding [0.1 0.2 0.3]]
    (first (sql/format (#'semantic.index/semantic-search-query index embedding ctx) :quoted true))))

(deftest semantic-search-query-strategy-test
  (testing ":brute-force applies the non-vector filters inside a MATERIALIZED CTE (filter-first, exact)"
    (let [sql (vector-search-sql :brute-force)]
      (is (str/includes? sql "AS MATERIALIZED"))
      ;; filter lives inside the CTE, alongside the distance computation
      (is (re-find #"AS MATERIALIZED \(SELECT.*\"archived\" = FALSE.*\)" sql))
      ;; the distance expression appears once -- it is computed and stored in the materialized CTE, and the
      ;; outer query reads that column rather than recomputing it
      (is (= 1 (count (re-seq #"embedding <=>" sql))))
      ;; no pure-vector ORDER BY ... LIMIT that would trigger the HNSW index
      (is (not (re-find #"ORDER BY embedding <=>[^)]*LIMIT" sql)))))
  (testing ":hnsw does a pure vector search in the inner CTE then post-filters (approximate)"
    (let [sql (vector-search-sql :hnsw)]
      (is (not (str/includes? sql "MATERIALIZED")))
      (is (re-find #"ORDER BY embedding <=>" sql))
      ;; the filter is applied in the outer query, after the candidate set is chosen, so it appears *after*
      ;; the inner ORDER BY embedding <=> ... LIMIT in the generated SQL
      (is (str/includes? sql "\"archived\" = FALSE"))
      (is (not (re-find #"(?s)\"archived\" = FALSE.*ORDER BY embedding <=>" sql)))))
  (testing ":hnsw-iterative-* filters inline with the ordered/limited index scan (iterative scan)"
    (doseq [strategy [:hnsw-iterative-relaxed :hnsw-iterative-strict]]
      (let [sql (vector-search-sql strategy)]
        (is (not (str/includes? sql "MATERIALIZED")))
        ;; the filter lives *inside* the ordered+limited candidate scan (before the ORDER BY embedding <=>),
        ;; so the HNSW index sees it and the iterative scan can extend until the limit is met
        (is (re-find #"(?s)\"archived\" = FALSE.*ORDER BY embedding <=>" sql)))))
  (testing "no explicit strategy falls back to the configured default setting"
    (is (= (vector-search-sql (semantic.settings/semantic-search-vector-strategy))
           (vector-search-sql nil)))))

(defn- flattened-vector-candidates-cte
  "Build the brute-force/hnsw hybrid query, flatten it the way `scored-search-query` does, and return the
  hoisted `:vector_candidates` CTE binding (e.g. `[:vector_candidates <query> :materialized]`)."
  [strategy]
  (let [index  {:table-name "idx_tbl"}
        ctx    {:search-string "pasta" :archived? false :vector-search-strategy strategy}
        hybrid (#'semantic.index/hybrid-search-query index [0.1 0.2 0.3] ctx)
        {:keys [ctes]} (#'semantic.index/flatten-ctes hybrid)]
    (first (filter #(= :vector_candidates (first %)) ctes))))

(deftest flatten-ctes-preserves-materialized-test
  (testing "the :materialized opt survives CTE hoisting (the path every real query takes via scored-search-query)"
    ;; A regression that dropped the opt would change only the query plan, not the results, so the
    ;; results-based end-to-end tests can't catch it -- assert on the hoisted binding directly.
    (is (= :materialized (last (flattened-vector-candidates-cte :brute-force)))))
  (testing ":hnsw hoists a plain CTE binding with no opts"
    (is (= 2 (count (flattened-vector-candidates-cte :hnsw))))))

(deftest semantic-search-vector-strategy-setting-test
  (testing "the setting rejects an unknown strategy"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid vector-search strategy"
                          (semantic.settings/semantic-search-vector-strategy! :nonsense))))
  (testing "valid strategies round-trip"
    (doseq [strategy [:hnsw :brute-force :hnsw-iterative-relaxed :hnsw-iterative-strict]]
      (mt/with-temporary-setting-values [semantic.settings/semantic-search-vector-strategy strategy]
        (is (= strategy (semantic.settings/semantic-search-vector-strategy))))))
  (testing "the setter kicks off the background build job on the transition into any HNSW-index-backed strategy"
    ;; This asserts *when* the build is triggered (the transition gating), not what the build does -- the
    ;; build itself is covered by pgvector-api-test/ensure-active-hnsw-index!-test. The setter publishes
    ;; :event/semantic-search-hnsw-enabled, whose handler (semantic-search.events) calls the async build; we
    ;; spy on that build so the trigger is verified deterministically without spawning a real future.
    (mt/with-premium-features #{:semantic-search}
      (let [triggers (atom 0)]
        (mt/with-dynamic-fn-redefs [semantic.core/build-hnsw-index-async! (fn [] (swap! triggers inc))]
          (mt/with-temporary-setting-values [semantic.settings/semantic-search-vector-strategy :brute-force]
            (semantic.settings/semantic-search-vector-strategy! :hnsw)
            (is (= 1 @triggers) "transitioning :brute-force -> :hnsw kicks off a build")
            (semantic.settings/semantic-search-vector-strategy! :hnsw)
            (is (= 1 @triggers) "setting :hnsw again when already :hnsw does not re-trigger")
            ;; switching between index-backed strategies reuses the existing index, so no rebuild
            (semantic.settings/semantic-search-vector-strategy! :hnsw-iterative-strict)
            (is (= 1 @triggers) "switching :hnsw -> :hnsw-iterative-strict does not re-trigger")
            (semantic.settings/semantic-search-vector-strategy! :brute-force)
            (is (= 1 @triggers) "switching away to :brute-force does not trigger")
            (semantic.settings/semantic-search-vector-strategy! :hnsw-iterative-relaxed)
            (is (= 2 @triggers) "transitioning :brute-force -> :hnsw-iterative-relaxed kicks off a build")))))))

(deftest vector-session-settings-test
  (testing ":hnsw and :brute-force need no session GUCs"
    (is (empty? (#'semantic.index/vector-session-settings {:vector-search-strategy :hnsw})))
    (is (empty? (#'semantic.index/vector-session-settings {:vector-search-strategy :brute-force}))))
  (testing ":hnsw-iterative-* emits iterative_scan/ef_search/max_scan_tuples SET LOCALs; the strategy sets the order"
    (is (= ["SET LOCAL hnsw.iterative_scan = strict_order"
            "SET LOCAL hnsw.ef_search = 100"
            "SET LOCAL hnsw.max_scan_tuples = 50000"]
           (map first (#'semantic.index/vector-session-settings
                       {:vector-search-strategy        :hnsw-iterative-strict
                        :vector-search-ef-search       100
                        :vector-search-max-scan-tuples 50000}))))
    (is (= "SET LOCAL hnsw.iterative_scan = relaxed_order"
           (first (first (#'semantic.index/vector-session-settings
                          {:vector-search-strategy :hnsw-iterative-relaxed}))))))
  (testing "force-index? appends enable_seqscan = off for any strategy"
    (is (= ["SET LOCAL enable_seqscan = off"]
           (map first (#'semantic.index/vector-session-settings
                       {:vector-search-strategy :hnsw :vector-search-force-index? true}))))))

(deftest ^:synchronized semantic-search-instrumentation-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/upsert-index! (semantic.tu/mock-documents))
      (testing "vector-search-explain? runs EXPLAIN ANALYZE and emits the vector-scan instrumentation metrics"
        (let [analytics-calls (atom [])]
          (mt/with-dynamic-fn-redefs [analytics/inc! (fn [metric & args]
                                                       (swap! analytics-calls conj [metric args]))]
            (mt/with-test-user :crowberto
              (semantic.index/query-index (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index
                                          {:search-string "dog training" :vector-search-explain? true}))
            (let [by-metric (into {} (map (juxt first (comp vec second))) @analytics-calls)]
              (testing "all four instrumentation metrics fire with numeric values"
                (doseq [metric [:metabase-search/semantic-vector-inner-ms
                                :metabase-search/semantic-vector-tuples-scanned
                                :metabase-search/semantic-prefilter-pool-size]]
                  (is (contains? by-metric metric))
                  ;; args are [labels amount]; the amount must be a non-negative number
                  (is (number? (second (by-metric metric))) (str metric " amount should be numeric"))
                  (is (<= 0 (second (by-metric metric))) (str metric " amount should be non-negative"))))
              (testing "the scan plan node is reported as a label"
                (is (contains? by-metric :metabase-search/semantic-vector-scan-used-index))
                (is (string? (get-in (by-metric :metabase-search/semantic-vector-scan-used-index)
                                     [0 :plan-node]))))))))
      (testing "with instrumentation off (the default) no instrumentation metrics are emitted"
        (let [analytics-calls (atom [])]
          (mt/with-dynamic-fn-redefs [analytics/inc! (fn [metric & args]
                                                       (swap! analytics-calls conj [metric args]))]
            (mt/with-test-user :crowberto
              (semantic.index/query-index (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index
                                          {:search-string "dog training"}))
            (is (not (contains? (set (map first @analytics-calls))
                                :metabase-search/semantic-vector-inner-ms)))))))))

(defn- expected-index-defs
  "The index-DDL contract of [[semantic.index/create-index-table-if-not-exists!]] for `index`.
  Maps the name of each index it must create to a pattern its pg_indexes indexdef must match."
  [index]
  ;; the pkey and (model, model_id) unique-constraint indexes come from the table schema, not CREATE INDEX
  ;; statements, so they are deliberately absent here; =? tolerates them as extra keys in the actual
  {(semantic.index/hnsw-index-name index)         #"CREATE INDEX .* USING hnsw \(embedding vector_cosine_ops\)"
   (semantic.index/fts-index-name index)          #"CREATE INDEX .* USING gin \(text_search_vector\)"
   (semantic.index/fts-native-index-name index)   #"CREATE INDEX .* USING gin \(text_search_with_native_query_vector\)"
   (#'semantic.index/content-index-name index)    #"CREATE INDEX .* USING btree \(content\)"})

(deftest create-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index! :hnsw? false)]
      (let [index      @index-ref
            table-name (:table-name index)]
        ;; open-temp-index! creates the temp table, so drop it in order to test create!.
        (semantic.index/drop-index-table! (semantic.env/get-pgvector-datasource!) index)
        (testing "neither the table nor any of its indexes is present before create!"
          (is (not (semantic.tu/table-exists-in-db? table-name)))
          (is (= {} (semantic.tu/table-indexes table-name))))
        (testing "under the default :brute-force strategy, create! builds the table and FTS indexes but not the HNSW index"
          (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly :brute-force)]
            (semantic.index/create-index-table-if-not-exists!
             (semantic.env/get-pgvector-datasource!) index {:force-reset? true}))
          (is (semantic.tu/table-exists-in-db? table-name))
          (is (=? (dissoc (expected-index-defs index) (semantic.index/hnsw-index-name index))
                  (semantic.tu/table-indexes table-name)))
          (is (not (semantic.tu/table-has-index? table-name (semantic.index/hnsw-index-name index)))))
        (testing "under the :hnsw strategy, force-reset? rebuilds the full contract (incl. HNSW) and wipes data"
          ;; seed rows first; rows that survive the reset would mean force-reset? was silently ignored
          (semantic.tu/upsert-index! (semantic.tu/mock-documents))
          (is (pos? (semantic.tu/index-count index)))
          (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly :hnsw)]
            (semantic.index/create-index-table-if-not-exists!
             (semantic.env/get-pgvector-datasource!) index {:force-reset? true}))
          (is (zero? (semantic.tu/index-count index)))
          (is (=? (expected-index-defs index) (semantic.tu/table-indexes table-name))))))))

(deftest create-hnsw-index-if-not-exists!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index! :hnsw? false)]
      (testing "HNSW index is absent until built explicitly"
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref))))
        (semantic.index/create-hnsw-index-if-not-exists! (semantic.env/get-pgvector-datasource!) @index-ref)
        (is (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref))))
      (testing "is idempotent: a second call does no work (reuses the existing index, no rebuild)"
        (let [before (semantic.tu/index-relfilenode (semantic.index/hnsw-index-name @index-ref))]
          (is (some? before) "the index exists before the second call")
          (semantic.index/create-hnsw-index-if-not-exists! (semantic.env/get-pgvector-datasource!) @index-ref)
          (is (= before (semantic.tu/index-relfilenode (semantic.index/hnsw-index-name @index-ref)))
              "relfilenode is unchanged, so the index was not dropped, rebuilt, or reindexed"))))))

(deftest query-index-hnsw-without-index-throws-test
  (testing "a query under any HNSW-index-backed strategy fails fast when no HNSW index exists, rather than silently scanning"
    (mt/with-premium-features #{:semantic-search}
      (with-open [index-ref (semantic.tu/open-temp-index! :hnsw? false)]
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref))))
        (doseq [strategy [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
          (testing strategy
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"no HNSW index exists"
                 (semantic.index/query-index (semantic.env/get-pgvector-datasource!)
                                             @index-ref
                                             {:search-string "puppy" :vector-search-strategy strategy})))))))))

(deftest drop-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index!)]
      (testing "index table is present before drop!"
        (is (semantic.tu/table-exists-in-db? (:table-name @index-ref))))
      (testing "index table is not present after drop!"
        (semantic.index/drop-index-table! (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index)
        (is (not (semantic.tu/table-exists-in-db? (:table-name @index-ref))))))))

(deftest upsert-index!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/check-index-has-no-mock-docs)
      (testing "upsert-index! returns nil if you pass it an empty collection"
        (is (nil? (semantic.tu/upsert-index! [])))
        (semantic.tu/check-index-has-no-mock-docs))
      (testing "upsert-index! works on a fresh index"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! (semantic.tu/mock-documents))))
        (semantic.tu/check-index-has-mock-docs))
      (testing "upsert-index! works with duplicate documents"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! (semantic.tu/mock-documents))))
        (semantic.tu/check-index-has-mock-docs)))))

(deftest upsert-index!-tsvectors-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/check-index-has-no-mock-docs)
      (testing "upsert-index! works on a fresh index"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! (semantic.tu/mock-documents)))))
      (testing "indexed cards have text search vectors populated"
        (is (=? [{:model "card"
                  :model_id "123"
                  :creator_id 1
                  :content "Dog Training Guide"
                  :text_search_vector #(and (str/includes? % "dog")
                                            (str/includes? % "train"))
                  :text_search_with_native_query_vector #(and (str/includes? % "dog")
                                                              (str/includes? % "train")
                                                              (str/includes? % "select")
                                                              (str/includes? % "breed")
                                                              (str/includes? % "trick"))}]
                (semantic.tu/query-tsvectors {:model "card", :model_id "123"}))))
      (let [result (semantic.tu/query-tsvectors {:model "dashboard", :model_id "456"})
            valid-tsvector? (every-pred string? seq)]
        (testing "indexed dashboards have text search vectors populated"
          (is (=? [{:model "dashboard"
                    :model_id "456"
                    :creator_id 2
                    :content "Elephant Migration"
                    :text_search_vector valid-tsvector?
                    :text_search_with_native_query_vector valid-tsvector?}]
                  result)))
        (testing "both tsvectors are equal for models with no native query"
          (is (= (:text_search_vector result)
                 (:text_search_with_native_query_vector result))))))))

(deftest delete-from-index!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/check-index-has-no-mock-docs)
      (testing "upsert-index! before delete!"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! (semantic.tu/mock-documents))))
        (semantic.tu/check-index-has-mock-docs))
      (testing "delete-from-index! returns nil if you pass it an empty collection"
        (is (nil? (semantic.tu/delete-from-index! "card" [])))
        (semantic.tu/check-index-has-mock-docs))
      (testing "delete-from-index! works for cards"
        (is (= {"card" 1}
               (semantic.tu/delete-from-index! "card" ["123"])))
        (semantic.tu/check-index-has-no-mock-card)
        (semantic.tu/check-index-has-mock-dashboard))
      (testing "delete-from-index! works for dashboards"
        (is (= {"dashboard" 1}
               (semantic.tu/delete-from-index! "dashboard" ["456"])))
        (semantic.tu/check-index-has-no-mock-docs))
      (testing "delete-from-index! doesn't complain if you delete a document that doesn't exist"
        (is (= {"card" 1}
               (semantic.tu/delete-from-index! "card" ["123"])))
        (semantic.tu/check-index-has-no-mock-docs)))))

(deftest batch-process-mock-docs!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (binding [semantic.index/*batch-size* 1]
        (let [extra-ids (->> (range 1337 1347) (map str))
              extra-docs (map (fn [id doc]
                                (assoc doc :id id))
                              extra-ids
                              (flatten (repeat (semantic.tu/mock-documents))))
              mock-docs (into (semantic.tu/mock-documents) extra-docs)]
          (testing "ensure upsert! and delete! work when batch size is exceeded"
            (semantic.tu/check-index-has-no-mock-docs)
            (testing "upsert-index! with batch processing"
              (is (= {"card" 6, "dashboard" 6}
                     (semantic.tu/upsert-index! mock-docs)))
              (semantic.tu/check-index-has-mock-docs))
            (testing "delete-from-index! with batch processing"
              (testing "delete just the card"
                (is (= {"card" 11}
                       (semantic.tu/delete-from-index! "card" (into ["123"] extra-ids))))
                (semantic.tu/check-index-has-no-mock-card)
                (semantic.tu/check-index-has-mock-dashboard)))
            (testing "delete the dashboard"
              (is (= {"dashboard" 11}
                     (semantic.tu/delete-from-index! "dashboard" (into ["456"] extra-ids))))
              (semantic.tu/check-index-has-no-mock-docs))))))))

(defn- only-first-call [r f]
  (let [is-first (atom true)]
    (fn [& args]
      (when @is-first
        (is (= @r semantic.index/*batch-size*))
        (reset! is-first false)
        (apply f args)))))

(deftest reducible-is-respected-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (binding [semantic.index/*batch-size* 2]
        (let [docs (semantic.tu/mock-documents)
              realized (atom 0)
              mock-docs (eduction (comp (map str)
                                        (map (fn [id]
                                               (swap! realized inc)
                                               (assoc (first docs) :id id))))
                                  (range 123 500))]
          (testing "ensure upsert! and delete! don't realize the full reducible at once"
            (semantic.tu/check-index-has-no-mock-docs)
            (testing "upsert-index!"
              (with-redefs [semantic.index/upsert-index-pooled! (only-first-call realized @#'semantic.index/upsert-index-pooled!)]
                (is (= {"card" 2} (semantic.tu/upsert-index! mock-docs))))
              (semantic.tu/check-index-has-mock-card))
            (reset! realized 0)
            (testing "delete-from-index!"
              (with-redefs [semantic.index/delete-from-index-batch-sql (only-first-call realized @#'semantic.index/delete-from-index-batch-sql)]
                (is (= {"card" 2} (semantic.tu/delete-from-index! "card" (eduction (map :id) mock-docs)))))
              (semantic.tu/check-index-has-no-mock-docs))))))))

(defn- track-concurrency
  [max-concurrent f]
  (let [current-concurrent (atom 0)]
    (fn [& args]
      (swap! current-concurrent inc)
      (swap! max-concurrent (fn [m] (max m @current-concurrent)))
      (try
        (apply f args)
        (finally
          (swap! current-concurrent dec))))))

(deftest upsert-index-concurrent-batch-processing-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (testing "ensure upsert! batch processing is concurrent update to index-update-thread-count"
        (binding [semantic.index/*batch-size* 2]
          (let [max-concurrent (atom 0)
                update-fn      @#'semantic.index/upsert-index-batch!
                docs          (take 100 (map-indexed (fn [i doc] (assoc doc :id (str i)))
                                                     (cycle (semantic.tu/mock-documents))))]
            (with-redefs [semantic.index/upsert-index-batch! (track-concurrency
                                                              max-concurrent
                                                              (fn [& args] (apply update-fn args)))]
              (semantic.tu/check-index-has-no-mock-docs)
              (is (= {"card" 50, "dashboard" 50}
                     (semantic.tu/upsert-index! docs)))
              (is (= 2 @max-concurrent) "Expected up to 2 concurrent batches"))))))))

(deftest upsert-index-batched-embeddings-pairing-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (testing "Documents with different searchable texts get associated with their correct embeddings"
        (let [test-documents [{:model "card"
                               :id "1"
                               :name "Dog Training Guide"
                               :searchable_text "Dog Training Guide"
                               :embeddable_text "Dog Training Guide"
                               :creator_id 1
                               :legacy_input {:model "card" :id "1"}
                               :metadata {}}
                              {:model "card"
                               :id "2"
                               :name "Elephant Migration"
                               :searchable_text "Elephant Migration"
                               :embeddable_text "Elephant Migration"
                               :creator_id 2
                               :legacy_input {:model "card" :id "2"}
                               :metadata {}}
                              {:model "card"
                               :id "3"
                               :name "Tiger Conservation"
                               :searchable_text "Tiger Conservation"
                               :embeddable_text "Tiger Conservation"
                               :creator_id 3
                               :legacy_input {:model "card" :id "3"}
                               :metadata {}}]]
          ;; Each embedding should be processed separately
          (mt/with-temporary-setting-values [openai-max-tokens-per-batch 3]
            (binding [semantic.index/*batch-size* 1]
              (semantic.tu/upsert-index! test-documents)
              ;; Verify each document has its own correct embedding
              (is (= [{:model "card" :model_id "1" :creator_id 1
                       :content "Dog Training Guide"
                       :embedding (semantic.tu/get-mock-embedding "Dog Training Guide")}]
                     (semantic.tu/query-embeddings {:model "card" :model_id "1"})))
              (is (= [{:model "card" :model_id "2" :creator_id 2
                       :content "Elephant Migration"
                       :embedding (semantic.tu/get-mock-embedding "Elephant Migration")}]
                     (semantic.tu/query-embeddings {:model "card" :model_id "2"})))
              (is (= [{:model "card" :model_id "3" :creator_id 3
                       :content "Tiger Conservation"
                       :embedding (semantic.tu/get-mock-embedding "Tiger Conservation")}]
                     (semantic.tu/query-embeddings {:model "card" :model_id "3"}))))))))))

(defn- embedding-reuse-with-batch-size! [batch-size & {:keys [inter-batch? serial?]}]
  (let [test-documents [{:model "card"
                         :id "1"
                         :name "Dog Training Guide"
                         :searchable_text "Dog Training Guide"
                         :embeddable_text "Dog Training Guide"
                         :creator_id 1
                         :legacy_input {:model "card" :id "1"}
                         :metadata {}}
                        {:model "card"
                         :id "2"
                         :name "Elephant Migration"
                         :searchable_text "Elephant Migration"
                         :embeddable_text "Elephant Migration"
                         :creator_id 2
                         :legacy_input {:model "card" :id "2"}
                         :metadata {}}
                        {:model "card"
                         :id "3"
                         :name "Dog Training Guide"
                         :searchable_text "Dog Training Guide"
                         :embeddable_text "Dog Training Guide"
                         :creator_id 3
                         :legacy_input {:model "card" :id "3"}
                         :metadata {}}]]
    (binding [semantic.index/*batch-size* batch-size]
      (let [{:keys [calls proxy]} (semantic.tu/spy semantic.embedding/process-embeddings-streaming)
            inter-batch-cache-hit? (atom false)]
        (with-redefs [semantic.embedding/process-embeddings-streaming proxy
                      semantic.index/partition-existing-embeddings
                      (let [orig @#'semantic.index/partition-existing-embeddings]
                        (fn [& args]
                          (let [ret (apply orig args)]
                            (when (seq (second ret))
                              (reset! inter-batch-cache-hit? true))
                            ret)))]
          (semantic.tu/upsert-index! test-documents :serial? serial?))
        (is (= inter-batch? @inter-batch-cache-hit?))
        (is (= 1 (count @calls)))
        (is (= ["Dog Training Guide" "Elephant Migration"]
               (second (:args (first @calls))))))
      (is (= [{:model "card" :model_id "1" :creator_id 1
               :content "Dog Training Guide"
               :embedding (semantic.tu/get-mock-embedding "Dog Training Guide")}]
             (semantic.tu/query-embeddings {:model "card" :model_id "1"})))
      (is (= [{:model "card" :model_id "2" :creator_id 2
               :content "Elephant Migration"
               :embedding (semantic.tu/get-mock-embedding "Elephant Migration")}]
             (semantic.tu/query-embeddings {:model "card" :model_id "2"})))
      (is (= [{:model "card" :model_id "3" :creator_id 3
               :content "Dog Training Guide"
               :embedding (semantic.tu/get-mock-embedding "Dog Training Guide")}]
             (semantic.tu/query-embeddings {:model "card" :model_id "3"}))))))

(deftest upsert-index-embeddings-caching-test
  (mt/with-premium-features #{:semantic-search}
    (testing "Documents with identical searchable texts lead to cached embedding"
      (testing "via intra-batch deduping"
        (with-open [_ (semantic.tu/open-temp-index!)]
          (embedding-reuse-with-batch-size! 3 :inter-batch? false)))
      (testing "via inter-batch caching"
        (with-open [_ (semantic.tu/open-temp-index!)]
          ;; Ensure batches are processed serially -- concurrent batches don't support inter-batch caching.
          (embedding-reuse-with-batch-size! 2 :inter-batch? true :serial? true))))))

(deftest prometheus-metrics-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (mt/with-prometheus-system! [_ system]
        (testing "semantic-index-size starts at zero"
          (is (= 0.0 (mt/metric-value system :metabase-search/semantic-index-size))))
        (testing "semantic-index-size is updated after upsert-index! on empty db"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.tu/upsert-index! (semantic.tu/mock-documents))))
          (is (= 2.0 (mt/metric-value system :metabase-search/semantic-index-size))))
        (testing "semantic-index-size is updated after delete-from-index!"
          (is (= {"card" 1}
                 (semantic.tu/delete-from-index! "card" ["123"])))
          (is (= 1.0 (mt/metric-value system :metabase-search/semantic-index-size))))
        (testing "semantic-index-size is updated after upsert-index! on populated db"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.tu/upsert-index! (semantic.tu/mock-documents))))
          (is (= 2.0 (mt/metric-value system :metabase-search/semantic-index-size))))))))

(deftest ^:synchronized semantic-search-analytics-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (semantic.tu/upsert-index! (semantic.tu/mock-documents))
      (testing "Analytics metrics are recorded for semantic search operations"
        (let [analytics-calls (atom [])]
          (mt/with-dynamic-fn-redefs [analytics/inc! (fn [metric & args]
                                                       (swap! analytics-calls conj [metric args]))]
            (testing "Permission filtering metrics"
              (reset! analytics-calls [])
              (mt/with-test-user :crowberto
                (semantic.index/query-index (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index
                                            {:search-string "dog training"}))
              (let [permission-calls (filter #(= :metabase-search/semantic-permission-filter-ms (first %)) @analytics-calls)]
                (is (= 1 (count permission-calls)))
                (let [time-ms (first (second (first permission-calls)))]
                  (is (number? time-ms))
                  (is (< time-ms 1000) "Permission filtering should complete within 1000ms"))))
            (testing "Semantic search timing metrics"
              (reset! analytics-calls [])
              (mt/with-test-user :crowberto
                (semantic.index/query-index (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index
                                            {:search-string "elephant migration"
                                             :filter-items-in-personal-collection "only"}))
              (let [metric-names (set (map first @analytics-calls))]
                (is (contains? metric-names :metabase-search/semantic-search-ms))
                (is (contains? metric-names :metabase-search/semantic-embedding-ms))
                (is (contains? metric-names :metabase-search/semantic-db-query-ms))
                (is (contains? metric-names :metabase-search/semantic-permission-filter-ms))
                (is (contains? metric-names :metabase-search/semantic-appdb-scores-ms)))
              (testing "timing values  are reasonable"
                (doseq [[metric args] @analytics-calls
                        :when (#{:metabase-search/semantic-search-ms
                                 :metabase-search/semantic-embedding-ms
                                 :metabase-search/semantic-db-query-ms
                                 :metabase-search/semantic-permission-filter-ms
                                 :metabase-search/semantic-appdb-scores-ms} metric)]
                  (let [time-ms (if (#{:metabase-search/semantic-permission-filter-ms
                                       :metabase-search/semantic-appdb-scores-ms}
                                     metric)
                                  (first args)
                                  (second args))]
                    (is (number? time-ms) (str "Time for " metric " should be numeric"))
                    (is (>= time-ms 0) (str "Time for " metric " should be non-negative"))
                    (is (< time-ms 1000) (str "Time for " metric " should be under 1000ms")))))
              (let [embedding-metrics (filter #(#{:metabase-search/semantic-search-ms
                                                  :metabase-search/semantic-embedding-ms
                                                  :metabase-search/semantic-db-query-ms} (first %)) @analytics-calls)]
                (doseq [[_ args] embedding-metrics]
                  (let [labels (first args)]
                    (is (map? labels) "Should have labels map")
                    (is (contains? labels :embedding-model) "Should include embedding-model label")))))))))))

(deftest personal-collection-filter-test
  (testing "personal-collection-filter generates correct SQL WHERE clauses"
    (let [user-id 42]
      (testing "filter-type 'all' returns nil (no filter)"
        (is (nil? (#'semantic.index/personal-collection-filter
                   {:filter-items-in-personal-collection "all" :current-user-id user-id}))))
      (testing "filter-type nil defaults to 'all' behavior"
        (is (nil? (#'semantic.index/personal-collection-filter
                   {:filter-items-in-personal-collection nil :current-user-id user-id}))))
      (testing "filter-type 'only-mine' returns only current user's personal collection items"
        (is (= [:= :personal_owner_id user-id]
               (#'semantic.index/personal-collection-filter
                {:filter-items-in-personal-collection "only-mine" :current-user-id user-id}))))
      (testing "filter-type 'only' returns all personal collection items (any user)"
        (is (= [:is-not :personal_owner_id nil]
               (#'semantic.index/personal-collection-filter
                {:filter-items-in-personal-collection "only" :current-user-id user-id}))))
      (testing "filter-type 'exclude' returns only shared and uncollected items"
        (is (= [:is :personal_owner_id nil]
               (#'semantic.index/personal-collection-filter
                {:filter-items-in-personal-collection "exclude" :current-user-id user-id}))))
      (testing "filter-type 'exclude-others' returns user's personal items plus shared/uncollected items"
        (is (= [:or
                [:is :personal_owner_id nil]
                [:= :personal_owner_id user-id]]
               (#'semantic.index/personal-collection-filter
                {:filter-items-in-personal-collection "exclude-others" :current-user-id user-id})))))))

(deftest batch-resolve-personal-owner-ids-test
  (testing "batch-resolve-personal-owner-ids correctly resolves personal collection ownership"
    (let [user1-id               (mt/user->id :rasta)
          user2-id               (mt/user->id :crowberto)
          user1-personal-coll-id (u/the-id (collection/user->personal-collection user1-id))
          user2-personal-coll-id (u/the-id (collection/user->personal-collection user2-id))]
      (mt/with-temp
        [:model/Collection {shared-coll-id :id} {:name "Shared Collection"}
         :model/Collection {user1-sub-coll-id :id} {:location (str "/" user1-personal-coll-id "/") :name "User1 Sub"}
         :model/Collection {user2-sub-coll-id :id} {:location (str "/" user2-personal-coll-id "/") :name "User2 Sub"}]
        (testing "empty input returns empty map"
          (is (empty? (#'semantic.index/batch-resolve-personal-owner-ids [])))
          (is (empty? (#'semantic.index/batch-resolve-personal-owner-ids [nil]))))
        (testing "shared collection is absent from result"
          (is (empty? (#'semantic.index/batch-resolve-personal-owner-ids [shared-coll-id]))))
        (testing "personal collections map to their owners"
          (is (= {user1-personal-coll-id user1-id
                  user2-personal-coll-id user2-id}
                 (#'semantic.index/batch-resolve-personal-owner-ids
                  [user1-personal-coll-id user2-personal-coll-id]))))
        (testing "sub-collections of personal collections map to root personal owner"
          (is (= {user1-sub-coll-id user1-id
                  user2-sub-coll-id user2-id}
                 (#'semantic.index/batch-resolve-personal-owner-ids
                  [user1-sub-coll-id user2-sub-coll-id]))))
        (testing "mixed input resolves all in one call"
          (is (= {user1-personal-coll-id user1-id
                  user2-sub-coll-id      user2-id}
                 (#'semantic.index/batch-resolve-personal-owner-ids
                  [user1-personal-coll-id user2-sub-coll-id shared-coll-id nil]))))))))

(deftest filter-read-permitted-fast-path-test
  (mt/with-premium-features #{:semantic-search}
    (testing "filter-read-permitted routes collection-id-only models through the fast path"
      (mt/with-temp [:model/Collection {readable-coll-id :id} {}
                     :model/Collection {unreadable-coll-id :id} {}]
        (testing "indexed-entity docs are filtered by denormalized :collection_id"
          (let [docs [{:id "1:123" :model "indexed-entity" :collection_id readable-coll-id}
                      {:id "2:456" :model "indexed-entity" :collection_id unreadable-coll-id}
                      {:id "3:789" :model "indexed-entity" :collection_id nil}]]
            (testing "keeps all entities when user has root permissions"
              (binding [api/*current-user-permissions-set* (atom #{"/"})]
                (is (= 3 (count (#'semantic.index/filter-read-permitted docs))))))
            (testing "drops all entities when user has no permissions"
              (binding [api/*current-user-permissions-set* (atom #{})]
                (is (= 0 (count (#'semantic.index/filter-read-permitted docs))))))
            (testing "keeps only entities in readable collections"
              (binding [api/*current-user-permissions-set* (atom #{(format "/collection/%d/read/" readable-coll-id)})]
                (let [result (#'semantic.index/filter-read-permitted docs)]
                  (is (= 1 (count result)))
                  (is (= "1:123" (:id (first result)))))))))
        (testing "card/metric/dataset/dashboard docs use the same fast path"
          (doseq [model ["card" "metric" "dataset" "dashboard"]]
            (testing (str "model=" model)
              (let [docs [{:id 1 :model model :collection_id readable-coll-id}
                          {:id 2 :model model :collection_id unreadable-coll-id}
                          {:id 3 :model model :collection_id nil}]]
                (binding [api/*current-user-permissions-set* (atom #{(format "/collection/%d/read/" readable-coll-id)})]
                  (let [result (#'semantic.index/filter-read-permitted docs)]
                    (is (= [1] (map :id result))
                        "only the doc whose denormalized collection_id is readable survives")))))))
        (testing "memoizes permission check per collection_id across docs"
          (let [calls       (atom 0)
                real-helper perms/can-read-via-parent-collection?]
            (with-redefs [perms/can-read-via-parent-collection? (fn [& args]
                                                                  (swap! calls inc)
                                                                  (apply real-helper args))]
              (binding [api/*current-user-permissions-set* (atom #{"/"})]
                (#'semantic.index/filter-read-permitted
                 (repeat 50 {:id "1:1" :model "indexed-entity" :collection_id readable-coll-id}))
                (is (= 1 @calls) "expected one can-read-via-parent-collection? call for the single distinct collection_id")))))
        (testing "handles empty input"
          (is (= [] (#'semantic.index/filter-read-permitted []))))))))

(deftest collection-id-only-search-models-derived-correctly-test
  (testing "derived set includes every collection-id-only search-model plus indexed-entity"
    ;; Update the expected set when `define-collection-based-visibility!` is added to or removed from a model.
    (is (= #{"card" "metric" "dataset" "dashboard" "indexed-entity"}
           @@#'semantic.index/collection-id-only-search-models))))

(deftest collection-based-visibility-search-model-claims-verified-test
  (testing "every search-model registered with :denormalized-from traces to that model from :collection-id"
    ;; Guards the `:denormalized-from` claim at `define-collection-based-visibility!` call sites against
    ;; drift. We walk the join equality graph from `:collection-id` and require the claim to be a
    ;; structural source — not merely any model mentioned in `:joins`. Without this, a stale claim can
    ;; still pass if the model stays joined for an unrelated field.
    (let [specs (search/specifications)]
      (doseq [[search-model denormalized-from] (perms/collection-based-visibility-search-models)]
        (testing (str search-model " traces :collection-id to " denormalized-from)
          (let [spec    (get specs search-model)
                reached (spec-trace/trace-collection-id-source-models spec)]
            (is (some? spec)
                (str "no search spec registered for " (pr-str search-model)))
            (is (contains? reached denormalized-from)
                (str (pr-str search-model) " claims :denormalized-from " (pr-str denormalized-from)
                     " but tracing :collection-id through its join equalities only reaches "
                     reached))))))))

(deftest keyword-form-derived-search-models-trace-to-own-model-test
  (testing "every keyword-form-derived search-model denormalizes :collection_id from its own t2-model"
    ;; The string form of `define-collection-based-visibility!` carries an explicit `:denormalized-from`
    ;; claim verified above. The keyword form has no such claim: sibling specs like "dataset"/"metric"
    ;; are swept into the fast path purely because their `:model` is a registered t2-model. The fast path
    ;; checks `can-read-via-parent-collection?` against the index row's `:collection_id`, so this is only
    ;; correct if the spec's `:collection-id` is its own collection. Assert that structurally — tracing
    ;; `:collection-id` through join equalities must reach the spec's own registered t2-model — so a future
    ;; sibling sourcing `:collection-id` from a join (a different collection) fails here instead of
    ;; silently gaining incorrect read semantics.
    (let [specs                (search/specifications)
          registered-t2-models (perms/collection-id-only-read-models)]
      ;; Guard against a vacuous pass: if the registry is empty the `:when` filter below matches nothing
      ;; and the only assertion never runs. A future refactor that breaks registry population should fail
      ;; here rather than silently no-op.
      (is (seq registered-t2-models)
          "registry must be populated by search/specifications")
      (doseq [[search-model spec] specs
              :let [t2-model (:model spec)]
              :when (contains? registered-t2-models t2-model)]
        (testing (str search-model " traces :collection-id to its own model " t2-model)
          (let [reached (spec-trace/trace-collection-id-source-models spec)]
            (is (contains? reached t2-model)
                (str (pr-str search-model) " is derived into the fast path via its registered t2-model "
                     (pr-str t2-model) " but tracing :collection-id through its join equalities only reaches "
                     reached " — its denormalized :collection_id is not its own collection"))))))))

(deftest collection-id-only-search-models-cold-start-regression-test
  (testing "derivation populates correctly even if registry is empty at first access"
    ;; The derivation must call `search/specifications` before reading either registry — `t2/resolve-model`
    ;; inside `specifications` loads the model namespaces that populate them.
    ;; If the order flips, cold start caches an empty set for the JVM lifetime. Both the t2-model registry
    ;; (card/metric/dataset/dashboard) and the search-model registry (indexed-entity) must be covered.
    (let [real-specs          (var-get #'search/specifications)
          real-t2-registry    perms/collection-id-only-read-models
          real-search-registry perms/collection-based-visibility-search-models
          specs-loaded?       (atom false)]
      (with-redefs [search/specifications (fn []
                                            (reset! specs-loaded? true)
                                            (real-specs))
                    perms/collection-id-only-read-models (fn []
                                                           (if @specs-loaded?
                                                             (real-t2-registry)
                                                             #{}))
                    perms/collection-based-visibility-search-models (fn []
                                                                      (if @specs-loaded?
                                                                        (real-search-registry)
                                                                        {}))]
        (let [result (#'semantic.index/compute-collection-id-only-search-models)]
          (is (contains? result "card"))
          (is (contains? result "dashboard"))
          (is (contains? result "indexed-entity")))))))

(deftest to-boolean-test
  (testing "to-boolean function correctly converts various input types to booleans"
    (testing "boolean inputs are returned unchanged"
      (is (true? (#'semantic.index/to-boolean true)))
      (is (false? (#'semantic.index/to-boolean false))))
    (testing "MySQL-style integer booleans are converted correctly"
      (is (false? (#'semantic.index/to-boolean 0)))
      (is (true? (#'semantic.index/to-boolean 1))))))

(deftest decode-legacy-input-test
  (letfn [(pgo [s] (doto (PGobject.) (.setType "jsonb") (.setValue s)))]
    (testing "JSONB object value decodes to a map"
      (is (= {:legacy_input {:name "Top 10" :model "card"}}
             (#'semantic.index/decode-legacy-input
              {:legacy_input (pgo "{\"name\":\"Top 10\",\"model\":\"card\"}")}))))
    (testing "BOT-1543: JSONB string value (double-encoded) is decoded again"
      (is (= {:legacy_input {:name "Pro" :model "collection"}}
             (#'semantic.index/decode-legacy-input
              {:legacy_input (pgo "\"{\\\"name\\\":\\\"Pro\\\",\\\"model\\\":\\\"collection\\\"}\"")}))))))

(deftest doc->db-record-boolean-conversion-test
  (testing "doc->db-record properly converts boolean fields using to-boolean"
    (let [embedding-vec [0.1 0.2 0.3]
          base-doc {:model "card"
                    :id "123"
                    :searchable_text "test content"
                    :embeddable_text "test content"
                    :creator_id 1
                    :embedding embedding-vec}]
      (testing "MySQL-style integer booleans are converted to real booleans"
        (let [doc-with-mysql-booleans (assoc base-doc
                                             :archived 0
                                             :official_collection 1
                                             :pinned 0
                                             :verified 1)
              result (#'semantic.index/doc->db-record nil doc-with-mysql-booleans)]
          (is (false? (:archived result)))
          (is (true? (:official_collection result)))
          (is (false? (:pinned result)))
          (is (true? (:verified result)))))
      (testing "real boolean values are preserved"
        (let [doc-with-real-booleans (assoc base-doc
                                            :archived true
                                            :official_collection false
                                            :pinned true
                                            :verified false)
              result (#'semantic.index/doc->db-record nil doc-with-real-booleans)]
          (is (true? (:archived result)))
          (is (false? (:official_collection result)))
          (is (true? (:pinned result)))
          (is (false? (:verified result)))))
      (testing "nil boolean fields are handled correctly"
        (let [doc-with-nil-booleans base-doc
              result (#'semantic.index/doc->db-record nil doc-with-nil-booleans)]
          (is (nil? (:archived result)))
          (is (nil? (:official_collection result)))
          (is (nil? (:pinned result)))
          (is (nil? (:verified result))))))))

(deftest indexed-entity-collapse-id-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card model-1 (assoc (mt/card-with-source-metadata-for-query
                                               (mt/mbql-query products {:fields [$id $title]
                                                                        :limit 1}))
                                              :type "model"
                                              :name "Fish Tank Setup"
                                              :database_id (mt/id)
                                              :collection_id coll-id)
                   :model/ModelIndex model-index-1 {:model_id (:id model-1)
                                                    :pk_ref (mt/$ids :products $id)
                                                    :value_ref (mt/$ids :products $title)
                                                    :schedule "0 0 0 * * *"
                                                    :state "initial"
                                                    :creator_id (mt/user->id :rasta)}]
      (let [docs [{:model "dataset"
                   :id (:id model-1)
                   :name (:name model-1)
                   :searchable_text (:name model-1)
                   :embeddable_text (:name model-1)
                   :created_at #t "2025-01-01T12:00:00Z"
                   :creator_id (mt/user->id :crowberto)
                   :archived false
                   :collection_id coll-id
                   :legacy_input {:id (:id model-1)
                                  :model "dataset"
                                  :dataset_query (:dataset_query model-1)}
                   :metadata {:title (:name model-1)}}
                  {:id (str (:id model-index-1) ":1234")
                   :name "Antarctic wildlife"
                   :model "indexed-entity"
                   :archived false
                   :collection_id coll-id
                   :searchable_text "Antarctic wildlife"
                   :embeddable_text "Antarctic wildlife"
                   :legacy_input {:id (str (:id model-index-1) ":1234")
                                  :name "Antarctic wildlife"
                                  :model "indexed-entity"}
                   :metadata {:title "Antarctic wildlife"}}]]
        (with-open [_ (semantic.tu/open-temp-index!)]
          (testing "indexed-entity can be inserted into index"
            (is (=
                 {"indexed-entity" 1, "dataset" 1}
                 (semantic.tu/upsert-index! docs))))
          (testing "indexed-entity has id collapsed"
            (is (= {:id 1234
                    :name "Antarctic wildlife"
                    :model "indexed-entity"}
                   (mt/as-admin
                     (-> (semantic.tu/query-index {:search-string "Antarctic wildlife"})
                         first
                         (select-keys [:id :name :model])))))))))))

(deftest search-filters-models-test
  (testing "the models predicate distinguishes an empty applicable-model set from an absent one"
    (let [conds (fn [ctx] (tree-seq coll? seq (#'semantic.index/search-filters ctx)))]
      (testing "a non-empty set filters to those models"
        (is (some #{[:in :model #{"card"}]} (conds {:models #{"card"}}))))
      (testing "an empty (but present) set matches nothing, rather than omitting the predicate (all models)"
        (is (some #{[:= [:inline 1] [:inline 0]]} (conds {:models #{} :curated? true}))))
      (testing "an absent :models adds no model predicate"
        (let [flat (conds {:archived? false})]
          (is (not-any? #(and (vector? %) (= [:in :model] (subvec % 0 (min 2 (count %))))) flat))
          (is (not-any? #{[:= [:inline 1] [:inline 0]]} flat)))))))
