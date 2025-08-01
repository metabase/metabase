(ns metabase-enterprise.semantic-search.index-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
<<<<<<< HEAD
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]))
=======
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]))
>>>>>>> nm-semantic-search-in-metabase

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest create-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index!)]
      ;; open-temp-index-table! creates the temp table, so drop it in order to test create!.
      (semantic.index/drop-index-table! semantic.tu/db semantic.tu/mock-index)
      (testing "index table is not present before create!"
        (is (not (semantic.tu/table-exists-in-db? (:table-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/hnsw-index-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-index-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (semantic.index/fts-native-index-name @index-ref)))))
      (testing "index table is present after create!"
        (semantic.index/create-index-table-if-not-exists! semantic.tu/db semantic.tu/mock-index {:force-reset? false})
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
        (semantic.index/drop-index-table! semantic.tu/db semantic.tu/mock-index)
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

(deftest upsert-index-batched-embeddings-pairing-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (testing "Documents with different searchable texts get associated with their correct embeddings"
        (let [test-documents [{:model "card"
                               :id "1"
                               :searchable_text "Dog Training Guide"
                               :creator_id 1
                               :legacy_input {:model "card" :id "1"}
                               :metadata {}}
                              {:model "card"
                               :id "2"
                               :searchable_text "Elephant Migration"
                               :creator_id 2
                               :legacy_input {:model "card" :id "2"}
                               :metadata {}}
                              {:model "card"
                               :id "3"
                               :searchable_text "Tiger Conservation"
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

(deftest filter-by-collection-test
  (testing "filter-by-collection function filters documents based on personal collection preferences"
    (let [user1-id (mt/user->id :rasta)
          user2-id (mt/user->id :crowberto)
          user1-personal-coll-id (u/the-id (collection/user->personal-collection user1-id))
          user2-personal-coll-id (u/the-id (collection/user->personal-collection user2-id))]
      (mt/with-temp
        [:model/Collection {shared-coll-id :id} {:name "Shared Collection"}
         :model/Collection {user1-sub-coll-id :id} {:location (str "/" user1-personal-coll-id "/") :name "User1 Sub"}
         :model/Collection {user2-sub-coll-id :id} {:location (str "/" user2-personal-coll-id "/") :name "User2 Sub"}]

        (let [docs [{:id "doc1" :model "card" :collection_id user1-personal-coll-id}
                    {:id "doc2" :model "card" :collection_id user2-personal-coll-id}
                    {:id "doc3" :model "card" :collection_id shared-coll-id}
                    {:id "doc4" :model "card" :collection_id nil}
                    {:id "doc5" :model "card" :collection_id user1-sub-coll-id}
                    {:id "doc6" :model "card" :collection_id user2-sub-coll-id}]]

          (testing "filter-type 'all' returns all documents unchanged"
            (let [context {:filter-items-in-personal-collection "all" :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)]
              (is (= 6 (count result)))
              (is (= (set (map :id docs)) (set (map :id result))))))

          (testing "filter-type nil defaults to 'all' behavior"
            (let [context {:filter-items-in-personal-collection nil :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)]
              (is (= 6 (count result)))
              (is (= (set (map :id docs)) (set (map :id result))))))

          (testing "filter-type 'only-mine' returns only current user's personal collection items"
            (let [context {:filter-items-in-personal-collection "only-mine" :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)
                  result-ids (set (map :id result))]
              (is (= #{"doc1" "doc5"} result-ids))))

          (testing "filter-type 'only' returns all personal collection items (any user)"
            (let [context {:filter-items-in-personal-collection "only" :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)
                  result-ids (set (map :id result))]
              (is (= #{"doc1" "doc2" "doc5" "doc6"} result-ids))))

          (testing "filter-type 'exclude' returns only shared and uncollected items"
            (let [context {:filter-items-in-personal-collection "exclude" :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)
                  result-ids (set (map :id result))]
              (is (= #{"doc3" "doc4"} result-ids))))

          (testing "filter-type 'exclude-others' returns user's personal items plus shared/uncollected items"
            (let [context {:filter-items-in-personal-collection "exclude-others" :current-user-id user1-id}
                  result (#'semantic.index/filter-by-collection docs context)
                  result-ids (set (map :id result))]
              (is (= #{"doc1" "doc3" "doc4" "doc5"} result-ids)))))))))

(deftest filter-can-read-indexed-entity-test
  (mt/with-premium-features #{:semantic-search}
    (testing "filter-can-read-indexed-entity function"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card model-1 (assoc (mt/card-with-source-metadata-for-query
                                                 (mt/mbql-query products {:fields [$id $title]
                                                                          :limit 1}))
                                                :type "model"
                                                :name "Readable Model"
                                                :database_id (mt/id)
                                                :collection_id coll-id)
                     :model/Card model-2 (assoc (mt/card-with-source-metadata-for-query
                                                 (mt/mbql-query products {:fields [$id $title]
                                                                          :limit 1}))
                                                :type "model"
                                                :name "Unreadable Model"
                                                :database_id (mt/id)
                                                :collection_id coll-id)
                     :model/ModelIndex model-index-1 {:model_id (:id model-1)
                                                      :pk_ref (mt/$ids :products $id)
                                                      :value_ref (mt/$ids :products $title)
                                                      :schedule "0 0 0 * * *"
                                                      :state "initial"
                                                      :creator_id (mt/user->id :rasta)}
                     :model/ModelIndex model-index-2 {:model_id (:id model-2)
                                                      :pk_ref (mt/$ids :products $id)
                                                      :value_ref (mt/$ids :products $title)
                                                      :schedule "0 0 0 * * *"
                                                      :state "initial"
                                                      :creator_id (mt/user->id :rasta)}]
        (let [indexed-entity-docs [{:id (str (:id model-index-1) ":123")
                                    :model "indexed-entity"
                                    :content "Test Entity 1"}
                                   {:id (str (:id model-index-2) ":456")
                                    :model "indexed-entity"
                                    :content "Test Entity 2"}
                                   {:id "invalid:789"
                                    :model "indexed-entity"
                                    :content "Invalid Entity"}]]

          (testing "returns all entities when user can read all parent cards"
            (binding [api/*current-user-permissions-set* (atom #{"/"})]
              (let [result (#'semantic.index/filter-can-read-indexed-entity indexed-entity-docs)]
                (is (= 2 (count result)))
                (is (= #{(str (:id model-index-1) ":123") (str (:id model-index-2) ":456")}
                       (set (map :id result)))))))

          (testing "returns no entities when user cannot read any parent cards"
            (binding [api/*current-user-permissions-set* (atom #{})]
              (let [result (#'semantic.index/filter-can-read-indexed-entity indexed-entity-docs)]
                (is (= 0 (count result))))))

          (testing "returns subset when user can read some parent cards"
            (with-redefs [mi/can-read? (fn [card] (= (:id card) (:id model-1)))]
              (let [result (#'semantic.index/filter-can-read-indexed-entity indexed-entity-docs)]
                (is (= 1 (count result)))
                (is (= (str (:id model-index-1) ":123") (:id (first result)))))))

          (testing "handles empty input"
            (is (= [] (#'semantic.index/filter-can-read-indexed-entity []))))

          (testing "handles invalid entity IDs"
            (let [invalid-only-docs [{:id "invalid:789" :model "indexed-entity" :content "Invalid"}]]
              (is (= [] (#'semantic.index/filter-can-read-indexed-entity invalid-only-docs)))))

          (testing "handles non-existent model indexes"
            (let [non-existent-docs [{:id "99999:123" :model "indexed-entity" :content "Non-existent"}]]
              (is (= [] (#'semantic.index/filter-can-read-indexed-entity non-existent-docs))))))))))
