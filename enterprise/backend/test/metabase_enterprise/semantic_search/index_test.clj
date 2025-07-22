(ns metabase-enterprise.semantic-search.index-test
  (:require
   [clojure.test :refer :all]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest create-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index!)]
      ;; open-temp-index-table! creates the temp table, so drop it in order to test create!.
      (semantic.index/drop-index-table! semantic.tu/db semantic.tu/mock-index)
      (testing "index table is not present before create!"
        (is (not (semantic.tu/table-exists-in-db? (:table-name @index-ref))))
        (is (not (semantic.tu/table-has-index? (:table-name @index-ref) (:index-name @index-ref)))))
      (testing "index table is present after create!"
        (semantic.index/create-index-table! semantic.tu/db semantic.tu/mock-index {:force-reset? false})
        (is (semantic.tu/table-exists-in-db? (:table-name @index-ref)))
        (is (semantic.tu/table-has-index? (:table-name @index-ref) (:index-name @index-ref)))))))

(deftest drop-index-table!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [index-ref (semantic.tu/open-temp-index!)]
      (testing "index table is present before drop!"
        (is (semantic.tu/table-exists-in-db? (:table-name @index-ref))))
      (testing "index table is not present after drop!"
        (semantic.index/drop-index-table! semantic.tu/db semantic.tu/mock-index)
        (is (not (semantic.tu/table-exists-in-db? (:table-name @index-ref))))))))

(defn- decode-embedding
  "Decode `row`s `:embedding`."
  [row]
  (update row :embedding #'semantic.index/decode-pgobject))

#_:clj-kondo/ignore
(defn- full-index
  "Query the full index table and return all documents with decoded embeddings.
  Not used in tests, but useful for debugging."
  []
  (->> (jdbc/execute! semantic.tu/db
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name semantic.tu/mock-index)))
                          semantic.index/sql-format-quoted))
       (map #'semantic.index/unqualify-keys)
       (map decode-embedding)))

(defn- query-embeddings
  [{:keys [model model_id]}]
  (->> (jdbc/execute! semantic.tu/db
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name semantic.tu/mock-index)))
                          (sql.helpers/where :and
                                             [:= :model model]
                                             [:= :model_id model_id])
                          semantic.index/sql-format-quoted))
       (map #'semantic.index/unqualify-keys)
       (mapv decode-embedding)))

(defn- check-index-has-no-mock-card []
  (testing "no mock card present"
    (is (= []
           (query-embeddings {:model "card"
                              :model_id "123"})))))

(defn- check-index-has-no-mock-dashboard []
  (testing "no mock dashboard present"
    (is (= []
           (query-embeddings {:model "dashboard"
                              :model_id "456"})))))

(defn- check-index-has-no-mock-docs []
  (let [{:keys [table-name]}     semantic.tu/mock-index
        table-exists-sql         "select exists(select * from information_schema.tables where table_name = ?) table_exists"
        [{:keys [table_exists]}] (jdbc/execute! semantic.tu/db [table-exists-sql table-name])]
    (when table_exists
      (check-index-has-no-mock-card)
      (check-index-has-no-mock-dashboard))))

(defn- check-index-has-mock-card []
  (is (= [{:model "card"
           :model_id "123"
           :creator_id 1
           :content "Dog Training Guide"
           :embedding (semantic.tu/get-mock-embedding "Dog Training Guide")}]
         (query-embeddings {:model "card"
                            :model_id "123"}))))

(defn- check-index-has-mock-dashboard []
  (is (= [{:model "dashboard"
           :model_id "456"
           :creator_id 2
           :content "Elephant Migration"
           :embedding (semantic.tu/get-mock-embedding "Elephant Migration")}]
         (query-embeddings {:model "dashboard"
                            :model_id "456"}))))

(defn- check-index-has-mock-docs []
  (check-index-has-mock-card)
  (check-index-has-mock-dashboard))

(deftest upsert-index!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (check-index-has-no-mock-docs)
      (testing "upsert-index! returns nil if you pass it an empty collection"
        (is (nil? (semantic.tu/upsert-index! [])))
        (check-index-has-no-mock-docs))
      (testing "upsert-index! works on a fresh index"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! semantic.tu/mock-documents)))
        (check-index-has-mock-docs))
      (testing "upsert-index! works with duplicate documents"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! semantic.tu/mock-documents)))
        (check-index-has-mock-docs)))))

(deftest delete-from-index!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (check-index-has-no-mock-docs)
      (testing "upsert-index! before delete!"
        (is (= {"card" 1, "dashboard" 1}
               (semantic.tu/upsert-index! semantic.tu/mock-documents)))
        (check-index-has-mock-docs))
      (testing "delete-from-index! returns nil if you pass it an empty collection"
        (is (nil? (semantic.tu/delete-from-index! "card" [])))
        (check-index-has-mock-docs))
      (testing "delete-from-index! works for cards"
        (is (= {"card" 1}
               (semantic.tu/delete-from-index! "card" ["123"])))
        (check-index-has-no-mock-card)
        (check-index-has-mock-dashboard))
      (testing "delete-from-index! works for dashboards"
        (is (= {"dashboard" 1}
               (semantic.tu/delete-from-index! "dashboard" ["456"])))
        (check-index-has-no-mock-docs))
      (testing "delete-from-index! doesn't complain if you delete a document that doesn't exist"
        (is (= {"card" 1}
               (semantic.tu/delete-from-index! "card" ["123"])))
        (check-index-has-no-mock-docs)))))

(deftest batch-process-mock-docs!-test
  (mt/with-premium-features #{:semantic-search}
    (with-open [_ (semantic.tu/open-temp-index!)]
      (binding [semantic.index/*batch-size* 1]
        (let [extra-ids (->> (range 1337 1347) (map str))
              extra-docs (map (fn [id doc]
                                (assoc doc :id id))
                              extra-ids
                              (flatten (repeat semantic.tu/mock-documents)))
              mock-docs (into semantic.tu/mock-documents extra-docs)]
          (testing "ensure populate! upsert! and delete! work when batch size is exceeded"
            (check-index-has-no-mock-docs)
            (testing "upsert-index! with batch processing"
              (is (= {"card" 6, "dashboard" 6}
                     (semantic.tu/upsert-index! mock-docs)))
              (check-index-has-mock-docs))
            (testing "delete-from-index! with batch processing"
              (testing "delete just the card"
                (is (= {"card" 11}
                       (semantic.tu/delete-from-index! "card" (into ["123"] extra-ids))))
                (check-index-has-no-mock-card)
                (check-index-has-mock-dashboard)))
            (testing "delete the dashboard"
              (is (= {"dashboard" 11}
                     (semantic.tu/delete-from-index! "dashboard" (into ["456"] extra-ids))))
              (check-index-has-no-mock-docs))))))))

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
                     (query-embeddings {:model "card" :model_id "1"})))

              (is (= [{:model "card" :model_id "2" :creator_id 2
                       :content "Elephant Migration"
                       :embedding (semantic.tu/get-mock-embedding "Elephant Migration")}]
                     (query-embeddings {:model "card" :model_id "2"})))

              (is (= [{:model "card" :model_id "3" :creator_id 3
                       :content "Tiger Conservation"
                       :embedding (semantic.tu/get-mock-embedding "Tiger Conservation")}]
                     (query-embeddings {:model "card" :model_id "3"}))))))))))
