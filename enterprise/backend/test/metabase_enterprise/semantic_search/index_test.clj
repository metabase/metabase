(ns metabase-enterprise.semantic-search.index-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest create-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        ;; with-temp-index-table! creates the temp table, so drop it in order to test create!.
        (semantic.index/drop-index-table!)
        (let [embedding-index-pattern "embedding_hnsw_index_%"]
          (testing "index table is not present before create!"
            (is (not (semantic.tu/table-exists-in-db? semantic.index/*index-table-name*)))
            (is (not (semantic.tu/table-has-index? semantic.index/*index-table-name* embedding-index-pattern))))
          (testing "index table is present after create!"
            (semantic.index/create-index-table! {:force-reset? false})
            (is (semantic.tu/table-exists-in-db? semantic.index/*index-table-name*))
            (is (semantic.tu/table-has-index? semantic.index/*index-table-name* embedding-index-pattern))))))))

(deftest drop-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        ;; with-temp-index-table! creates the temp table
        (testing "index table is present before drop!"
          (is (semantic.tu/table-exists-in-db? semantic.index/*index-table-name*)))
        (testing "index table is not present after drop!"
          (semantic.index/drop-index-table!)
          (is (not (semantic.tu/table-exists-in-db? semantic.index/*index-table-name*))))))))

(defn- decode-embedding
  "Decode `row`s `:embedding`."
  [row]
  (update row :embedding #'semantic.index/decode-pgobject))

(defn- query-index
  [{:keys [model model_id]}]
  (->> (jdbc/execute! @semantic.db/data-source
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from semantic.index/*index-table-name*)
                          (sql.helpers/where :and
                                             [:= :model model]
                                             [:= :model_id model_id])
                          sql/format))
       (map #'semantic.index/unqualify-keys)
       (map decode-embedding)))

(defn- check-index-has-no-mock-card []
  (testing "no mock card present"
    (is (= []
           (query-index {:model "card"
                         :model_id "123"})))))

(defn- check-index-has-no-mock-dashboard []
  (testing "no mock dashboard present"
    (is (= []
           (query-index {:model "dashboard"
                         :model_id "456"})))))

(defn- check-index-has-no-mock-docs []
  (check-index-has-no-mock-card)
  (check-index-has-no-mock-dashboard))

(defn- check-index-has-mock-card []
  (is (= [{:model "card"
           :model_id "123"
           :creator_id 1
           :content "Dog Training Guide"
           :embedding (semantic.tu/get-mock-embedding "Dog Training Guide")}]
         (query-index {:model "card"
                       :model_id "123"}))))

(defn- check-index-has-mock-dashboard []
  (is (= [{:model "dashboard"
           :model_id "456"
           :creator_id 2
           :content "Elephant Migration"
           :embedding (semantic.tu/get-mock-embedding "Elephant Migration")}]
         (query-index {:model "dashboard"
                       :model_id "456"}))))

(defn- check-index-has-mock-docs []
  (check-index-has-mock-card)
  (check-index-has-mock-dashboard))

(deftest populate-index!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        (check-index-has-no-mock-docs)
        (testing "populate-index! returns nil if you pass it an empty collection"
          (is (nil? (semantic.index/populate-index! [])))
          (check-index-has-no-mock-docs))
        (testing "populate-index! works on a fresh index"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.index/populate-index! semantic.tu/mock-documents)))
          (check-index-has-mock-docs))
        (testing "populate-index! throws if you try to insert duplicate documents"
          (is (thrown-with-msg?
               org.postgresql.util.PSQLException
               #"ERROR: duplicate key value violates unique constraint.*"
               (semantic.index/populate-index! semantic.tu/mock-documents))))))))

(deftest upsert-index!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        (check-index-has-no-mock-docs)
        (testing "upsert-index! returns nil if you pass it an empty collection"
          (is (nil? (semantic.index/upsert-index! [])))
          (check-index-has-no-mock-docs))
        (testing "upsert-index! works on a fresh index"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.index/upsert-index! semantic.tu/mock-documents)))
          (check-index-has-mock-docs))
        (testing "upsert-index! works with duplicate documents"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.index/upsert-index! semantic.tu/mock-documents)))
          (check-index-has-mock-docs))))))

(deftest delete-from-index!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        (check-index-has-no-mock-docs)
        (testing "populate-index! before delete!"
          (is (= {"card" 1, "dashboard" 1}
                 (semantic.index/populate-index! semantic.tu/mock-documents)))
          (check-index-has-mock-docs))
        (testing "delete-from-index! returns nil if you pass it an empty collection"
          (is (nil? (semantic.index/delete-from-index! "card" [])))
          (check-index-has-mock-docs))
        (testing "delete-from-index! works for cards"
          (is (= {"card" 1}
                 (semantic.index/delete-from-index! "card" ["123"])))
          (check-index-has-no-mock-card)
          (check-index-has-mock-dashboard))
        (testing "delete-from-index! works for dashboards"
          (is (= {"dashboard" 1}
                 (semantic.index/delete-from-index! "dashboard" ["456"])))
          (check-index-has-no-mock-docs))
        (testing "delete-from-index! doesn't complain if you delete a document that doesn't exist"
          (is (= {"card" 1}
                 (semantic.index/delete-from-index! "card" ["123"])))
          (check-index-has-no-mock-docs))))))

(deftest batch-process-mock-docs!-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-mocked-embeddings!
      (semantic.tu/with-temp-index-table!
        (binding [semantic.index/*batch-size* 1]
          (let [extra-ids (->> (range 1337 1347) (map str))
                extra-docs (map (fn [id doc]
                                  (assoc doc :id id))
                                extra-ids
                                (flatten (repeat semantic.tu/mock-documents)))
                mock-docs (into semantic.tu/mock-documents extra-docs)]
            (testing "ensure populate! upsert! and delete! work when batch size is exceeded"
              (check-index-has-no-mock-docs)
              (testing "populate-index! with batch processing"
                (is (= {"card" 6, "dashboard" 6}
                       (semantic.index/populate-index! mock-docs)))
                (check-index-has-mock-docs))
              (testing "upsert-index! with batch processing"
                (is (= {"card" 6, "dashboard" 6}
                       (semantic.index/upsert-index! mock-docs)))
                (check-index-has-mock-docs))
              (testing "delete-from-index! with batch processing"
                (testing "delete just the card"
                  (is (= {"card" 11}
                         (semantic.index/delete-from-index! "card" (into ["123"] extra-ids))))
                  (check-index-has-no-mock-card)
                  (check-index-has-mock-dashboard))
                (testing "delete the dashboard"
                  (is (= {"dashboard" 11}
                         (semantic.index/delete-from-index! "dashboard" (into ["456"] extra-ids))))
                  (check-index-has-no-mock-docs))))))))))
