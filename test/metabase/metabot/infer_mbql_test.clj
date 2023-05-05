(ns metabase.metabot.infer-mbql-test
  (:require
    [cheshire.core :as json]
    [clojure.test :refer :all]
    [metabase.metabot.test-models :as test-models]
    [metabase.metabot.client :as metabot-client]
    [metabase.metabot.infer-mbql :as infer-mbql]
    [metabase.models :refer [Card Database Field Table]]
    [metabase.test :as mt]))

(defn- mock-llm-endpoint [metabot-response usage]
  (constantly
    {:usage usage
     :choices
     [{:message
       {:content (json/generate-string metabot-response)}}]}))

(deftest infer-mbql-descriptive-stats-test
  (testing "infer-mbql with prompt \"Provide descriptive stats for sales per state\""
    (mt/dataset sample-dataset
      (let [metabot-response {:aggregation [["count"]
                                            ["min" (mt/id :orders :total)]
                                            ["max" (mt/id :orders :total)]
                                            ["avg" (mt/id :orders :total)]
                                            ["sum" (mt/id :orders :total)]]
                              :breakout    [(mt/id :people :state)]}
            usage            {:prompt_tokens 1820 :completion_tokens 55 :total_tokens 1875}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model "Provide descriptive stats for sales per state")]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:aggregation  [[:count {}]
                                                  [:min {} [:field {} (mt/id :orders :total)]]
                                                  [:max {} [:field {} (mt/id :orders :total)]]
                                                  [:avg {} [:field {} (mt/id :orders :total)]]
                                                  [:sum {} [:field {} (mt/id :orders :total)]]]
                                   :breakout     [[:field {:join-alias "People - User"} (mt/id :people :state)]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql))))))))
  )

(deftest infer-mbql-five-average-highest-rated-products-test
  (testing "infer-mbql with prompt \"What are the 5 highest rated products by average product rating?\""
    (mt/dataset sample-dataset
      (let [prompt           "What are the 5 highest rated products by average product rating?"
            metabot-response {:aggregation [["avg" (mt/id :products :rating)]]
                              :breakout    [(mt/id :orders :product_id)]
                              :order-by    [["desc" {:aggregation 0}]]
                              :limit       5}
            usage            {:prompt_tokens 1826 :completion_tokens 40 :total_tokens 1866}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:aggregation  [[:avg {} [:field {:join-alias "Products"} (mt/id :products :rating)]]]
                                   :breakout     [[:field {} (mt/id :orders :product_id)]]
                                   :order-by     [[:desc [:aggregation 0]]]
                                   :limit        5
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql)))))))))

(deftest infer-mbql-ten-individual-highest-rated-products-test
  (testing "infer-mbql with prompt \"What are the 10 highest rated individual products?\""
    (mt/dataset sample-dataset
      (let [prompt           "What are the 10 highest rated individual products?"
            metabot-response {:fields   [(mt/id :products :title)
                                         (mt/id :products :rating)]
                              :limit    10
                              :order-by [["desc" {:field_id (mt/id :products :rating)}]]}
            usage            {:prompt_tokens 1823 :completion_tokens 46 :total_tokens 1869}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:fields       [[:field {:join-alias "Products"} (mt/id :products :title)]
                                                  [:field {:join-alias "Products"} (mt/id :products :rating)]]
                                   :limit        10
                                   :order-by     [[:desc [:field {:join-alias "Products"} (mt/id :products :rating)]]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql)))))))))

(deftest infer-products-rated-gt-two-test
  (testing "infer-mbql with prompt \"What products have a rating greater than 2.0?\""
    (mt/dataset sample-dataset
      (let [prompt           "What products have a rating greater than 2.0?"
            metabot-response {:fields  [(mt/id :orders :product_id)
                                        (mt/id :products :title)
                                        (mt/id :products :rating)]
                              :filters [[">" (mt/id :products :rating) {:value 2.0}]]}
            usage            {:prompt_tokens 1825 :completion_tokens 35 :total_tokens 1860}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:fields       [[:field {} (mt/id :orders :product_id)]
                                                  [:field {:join-alias "Products"} (mt/id :products :title)]
                                                  [:field {:join-alias "Products"} (mt/id :products :rating)]]
                                   :filters      [[:> {} [:field {:join-alias "Products"} (mt/id :products :rating)] 2.0]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql)))))))))

(deftest sales-where-price-comp-discount-test
  (testing "infer-mbql with prompt \"How many sales had a product price greater than the discount?\""
    (mt/dataset sample-dataset
      (let [prompt           "How many sales had a product price greater than the discount?"
            metabot-response {:aggregation [["count"]]
                              :filters     [[">" (mt/id :products :price) {:field_id (mt/id :orders :discount)}]]}
            usage            {:prompt_tokens 1861 :completion_tokens 24 :total_tokens 1885}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:aggregation  [[:count {}]]
                                   :filters      [[:>
                                                   {}
                                                   [:field {:join-alias "Products"} (mt/id :products :price)]
                                                   [:field {} (mt/id :orders :discount)]]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage {:prompt_tokens 1861 :completion_tokens 24 :total_tokens 1885}}
                     mbql))))))))
  (testing "infer-mbql with prompt \"How many sales had a product price less than the discount?\""
    (mt/dataset sample-dataset
      (let [prompt           "How many sales had a product price less than the discount?"
            metabot-response {:aggregation [["count"]]
                              :filters     [["<" (mt/id :products :price) {:field_id (mt/id :orders :discount)}]]}
            usage            {:prompt_tokens 1861 :completion_tokens 27 :total_tokens 1888}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:aggregation  [[:count {}]]
                                   :filters      [[:<
                                                   {}
                                                   [:field {:join-alias "Products"} (mt/id :products :price)]
                                                   [:field {} (mt/id :orders :discount)]]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql)))))))))

(deftest infer-sales-in-bounds-in-categories-test
  (testing "infer-mbql with prompt \"Show me total sales grouped by category where rating is between 1.5 and 3.4.\""
    (mt/dataset sample-dataset
      (let [prompt           "Show me total sales grouped by category where rating is between 1.5 and 3.4."
            metabot-response {:aggregation [["sum" (mt/id :orders :subtotal)]]
                              :breakout    [(mt/id :products :category)]
                              :filters     [[">=" (mt/id :products :rating) {:value 1.5}]
                                            ["<=" (mt/id :products :rating) {:value 3.4}]]}
            usage            {:prompt_tokens 1870 :completion_tokens 62 :total_tokens 1932}]
        (mt/with-temp* [Card [{model-id :id :as model} (test-models/total-orders)]]
          (with-redefs [metabot-client/*create-chat-completion-endpoint* (mock-llm-endpoint metabot-response usage)]
            (let [mbql (infer-mbql/infer-mbql model prompt)]
              (is (= {:database  (mt/id)
                      :lib/type  :mbql/query
                      :stages    [{:aggregation  [[:sum {} [:field {} (mt/id :orders :subtotal)]]]
                                   :breakout     [[:field {:join-alias "Products"} (mt/id :products :category)]]
                                   :filters      [[:>= {} [:field {:join-alias "Products"} (mt/id :products :rating)] 1.5]
                                                  [:<= {} [:field {:join-alias "Products"} (mt/id :products :rating)] 3.4]]
                                   :source-table (format "card__%s" model-id)
                                   :lib/type     :mbql.stage/mbql}]
                      :llm/usage usage}
                     mbql)))))))))