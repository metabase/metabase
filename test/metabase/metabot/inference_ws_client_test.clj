(ns metabase.metabot.inference-ws-client-test
  (:require
    [clojure.test :refer :all]
    [malli.core :as mc]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.schema :as metabot-schema]))

(deftest bulk-embeddings-test
  (with-redefs [inference-ws-client/bulk-embeddings
                (fn
                  ([_base-url args]
                   (if (mc/validate inference-ws-client/embeddings-schema args)
                     (update-vals args (fn [_] (vec (repeatedly 10 rand))))
                     "INVALID ARGUMENTS!"))
                  ([args]
                   (if (mc/validate inference-ws-client/embeddings-schema args)
                     (update-vals args (fn [_] (vec (repeatedly 10 rand))))
                     "INVALID ARGUMENTS!")))]
    (let [input  {"A" "This is a test"
                  "B" "These are some embeddings"}
          result (inference-ws-client/bulk-embeddings input)]
      (= (keys input) (keys result))
      (= (true? (mc/validate inference-ws-client/embeddings-return-schema result))))))

(deftest infer-test
  (testing "Demonstrate the correct usage and shape of the infer function"
    (let [expected {:mbql  {:source-table "card__1"
                            :filter       [">" ["field" "TAX" {:base-type :type/Float}] 0]}
                    :model "replit-code-v1-3b_samples_2023-07-25AM_Python_4"}]
      (with-redefs [inference-ws-client/infer-mbql
                    (fn
                      ([_base-url args]
                       (if (mc/validate metabot-schema/inference-schema args)
                         expected
                         "INVALID ARGUMENTS!"))
                      ([args]
                       (if (mc/validate metabot-schema/inference-schema args)
                         expected
                         "INVALID ARGUMENTS!")))]
        (let [prompt "Show data where tax is greater than zero"
              model  {:name            "Orders Model",
                      :id              1,
                      :description     nil,
                      :database_id     1,
                      :result_metadata [{:name           "ID",
                                         :display_name   "ID",
                                         :description    "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                                         :field_ref      [:field 37 nil],
                                         :base_type      :type/BigInteger,
                                         :effective_type :type/BigInteger}
                                        {:name           "USER_ID",
                                         :display_name   "User ID",
                                         :description    "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                                         :field_ref      [:field 43 nil],
                                         :base_type      :type/Integer,
                                         :effective_type :type/Integer}
                                        {:name           "PRODUCT_ID",
                                         :display_name   "Product ID",
                                         :description    "The product ID. This is an internal identifier for the product, NOT the SKU.",
                                         :field_ref      [:field 40 nil],
                                         :base_type      :type/Integer,
                                         :effective_type :type/Integer}
                                        {:name           "SUBTOTAL",
                                         :display_name   "Subtotal",
                                         :description    "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc.",
                                         :field_ref      [:field 44 nil],
                                         :base_type      :type/Float,
                                         :effective_type :type/Float}
                                        {:name           "TAX",
                                         :display_name   "Tax",
                                         :description    "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees on some products are not included here, but instead are accounted for in the subtotal.",
                                         :field_ref      [:field 38 nil],
                                         :base_type      :type/Float,
                                         :effective_type :type/Float}
                                        {:name           "TOTAL",
                                         :display_name   "Total",
                                         :description    "The total billed amount.",
                                         :field_ref      [:field 42 nil],
                                         :base_type      :type/Float,
                                         :effective_type :type/Float}
                                        {:name           "DISCOUNT",
                                         :display_name   "Discount",
                                         :description    "Discount amount.",
                                         :field_ref      [:field 36 nil],
                                         :base_type      :type/Float,
                                         :effective_type :type/Float}
                                        {:name           "CREATED_AT",
                                         :display_name   "Created At",
                                         :description    "The date and time an order was submitted.",
                                         :field_ref      [:field 41 {:temporal-unit :default}],
                                         :base_type      :type/DateTime,
                                         :effective_type :type/DateTime}
                                        {:name           "QUANTITY",
                                         :display_name   "Quantity",
                                         :description    "Number of products bought.",
                                         :field_ref      [:field 39 nil],
                                         :base_type      :type/Integer,
                                         :effective_type :type/Integer}]}]
          (is (= expected
                 (inference-ws-client/infer-mbql {:prompt prompt
                                             :model       model})))
          (is (= expected
                 (inference-ws-client/infer-mbql
                   "http://example.com"
                   {:prompt  prompt
                    :model  model})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/infer-mbql {:prompt prompt
                                             :model       [model]})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/infer-mbql
                   "http://example.com"
                   {:prompt  prompt
                    :context model}))))))))


