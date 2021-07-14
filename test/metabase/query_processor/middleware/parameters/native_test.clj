(ns metabase.query-processor.middleware.parameters.native-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.middleware.parameters.native :as params.native]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(deftest include-card-parameters-test
  (testing "Expanding a Card reference in a native query should include its parameters (#12236)"
    (mt/dataset sample-dataset
      (mt/with-temp Card [card {:dataset_query (mt/mbql-query orders
                                                 {:filter      [:between $total 30 60]
                                                  :aggregation [[:aggregation-options
                                                                 [:count-where [:starts-with $product_id->products.category "G"]]
                                                                 {:name "G Monies", :display-name "G Monies"}]]
                                                  :breakout    [!month.created_at]})}]
        (let [card-tag (str "#" (u/the-id card))
              query    {:native        (format "SELECT * FROM {{%s}}" card-tag)
                        :template-tags {card-tag
                                        {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                                         :name         card-tag
                                         :display-name card-tag
                                         :type         :card
                                         :card-id      (u/the-id card)}}}]
          (binding [driver/*driver* :h2]
            (is (schema= {:native   su/NonBlankString
                          :params   (s/eq ["G%"])
                          s/Keyword s/Any}
                         (params.native/expand-inner query)))))))))
