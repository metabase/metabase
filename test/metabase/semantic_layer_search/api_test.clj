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
                                                     :entities      [{:model "table" :id 1}]
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

(deftest list-type-filter-test
  (with-test-entry [sources-entry {:type "sources"}]
    (with-test-entry [canonical-entry {:type "canonical"}]
      (testing "filtering by type=sources returns only sources entries"
        (let [response (mt/user-http-request :crowberto :get 200 "semantic-layer-search/" :type "sources")]
          (is (some #(= (:id sources-entry) (:id %)) (:data response)))
          (is (not (some #(= (:id canonical-entry) (:id %)) (:data response))))
          (is (every? #(= "sources" (:type %)) (:data response)))))
      (testing "filtering by type=canonical returns only canonical entries"
        (let [response (mt/user-http-request :crowberto :get 200 "semantic-layer-search/" :type "canonical")]
          (is (some #(= (:id canonical-entry) (:id %)) (:data response)))
          (is (not (some #(= (:id sources-entry) (:id %)) (:data response))))
          (is (every? #(= "canonical" (:type %)) (:data response)))))
      (testing "total reflects filtered count"
        (let [response (mt/user-http-request :crowberto :get 200 "semantic-layer-search/" :type "canonical")]
          (is (= (:total response) (count (:data response)))))))))

(deftest get-test
  (with-test-entry [entry {:search_prompt "find customers" :verified true}]
    (testing "superuser can fetch a semantic layer entry by id"
      (is (=? {:id            (:id entry)
               :search_prompt "find customers"
               :entities      [{:model "table" :id 1}]
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
                                          :entities           [{:model "card" :id 42}]})]
      (try
        (is (=? {:search_prompt      "find revenue"
                 :usage_instructions "Use the Revenue card."
                 :type               "sources"
                 :entities           [{:model "card" :id 42}]
                 :verified           false}
                response))
        (finally
          (t2/delete! :model/SemanticLayerIndex :id (:id response))))))
  (testing "verified defaults to false and usage_instructions to nil when omitted"
    (let [response (mt/user-http-request :crowberto :post 200 "semantic-layer-search/"
                                         {:search_prompt "find users"
                                          :entities      [{:model "table" :id 1}]})]
      (try
        (is (false? (:verified response)))
        (is (nil? (:usage_instructions response)))
        (finally
          (t2/delete! :model/SemanticLayerIndex :id (:id response))))))
  (testing "entities must be non-empty"
    (is (= "A semantic layer entry must reference at least one entity."
           (mt/user-http-request :crowberto :post 400 "semantic-layer-search/"
                                 {:search_prompt "find users" :entities []}))))
  (testing "a canonical entry must reference exactly one entity"
    (is (= "A canonical semantic layer entry must reference exactly one entity."
           (mt/user-http-request :crowberto :post 400 "semantic-layer-search/"
                                 {:search_prompt "find users" :type "canonical"
                                  :entities      [{:model "table" :id 1} {:model "card" :id 2}]}))))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :post 403 "semantic-layer-search/"
                          {:search_prompt "find orders" :entities [{:model "table" :id 1}]})))

(deftest update-test
  (with-test-entry [entry {}]
    (testing "superuser can update the prompt"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "semantic-layer-search/" (:id entry))
                                          {:search_prompt "updated prompt"})]
        (is (= "updated prompt" (:search_prompt updated)))))
    (testing "superuser can update usage_instructions"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "semantic-layer-search/" (:id entry))
                                          {:usage_instructions "Join orders to customers on customer_id."})]
        (is (= "Join orders to customers on customer_id." (:usage_instructions updated)))))
    (testing "entities cannot be updated to empty"
      (is (= "A semantic layer entry must reference at least one entity."
             (mt/user-http-request :crowberto :put 400
                                   (str "semantic-layer-search/" (:id entry))
                                   {:entities []}))))
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
