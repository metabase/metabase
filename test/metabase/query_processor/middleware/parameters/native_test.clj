(ns metabase.query-processor.middleware.parameters.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :refer [Card]]
   [metabase.query-processor.middleware.parameters.native :as qp.native]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest include-card-parameters-test
  (testing "Expanding a Card reference in a native query should include its parameters (#12236)"
    (mt/dataset sample-dataset
      (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query orders
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
          (mt/with-driver :h2
            (mt/with-everything-store
              (is (schema= {:native   su/NonBlankString
                            :params   (s/eq ["G%"])
                            s/Keyword s/Any}
                           (qp.native/expand-inner query))))))))))
