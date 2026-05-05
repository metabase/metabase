(ns ^:mb/driver-tests metabase.query-processor.middleware.parameters.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.parameters.native :as qp.native]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]))

(deftest ^:parallel include-card-parameters-test
  (testing "Expanding a Card reference in a native query should include its parameters (#12236)"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id            1
                        :dataset-query (lib.tu.macros/mbql-query orders
                                         {:filter      [:between $total 30 60]
                                          :aggregation [[:aggregation-options
                                                         [:count-where [:starts-with $product-id->products.category "G"]]
                                                         {:name "G Monies", :display-name "G Monies"}]]
                                          :breakout    [!month.created-at]})}]})
          query (lib/query
                 mp
                 {:database (meta/id)
                  :type     :native
                  :native   {:query         "SELECT * FROM {{#1}}"
                             :template-tags {"#1" {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                                                   :name         "#1"
                                                   :display-name "#1"
                                                   :type         :card
                                                   :card-id      1}}}})]
      (mt/with-driver :h2
        (is (malli= [:map
                     [:native ms/NonBlankString]
                     [:params [:= ["G%"]]]]
                    (qp.native/expand-stage mp (lib/query-stage query 0))))))))

(deftest ^:parallel native-query-with-card-template-tag-include-referenced-card-ids-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :nested-queries :native-parameter-card-reference)
    (testing (str "Expanding a Card template tag should add the card ID(s) to"
                  " `:query-permissions/referenced-card-ids`")
      (let [mp    (lib.tu/mock-metadata-provider
                   (mt/metadata-provider)
                   {:cards [{:id            1
                             :collection-id nil
                             :dataset-query (mt/mbql-query venues {:limit 2})}
                            {:id            2
                             :collection-id nil
                             :dataset-query (mt/native-query
                                             {:query         (mt/native-query-with-card-template-tag driver/*driver* "card")
                                              :template-tags {"card" {:name         "card"
                                                                      :display-name "card"
                                                                      :type         :card
                                                                      :card-id      1}}})}]})
            query (lib/query
                   mp
                   (mt/native-query {:query                                 (mt/native-query-with-card-template-tag driver/*driver* "card")
                                     :template-tags                         {"card" {:name         "card"
                                                                                     :display-name "card"
                                                                                     :type         :card
                                                                                     :card-id      2}}
                                     :query-permissions/referenced-card-ids #{Integer/MAX_VALUE}}))]
        ;; this SHOULD NOT include `1`, because Card 1 is only referenced indirectly; if you have permissions to run
        ;; Card 2 that should be sufficient to run it even if it references Card 1 (see #15131)
        (is (=? {:query-permissions/referenced-card-ids #{Integer/MAX_VALUE 2}}
                (qp.native/expand-stage mp (lib/query-stage query 0))))))))
