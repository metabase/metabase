(ns metabase.models.model-index-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.async :as qp.async]
            [metabase.test :as mt]))

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 2000)])))

(deftest quick-run-through
  (mt/dataset sample-dataset
    (let [query (mt/mbql-query products)]
      (mt/with-temp* [Card [model {:dataset true
                                   :dataset_query query
                                   :result_metadata (result-metadata-for-query query)}]]
        (mt/user-http-request :rasta :post 200 "/model-index"
                              {:model_id (:id model)
                               :pk_ref (mt/$ids $products.id)
                               :value_ref (mt/$ids $products.title)})))))
