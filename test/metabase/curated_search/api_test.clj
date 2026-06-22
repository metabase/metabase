(ns metabase.curated-search.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-test-entry
  "Create a curated search entry for testing and bind it to `sym`, deleting it on exit."
  [[sym attrs] & body]
  `(let [~sym (t2/insert-returning-instance! :model/CuratedSearchEntry
                                             (merge {:search_prompt "find orders"
                                                     :entity        {:model "table" :id 1}
                                                     :verified      false}
                                                    ~attrs))]
     (try
       ~@body
       (finally
         (t2/delete! :model/CuratedSearchEntry :id (:id ~sym))))))

(deftest list-test
  (with-test-entry [entry {}]
    (testing "superuser can list curated search entries"
      (let [response (mt/user-http-request :crowberto :get 200 "curated-search/")]
        (is (contains? response :data))
        (is (contains? response :total))
        (is (some #(= (:id entry) (:id %)) (:data response)))))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 "curated-search/"))
    (testing "a legacy row whose entity model is no longer in the write enum still reads back fine"
      (with-test-entry [legacy {:entity {:model "retired-model-string" :id 7}}]
        (is (some #(= (:id legacy) (:id %))
                  (:data (mt/user-http-request :crowberto :get 200 "curated-search/"))))))))

(deftest get-test
  (with-test-entry [entry {:search_prompt "find customers" :verified true}]
    (testing "superuser can fetch a curated search entry by id"
      (is (=? {:id            (:id entry)
               :search_prompt "find customers"
               :entity        {:model "table" :id 1}
               :verified      true}
              (mt/user-http-request :crowberto :get 200 (str "curated-search/" (:id entry))))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :get 404 "curated-search/0"))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 (str "curated-search/" (:id entry))))))

(deftest create-test
  (testing "superuser can create a curated search entry"
    (let [response (mt/user-http-request :crowberto :post 200 "curated-search/"
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
          (t2/delete! :model/CuratedSearchEntry :id (:id response))))))
  (testing "verified defaults to false and usage_instructions to nil when omitted"
    (let [response (mt/user-http-request :crowberto :post 200 "curated-search/"
                                         {:search_prompt "find users"
                                          :entity        {:model "table" :id 1}})]
      (try
        (is (false? (:verified response)))
        (is (nil? (:usage_instructions response)))
        (finally
          (t2/delete! :model/CuratedSearchEntry :id (:id response))))))
  (testing "entity is required"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:search_prompt "find users"}))
  (testing "an unknown entity model is rejected"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:search_prompt "find users"
                           :entity        {:model "garbage" :id 1}}))
  (testing "a blank search_prompt is rejected"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:search_prompt "   " :entity {:model "table" :id 1}}))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :post 403 "curated-search/"
                          {:search_prompt "find orders" :entity {:model "table" :id 1}})))

(deftest update-test
  (with-test-entry [entry {}]
    (testing "superuser can update the prompt"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "curated-search/" (:id entry))
                                          {:search_prompt "updated prompt"})]
        (is (= "updated prompt" (:search_prompt updated)))))
    (testing "superuser can update usage_instructions and the entity"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "curated-search/" (:id entry))
                                          {:usage_instructions "Join orders to customers on customer_id."
                                           :entity             {:model "model" :id 7}})]
        (is (=? {:usage_instructions "Join orders to customers on customer_id."
                 :entity             {:model "model" :id 7}}
                updated))))
    (testing "an explicit null clears usage_instructions"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "curated-search/" (:id entry))
                                          {:usage_instructions nil})]
        (is (nil? (:usage_instructions updated)))))
    (testing "the non-nullable fields reject an explicit null"
      (mt/user-http-request :crowberto :put 400 (str "curated-search/" (:id entry))
                            {:entity nil})
      (mt/user-http-request :crowberto :put 400 (str "curated-search/" (:id entry))
                            {:verified nil}))
    (testing "a blank search_prompt is rejected"
      (mt/user-http-request :crowberto :put 400 (str "curated-search/" (:id entry))
                            {:search_prompt "  "}))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :put 404 "curated-search/0" {:search_prompt "x"}))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :put 403
                            (str "curated-search/" (:id entry))
                            {:search_prompt "x"}))))

(deftest delete-test
  (with-test-entry [entry {}]
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :delete 403 (str "curated-search/" (:id entry))))
    (testing "superuser can delete an entry"
      (mt/user-http-request :crowberto :delete 204 (str "curated-search/" (:id entry)))
      (is (nil? (t2/select-one :model/CuratedSearchEntry :id (:id entry)))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :delete 404 "curated-search/0"))))
