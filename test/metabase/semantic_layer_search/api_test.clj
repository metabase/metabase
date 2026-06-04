(ns metabase.semantic-layer-search.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-test-entry
  "Create a semantic layer entry for testing and bind it to `sym`, deleting it on exit."
  [[sym attrs] & body]
  `(let [~sym (t2/insert-returning-instance! :model/SemanticLayerIndex
                                             (merge {:search_prompt "find orders"
                                                     :entity        {:model "table" :id 1}
                                                     :verified      false}
                                                    ~attrs))]
     (try
       ~@body
       (finally
         (t2/delete! :model/SemanticLayerIndex :id (:id ~sym))))))

(deftest list-test
  (with-test-entry [entry {}]
    (testing "superuser can list semantic layer entries"
      (let [response (mt/user-http-request :crowberto :get 200 "semantic-layer-search/")]
        (is (contains? response :data))
        (is (contains? response :total))
        (is (some #(= (:id entry) (:id %)) (:data response)))))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 "semantic-layer-search/"))))

(deftest get-test
  (with-test-entry [entry {:search_prompt "find customers" :verified true}]
    (testing "superuser can fetch a semantic layer entry by id"
      (is (=? {:id            (:id entry)
               :search_prompt "find customers"
               :entity        {:model "table" :id 1}
               :verified      true}
              (mt/user-http-request :crowberto :get 200 (str "semantic-layer-search/" (:id entry))))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :get 404 "semantic-layer-search/0"))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 (str "semantic-layer-search/" (:id entry))))))

(deftest create-test
  (testing "superuser can create a semantic layer entry"
    (let [response (mt/user-http-request :crowberto :post 200 "semantic-layer-search/"
                                         {:search_prompt      "find revenue"
                                          :usage_instructions "Use the Revenue card."
                                          :entity             {:model "card" :id 42}})]
      (try
        (is (=? {:search_prompt      "find revenue"
                 :usage_instructions "Use the Revenue card."
                 :entity             {:model "card" :id 42}
                 :verified           false}
                response))
        (finally
          (t2/delete! :model/SemanticLayerIndex :id (:id response))))))
  (testing "verified defaults to false and usage_instructions to nil when omitted"
    (let [response (mt/user-http-request :crowberto :post 200 "semantic-layer-search/"
                                         {:search_prompt "find users"
                                          :entity        {:model "table" :id 1}})]
      (try
        (is (false? (:verified response)))
        (is (nil? (:usage_instructions response)))
        (finally
          (t2/delete! :model/SemanticLayerIndex :id (:id response))))))
  (testing "entity is required"
    (mt/user-http-request :crowberto :post 400 "semantic-layer-search/"
                          {:search_prompt "find users"}))
  (testing "an unknown entity model is rejected"
    (mt/user-http-request :crowberto :post 400 "semantic-layer-search/"
                          {:search_prompt "find users"
                           :entity        {:model "garbage" :id 1}}))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :post 403 "semantic-layer-search/"
                          {:search_prompt "find orders" :entity {:model "table" :id 1}})))

(deftest update-test
  (with-test-entry [entry {}]
    (testing "superuser can update the prompt"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "semantic-layer-search/" (:id entry))
                                          {:search_prompt "updated prompt"})]
        (is (= "updated prompt" (:search_prompt updated)))))
    (testing "superuser can update usage_instructions and the entity"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "semantic-layer-search/" (:id entry))
                                          {:usage_instructions "Join orders to customers on customer_id."
                                           :entity             {:model "model" :id 7}})]
        (is (=? {:usage_instructions "Join orders to customers on customer_id."
                 :entity             {:model "model" :id 7}}
                updated))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :put 404 "semantic-layer-search/0" {:search_prompt "x"}))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :put 403
                            (str "semantic-layer-search/" (:id entry))
                            {:search_prompt "x"}))))

(deftest delete-test
  (with-test-entry [entry {}]
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :delete 403 (str "semantic-layer-search/" (:id entry))))
    (testing "superuser can delete an entry"
      (mt/user-http-request :crowberto :delete 204 (str "semantic-layer-search/" (:id entry)))
      (is (nil? (t2/select-one :model/SemanticLayerIndex :id (:id entry)))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :delete 404 "semantic-layer-search/0"))))
