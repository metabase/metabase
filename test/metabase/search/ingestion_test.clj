(ns metabase.search.ingestion-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.test :as mt]))

(deftest extract-model-and-id
  (is (= ["action" "1895"] (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.id]])))
  (is (= ["action" "2000"] (#'search.ingestion/extract-model-and-id ["action" [:= :this.id 2000]])))
  (is (nil? (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.model_id]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= 1901 :this.id] [:= true true] [:= "Card" "Card"]]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.model_id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["indexed-entity" [:and [:= 26 :this.model_index_id] [:= 38004300 :this.model_pk]]]))))

(deftest searchable-text-test
  (testing "searchable-text with vector format (legacy)"
    (let [spec-fn (constantly {:search-terms [:name :description]})
          record  {:model       "test"
                   :name        "Test Name"
                   :description "Test Description"
                   :other-field "Other Value"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "Test Name Test Description"
               (#'search.ingestion/searchable-text record))))))

  (testing "searchable-text with map format and transforms"
    (let [spec-fn              (constantly {:search-terms {:name        search.spec/explode-camel-case
                                                           :description true}})
          record               {:model       "test"
                                :name        "CamelCaseTest"
                                :description "Simple description"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "CamelCaseTest Camel Case Test Simple description"
               (#'search.ingestion/searchable-text record))))))

  (testing "searchable-text filters out blank values"
    (let [spec-fn (constantly {:search-terms [:name :description :empty-field]})
          record  {:model       "test"
                   :name        "Test Name"
                   :description "  " ;; whitespace only
                   :empty-field nil}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "Test Name"
               (#'search.ingestion/searchable-text record)))))))

(deftest embeddable-text-test
  (testing "embeddable-text with vector format"
    (let [spec-fn (constantly {:search-terms [:name :description]})
          record  {:model       "card"
                   :name        "Sales Dashboard"
                   :description "Shows quarterly sales data"
                   :other-field "Other Value"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[card]\nname: Sales Dashboard\ndescription: Shows quarterly sales data"
               (#'search.ingestion/embeddable-text record))))))

  (testing "embeddable-text with map format"
    (let [spec-fn (constantly {:search-terms {:name        true
                                              :description true}})
          record  {:model       "dashboard"
                   :name        "Test Dashboard"
                   :description "A test dashboard"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[dashboard]\nname: Test Dashboard\ndescription: A test dashboard"
               (#'search.ingestion/embeddable-text record))))))

  (testing "embeddable-text filters out blank values"
    (let [spec-fn (constantly {:search-terms [:name :description :empty-field]})
          record  {:model       "card"
                   :name        "Test Card"
                   :description "  "
                   :empty-field nil}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[card]\nname: Test Card"
               (#'search.ingestion/embeddable-text record))))))

  (testing "embeddable-text does not apply transform functions"
    (let [spec-fn (constantly {:search-terms {:name search.spec/explode-camel-case}})
          record  {:model "table"
                   :name  "CamelCaseTest"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[table]\nname: CamelCaseTest"
               (#'search.ingestion/embeddable-text record))
            "Transformation functions should not be applied to embeddable text for semantic search")))))

(deftest search-term-columns-test
  (testing "search-term-columns with vector format"
    (is (= #{:name :description}
           (set (#'search.ingestion/search-term-columns [:name :description])))))

  (testing "search-term-columns with map format"
    (is (= #{:name :description}
           (set (#'search.ingestion/search-term-columns {:name identity
                                                         :description nil}))))))

(deftest search-items-count-test
  (testing "search-items-count returns correct count with various searchable items"
    (mt/with-empty-h2-app-db!
      (with-redefs [search.spec/search-models #{"card" "dashboard"}]
        (mt/with-temp [:model/Collection coll {:name "Test Collection"}
                       :model/Card       _    {:name "Test Card 1"  :collection_id (:id coll)}
                       :model/Card       _    {:name "Test Card 2"  :collection_id (:id coll)}
                       :model/Dashboard  _    {:name "Test Dashboard 1" :collection_id (:id coll)}
                       :model/Dashboard  _    {:name "Test Dashboard 2" :collection_id (:id coll)}]
          (let [n (search.ingestion/search-items-count)]
            (is (= 4 n))))))))
