(ns metabase.query-processor.middleware.parameters.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models.card :refer [Card]]
   [metabase.query-processor.middleware.parameters.native :as qp.native]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest include-card-parameters-test
  (testing "Expanding a Card reference in a native query should include its parameters (#12236)"
    (mt/dataset test-data
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
            (mt/with-metadata-provider (mt/id)
              (is (malli= [:map
                           [:native ms/NonBlankString]
                           [:params [:= ["G%"]]]]
                          (qp.native/expand-inner query))))))))))

(deftest ^:parallel native-query-with-card-template-tag-include-referenced-card-ids-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :nested-queries :native-parameter-card-reference)
    (testing "Expanding a Card template tag should add the card ID(s) to `:metabase.models.query.permissions/referenced-card-ids`"
      (mt/with-temp [:model/Card {card-1-id :id} {:collection_id nil
                                                  :dataset_query (mt/mbql-query venues {:limit 2})}
                     :model/Card {card-2-id :id} {:collection_id nil
                                                  :dataset_query (mt/native-query
                                                                   {:query         (mt/native-query-with-card-template-tag driver/*driver* "card")
                                                                    :template-tags {"card" {:name         "card"
                                                                                            :display-name "card"
                                                                                            :type         :card
                                                                                            :card-id      card-1-id}}})}]
        (testing (format "Card 1 ID = %d, Card 2 ID = %d" card-1-id card-2-id)
          ;; this SHOULD NOT include `card-1-id`, because Card 1 is only referenced indirectly; if you have permissions
          ;; to run Card 2 that should be sufficient to run it even if it references Card 1 (see #15131)
          (mt/with-metadata-provider (mt/id)
            (is (=? {:metabase.models.query.permissions/referenced-card-ids #{Integer/MAX_VALUE card-2-id}}
                    (qp.native/expand-inner {:query         (mt/native-query-with-card-template-tag driver/*driver* "card")
                                             :template-tags {"card" {:name         "card"
                                                                     :display-name "card"
                                                                     :type         :card
                                                                     :card-id      card-2-id}}
                                             :metabase.models.query.permissions/referenced-card-ids #{Integer/MAX_VALUE}})))))))))
