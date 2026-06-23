(ns metabase.curated-search.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-test-entry
  "Create an ai_context entry for testing and bind it to `sym`, deleting it on exit."
  [[sym attrs] & body]
  `(let [~sym (t2/insert-returning-instance! :model/CuratedSearchEntry
                                             (merge {:entity     {:model "table" :id 1}
                                                     :ai_context {:instructions "find orders"}}
                                                    ~attrs))]
     (try
       ~@body
       (finally
         (t2/delete! :model/CuratedSearchEntry :id (:id ~sym))))))

(deftest list-test
  (with-test-entry [entry {}]
    (testing "superuser can list ai_context entries"
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
  (with-test-entry [entry {:entity {:model "table" :id 1} :ai_context {:instructions "find customers"}}]
    (testing "superuser can fetch an ai_context entry by id"
      (is (=? {:id         (:id entry)
               :entity     {:model "table" :id 1}
               :ai_context {:instructions "find customers"}}
              (mt/user-http-request :crowberto :get 200 (str "curated-search/" (:id entry))))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :get 404 "curated-search/0"))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 (str "curated-search/" (:id entry))))))

(deftest create-test
  (testing "superuser can create an ai_context entry"
    (let [response (mt/user-http-request :crowberto :post 200 "curated-search/"
                                         {:entity     {:model "card" :id 42}
                                          :ai_context {:instructions "Use the Revenue card."
                                                       :synonyms     ["sales"]
                                                       :examples     ["revenue last month"]}})]
      (try
        (is (=? {:entity     {:model "card" :id 42}
                 :ai_context {:instructions "Use the Revenue card."
                              :synonyms     ["sales"]
                              :examples     ["revenue last month"]}}
                response))
        (finally
          (t2/delete! :model/CuratedSearchEntry :id (:id response))))))
  (testing "posting the same entity twice upserts in place rather than duplicating"
    (let [first-resp  (mt/user-http-request :crowberto :post 200 "curated-search/"
                                            {:entity {:model "card" :id 99} :ai_context {:instructions "v1"}})
          second-resp (mt/user-http-request :crowberto :post 200 "curated-search/"
                                            {:entity {:model "card" :id 99} :ai_context {:instructions "v2"}})]
      (try
        (is (= (:id first-resp) (:id second-resp)) "same row reused")
        (is (= {:instructions "v2"} (:ai_context second-resp)) "ai_context replaced")
        (is (= 1 (count (filter #(= {:model "card" :id 99} (:entity %))
                                (:data (mt/user-http-request :crowberto :get 200 "curated-search/"))))))
        (finally
          (t2/delete! :model/CuratedSearchEntry :id (:id first-resp))))))
  (testing "entity is required"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:ai_context {:instructions "x"}}))
  (testing "ai_context is required"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:entity {:model "table" :id 1}}))
  (testing "an unknown entity model is rejected"
    (mt/user-http-request :crowberto :post 400 "curated-search/"
                          {:entity {:model "garbage" :id 1} :ai_context {:instructions "x"}}))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :post 403 "curated-search/"
                          {:entity {:model "table" :id 1} :ai_context {:instructions "x"}})))

(deftest update-test
  (with-test-entry [entry {}]
    (testing "superuser can update the ai_context"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "curated-search/" (:id entry))
                                          {:ai_context {:instructions "updated"}})]
        (is (= {:instructions "updated"} (:ai_context updated)))))
    (testing "superuser can update the entity"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "curated-search/" (:id entry))
                                          {:entity {:model "model" :id 7}})]
        (is (=? {:entity {:model "model" :id 7}} updated))))
    (testing "the entity rejects an explicit null"
      (mt/user-http-request :crowberto :put 400 (str "curated-search/" (:id entry))
                            {:entity nil}))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :put 404 "curated-search/0" {:ai_context {:instructions "x"}}))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :put 403
                            (str "curated-search/" (:id entry))
                            {:ai_context {:instructions "x"}}))))

(deftest delete-test
  (with-test-entry [entry {}]
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :delete 403 (str "curated-search/" (:id entry))))
    (testing "superuser can delete an entry"
      (mt/user-http-request :crowberto :delete 204 (str "curated-search/" (:id entry)))
      (is (nil? (t2/select-one :model/CuratedSearchEntry :id (:id entry)))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :delete 404 "curated-search/0"))))
