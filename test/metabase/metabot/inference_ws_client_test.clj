(ns metabase.metabot.inference-ws-client-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.metabot.inference-ws.client :as inference-ws-client]
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
      (with-redefs [inference-ws-client/infer
                    (fn
                      ([_base-url args]
                       (if (mc/validate metabot-schema/inference-schema args)
                         expected
                         "INVALID ARGUMENTS!"))
                      ([args]
                       (if (mc/validate metabot-schema/inference-schema args)
                         expected
                         "INVALID ARGUMENTS!")))]
        (let [prompt  "Show data where tax is greater than zero"
              context {:table_name "Orders Model"
                       :table_id   1
                       :fields
                       [{:clause [:field "ID" {:base-type "type/BigInteger"}], :field_name "ID", :field_type :type/BigInteger}
                        {:clause [:field "USER_ID" {:base-type "type/Integer"}], :field_name "User ID", :field_type :type/Integer}
                        {:clause [:field "PRODUCT_ID" {:base-type "type/Integer"}], :field_name "Product ID", :field_type :type/Integer}
                        {:clause [:field "SUBTOTAL" {:base-type "type/Float"}], :field_name "Subtotal", :field_type :type/Float}
                        {:clause [:field "TAX" {:base-type "type/Float"}], :field_name "Tax", :field_type :type/Float}
                        {:clause [:field "TOTAL" {:base-type "type/Float"}], :field_name "Total", :field_type :type/Float}
                        {:clause [:field "DISCOUNT" {:base-type "type/Float"}], :field_name "Discount", :field_type :type/Float}
                        {:clause [:field "CREATED_AT" {:base-type "type/DateTime"}], :field_name "Created At", :field_type :type/DateTime}
                        {:clause [:field "QUANTITY" {:base-type "type/Integer"}], :field_name "Quantity", :field_type :type/Integer}]}]
          (is (= expected
                 (inference-ws-client/infer {:prompt  prompt
                                             :context [context]})))
          (is (= expected
                 (inference-ws-client/infer
                  "http://example.com"
                  {:prompt  prompt
                   :context [context]})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/infer {:prompt  prompt
                                             :context context})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/infer
                  "http://example.com"
                  {:prompt  prompt
                   :context context}))))))))


