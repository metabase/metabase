(ns metabase.search.ingestion-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.ingestion :as search.ingestion]))

(deftest extract-model-and-id
  (is (= ["action" "1895"] (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.id]])))
  (is (= ["action" "2000"] (#'search.ingestion/extract-model-and-id ["action" [:= :this.id 2000]])))
  (is (nil? (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.model_id]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= 1901 :this.id] [:= true true] [:= "Card" "Card"]]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.model_id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["indexed-entity" [:and [:= 26 :this.model_index_id] [:= 38004300 :this.model_pk]]]))))
