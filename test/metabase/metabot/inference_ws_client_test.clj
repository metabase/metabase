(ns metabase.metabot.inference-ws-client-test
  (:require
    [clojure.test :refer :all]
    [malli.core :as mc]
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.schema :as metabot-schema]))

(deftest bulk-embeddings-test
  (with-redefs [inference-ws-client/call-bulk-embeddings-endpoint
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
          result (inference-ws-client/call-bulk-embeddings-endpoint input)]
      (is (= (keys input) (keys result)))
      (is (true? (mc/validate inference-ws-client/embeddings-return-schema result))))))

(deftest infer-test
  (testing "Demonstrate the correct usage and shape of the infer function"
    (let [expected {:dataset_query {:source-table "card__1"
                                    :filter       [">" ["field" "TAX" {:base-type :type/Float}] 0]}
                    :model         "replit-code-v1-3b_samples_2023-07-25AM_Python_4"}]
      (with-redefs [inference-ws-client/call-infer-dataset-query-endpoint
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
                      :result_metadata [{:id 1
                                         :name           "ID",
                                         :display_name   "ID",
                                         :description    "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.",
                                         :field_ref      [:field 37 nil],
                                         :base_type      :type/BigInteger,
                                         :effective_type :type/BigInteger}
                                        {:id 2
                                         :name           "USER_ID",
                                         :display_name   "User ID",
                                         :description    "The id of the user who made this order. Note that in some cases where an order was created on behalf of a customer who phoned the order in, this might be the employee who handled the request.",
                                         :field_ref      [:field 43 nil],
                                         :base_type      :type/Integer,
                                         :effective_type :type/Integer}]}]
          (is (= expected
                 (inference-ws-client/call-infer-dataset-query-endpoint {:user_prompt prompt
                                                           :model                     model})))
          (is (= expected
                 (inference-ws-client/call-infer-dataset-query-endpoint
                   "http://example.com"
                   {:user_prompt prompt :model model})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/call-infer-dataset-query-endpoint {:user_prompt prompt
                                                           :model                     [model]})))
          (is (= "INVALID ARGUMENTS!"
                 (inference-ws-client/call-infer-dataset-query-endpoint
                   "http://example.com"
                   {:user_prompt prompt
                    :context     model}))))))))


