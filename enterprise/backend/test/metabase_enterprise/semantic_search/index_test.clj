(ns metabase-enterprise.semantic-search.index-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.util :as u]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest create-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index!)]
      ;; open-temp-index-table! creates the temp table, so drop it in order to test create!.
      (semantic.index/drop-index-table! (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index)
      (testing "index table is not present before create!"
        (is (not (semantic.tu/table-exists-in-db? (:table-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-index-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-native-index-name @index-ref)))))
      (testing "index table is present after create!"
        (semantic.index/create-index-table-if-not-exists! (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index {:force-reset? false})
        (is (semantic.tu/table-exists-in-db? (:table-name @index-ref)))
        (is (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref)))
        (is (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-index-name @index-ref)))
        (is (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-native-index-name @index-ref)))))))

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

(defn- join-equality-pairs
  "Return `[col-a col-b]` for every `[:= col-a col-b]` subform of `condition` where both sides are
  column-reference keywords. Walks through compound conditions like `[:and ...]`."
  [condition]
  (->> (tree-seq sequential? seq condition)
       (filter (fn [node]
                 (and (vector? node)
                      (= := (first node))
                      (= 3 (count node))
                      (keyword? (nth node 1))
                      (keyword? (nth node 2)))))
       (map (fn [[_ a b]] [a b]))))

(defn- column-alias
  "Extract the `:alias` from a dotted column-reference keyword like `:alias.col`. Returns nil if the
  keyword is not in `alias.col` form."
  [col]
  (when (keyword? col)
    (let [idx (str/index-of (name col) \.)]
      (when idx
        (keyword (subs (name col) 0 idx))))))

(defn- trace-collection-id-source-models
  "Return t2-model keywords reachable from the spec's `:collection-id` attribute via join equalities.
  `:this` resolves to the spec's own base model; other aliases resolve via `:joins`. A claim of
  `:denormalized-from X` is structurally sound iff `X` is in the returned set."
  [spec]
  (let [attr-col     (get-in spec [:attrs :collection-id])
        joins        (:joins spec)
        alias->model (-> (into {} (map (fn [[alias [model _]]] [alias model])) joins)
                         (assoc :this (:model spec)))
        edges        (mapcat (fn [[_ [_ jcond]]] (join-equality-pairs jcond)) joins)
        eq-map       (reduce (fn [m [a b]]
                               (-> m
                                   (update a (fnil conj #{}) b)
                                   (update b (fnil conj #{}) a)))
                             {}
                             edges)
        reachable    (loop [visited #{}
                            queue   [attr-col]]
                       (if-let [col (first queue)]
                         (if (visited col)
                           (recur visited (rest queue))
                           (recur (conj visited col)
                                  (into (vec (rest queue)) (eq-map col))))
                         visited))]
    (into #{} (keep (comp alias->model column-alias)) reachable)))

(deftest trace-collection-id-source-models-test
  (testing "traces `:collection-id` through `[:= a b]` equalities to every equivalent model"
    ;; Mirrors the `indexed-entity` spec shape: `:collection-id` → `:collection.id`, which joins to
    ;; `:model.collection_id`, so both :model/Collection and :model/Card are valid claims.
    (is (= #{:model/Collection :model/Card}
           (trace-collection-id-source-models
            {:model :model/ModelIndexValue
             :attrs {:collection-id :collection.id}
             :joins {:model_index [:model/ModelIndex [:= :model_index.id :this.model_index_id]]
                     :model       [:model/Card [:= :model.id :model_index.model_id]]
                     :collection  [:model/Collection [:= :collection.id :model.collection_id]]}}))))
  (testing "unrelated joins do not pollute the source set"
    ;; A join for some other field must not count: `:table` is joined for display but `:collection.id`
    ;; only resolves through `:this.collection_id`.
    (is (= #{:model/Collection :model/Base}
           (trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id :collection.id}
             :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                     :table      [:model/Table [:= :table.id :this.table_id]]}}))))
  (testing "handles compound `:and` conditions"
    (is (= #{:model/Collection :model/Base}
           (trace-collection-id-source-models
            {:model :model/Base
             :attrs {:collection-id :collection.id}
             :joins {:collection [:model/Collection
                                  [:and [:= :this.is_published true]
                                   [:= :collection.id :this.collection_id]]]}})))))

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
                reached (trace-collection-id-source-models spec)]
            (is (some? spec)
                (str "no search spec registered for " (pr-str search-model)))
            (is (contains? reached denormalized-from)
                (str (pr-str search-model) " claims :denormalized-from " (pr-str denormalized-from)
                     " but tracing :collection-id through its join equalities only reaches "
                     reached))))))))

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
