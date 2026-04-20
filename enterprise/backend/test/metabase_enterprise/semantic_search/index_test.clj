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
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
          (let [calls (atom 0)
                real-helper perms/can-read-audit-helper]
            (with-redefs [perms/can-read-audit-helper (fn [& args]
                                                        (swap! calls inc)
                                                        (apply real-helper args))]
              (binding [api/*current-user-permissions-set* (atom #{"/"})]
                (#'semantic.index/filter-read-permitted
                 (repeat 50 {:id "1:1" :model "indexed-entity" :collection_id readable-coll-id}))
                (is (= 1 @calls) "expected one can-read-audit-helper call for the single distinct collection_id")))))

        (testing "handles empty input"
          (is (= [] (#'semantic.index/filter-read-permitted []))))))))

;; The fast path in `filter-read-permitted` assumes every model listed in
;; `collection-id-only-search-models` has a `mi/can-read?` whose result is fully determined by
;; `:collection_id` + the current user's permissions set. This contract test catches drift in
;; two directions:
;;   1. A model is added to the set that doesn't actually satisfy the contract.
;;   2. An existing model's `can-read?` grows a check on a field other than `:collection_id`
;;      (e.g., `:archived`, `:type`, `:database_id`), silently making the fast path incorrect.
;; If the set gains a new entry, add a spec here — the `keys` check below will fail otherwise.
;; We vary the "should-be-irrelevant" fields across permutations so any new check in `can-read?`
;; against such a field will flip at least one permutation away from the helper and fail the test.
(def ^:private collection-id-only-model-test-specs
  "Maps each entry in `collection-id-only-search-models` to the t2 model used for dispatch.
  `indexed-entity` resolves to the parent Card at ingest time, so Card covers its contract."
  {"card"           :model/Card
   "metric"         :model/Card
   "dataset"        :model/Card
   "dashboard"      :model/Dashboard
   "indexed-entity" :model/Card})

(deftest collection-id-only-search-models-contract-test
  (testing "every entry in `collection-id-only-search-models` has a test spec"
    (is (= @#'semantic.index/collection-id-only-search-models
           (set (keys collection-id-only-model-test-specs)))
        "If you added a model to `collection-id-only-search-models`, add a corresponding entry to `collection-id-only-model-test-specs`."))

  (testing "mi/can-read? is a pure function of :collection_id for each listed model"
    ;; Synthetic coll-ids chosen to align with the perm-set strings below. No DB involvement —
    ;; the permission check only reads the instance map and the bound perm set.
    (let [perm-scenarios [["root perms"                42  #{"/"}]
                          ["no perms"                  42  #{}]
                          ["read on matching coll"     42  #{"/collection/42/read/"}]
                          ["read on other coll only"   42  #{"/collection/99/read/"}]
                          ["nil collection with root"  nil #{"/"}]
                          ["nil collection no perms"   nil #{}]]
          ;; Extra fields on the synthetic instance. If `can-read?` stays collection_id-only,
          ;; none of these should affect the result. A future `can-read?` that gates on any of
          ;; them will diverge from the helper for at least one permutation.
          extra-fields   [{}
                          {:archived true}
                          {:archived false}
                          {:type :question}
                          {:type :model}
                          {:type :metric}
                          {:database_id 1}
                          {:dataset_query {}}]]
      (doseq [[search-model t2-model] collection-id-only-model-test-specs
              [label coll-id perms]   perm-scenarios
              extras                  extra-fields]
        (let [instance (t2/instance t2-model (assoc extras :collection_id coll-id))]
          (binding [api/*current-user-permissions-set* (atom perms)]
            (let [slow-path (boolean (mi/can-read? instance))
                  fast-path (boolean (perms/can-read-audit-helper :model/Card {:collection_id coll-id}))]
              (is (= slow-path fast-path)
                  (format "%s %s extras=%s: fast path=%s mi/can-read?=%s. If these disagree, `can-read?` likely depends on a field other than `:collection_id`, so removing this model from `collection-id-only-search-models` is required."
                          search-model label extras fast-path slow-path)))))))))

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
