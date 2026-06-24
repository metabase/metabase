(ns metabase.osi.ai-context.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-test-entry
  "`mt/with-temp` for an OsiAiContext, with entity/ai_context defaults so callers can pass `{}`."
  [[sym attrs] & body]
  `(mt/with-temp [:model/OsiAiContext ~sym (merge {:entity     {:model "table" :id 1}
                                                   :ai_context {:instructions "find orders"}}
                                                  ~attrs)]
     ~@body))

(deftest list-test
  (with-test-entry [entry {}]
    (testing "superuser can list ai_context entries"
      (let [response (mt/user-http-request :crowberto :get 200 "osi/ai-context/")]
        (is (contains? response :data))
        (is (contains? response :total))
        (is (some #(= (:id entry) (:id %)) (:data response)))))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 "osi/ai-context/"))
    (testing "a legacy row whose entity model is no longer in the write enum still reads back fine"
      (with-test-entry [legacy {:entity {:model "retired-model-string" :id 7}}]
        (is (some #(= (:id legacy) (:id %))
                  (:data (mt/user-http-request :crowberto :get 200 "osi/ai-context/"))))))))

(deftest get-test
  (with-test-entry [entry {:entity {:model "table" :id 1} :ai_context {:instructions "find customers"}}]
    (testing "superuser can fetch an ai_context entry by id"
      (is (=? {:id         (:id entry)
               :entity     {:model "table" :id 1}
               :ai_context {:instructions "find customers"}}
              (mt/user-http-request :crowberto :get 200 (str "osi/ai-context/" (:id entry))))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :get 404 "osi/ai-context/0"))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 (str "osi/ai-context/" (:id entry))))))

(deftest create-test
  (testing "superuser can create an ai_context entry"
    (let [response (mt/user-http-request :crowberto :post 200 "osi/ai-context/"
                                         {:entity     {:model "metric" :id 42}
                                          :ai_context {:instructions "Use the Revenue metric."
                                                       :synonyms     ["sales"]
                                                       :examples     ["revenue last month"]}})]
      (try
        (is (=? {:entity     {:model "metric" :id 42}
                 :ai_context {:instructions "Use the Revenue metric."
                              :synonyms     ["sales"]
                              :examples     ["revenue last month"]}}
                response))
        (finally
          (t2/delete! :model/OsiAiContext :id (:id response))))))
  (testing "measure and segment entity refs are accepted (they are indexed library entities)"
    (doseq [model ["measure" "segment"]]
      (let [response (mt/user-http-request :crowberto :post 200 "osi/ai-context/"
                                           {:entity {:model model :id 5} :ai_context {:synonyms ["alias"]}})]
        (try
          (is (=? {:entity {:model model :id 5}} response))
          (finally
            (t2/delete! :model/OsiAiContext :id (:id response)))))))
  (testing "posting the same entity twice upserts in place rather than duplicating"
    (let [first-resp  (mt/user-http-request :crowberto :post 200 "osi/ai-context/"
                                            {:entity {:model "metric" :id 99} :ai_context {:instructions "v1"}})
          second-resp (mt/user-http-request :crowberto :post 200 "osi/ai-context/"
                                            {:entity {:model "metric" :id 99} :ai_context {:instructions "v2"}})]
      (try
        (is (= (:id first-resp) (:id second-resp)) "same row reused")
        (is (= {:instructions "v2"} (:ai_context second-resp)) "ai_context replaced")
        (is (= 1 (count (filter #(= {:model "metric" :id 99} (:entity %))
                                (:data (mt/user-http-request :crowberto :get 200 "osi/ai-context/"))))))
        (finally
          (t2/delete! :model/OsiAiContext :id (:id first-resp))))))
  (testing "entity is required"
    (mt/user-http-request :crowberto :post 400 "osi/ai-context/"
                          {:ai_context {:instructions "x"}}))
  (testing "ai_context is required"
    (mt/user-http-request :crowberto :post 400 "osi/ai-context/"
                          {:entity {:model "table" :id 1}}))
  (testing "models the reconciler never indexes (card/question/garbage) are rejected"
    (doseq [model ["card" "question" "garbage"]]
      (mt/user-http-request :crowberto :post 400 "osi/ai-context/"
                            {:entity {:model model :id 1} :ai_context {:instructions "x"}})))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :post 403 "osi/ai-context/"
                          {:entity {:model "table" :id 1} :ai_context {:instructions "x"}})))

(deftest update-test
  (with-test-entry [entry {}]
    (testing "superuser can update the ai_context"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "osi/ai-context/" (:id entry))
                                          {:ai_context {:instructions "updated"}})]
        (is (= {:instructions "updated"} (:ai_context updated)))))
    (testing "superuser can update the entity"
      (let [updated (mt/user-http-request :crowberto :put 200
                                          (str "osi/ai-context/" (:id entry))
                                          {:entity {:model "model" :id 7}})]
        (is (=? {:entity {:model "model" :id 7}} updated))))
    (testing "the entity rejects an explicit null"
      (mt/user-http-request :crowberto :put 400 (str "osi/ai-context/" (:id entry))
                            {:entity nil}))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :put 404 "osi/ai-context/0" {:ai_context {:instructions "x"}}))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :put 403
                            (str "osi/ai-context/" (:id entry))
                            {:ai_context {:instructions "x"}}))))

(deftest update-cannot-steal-another-entitys-row-test
  (testing "PUT pointing :entity at an entity another row already owns is rejected (one row per entity)"
    (with-test-entry [a {:entity {:model "table" :id 1}}]
      (with-test-entry [b {:entity {:model "table" :id 2}}]
        (mt/user-http-request :crowberto :put 400 (str "osi/ai-context/" (:id b))
                              {:entity {:model "table" :id 1}})
        (testing "re-pointing a row at its own entity is fine (no-op self-match)"
          (mt/user-http-request :crowberto :put 200 (str "osi/ai-context/" (:id a))
                                {:entity {:model "table" :id 1}}))))))

(deftest delete-test
  (with-test-entry [entry {}]
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :delete 403 (str "osi/ai-context/" (:id entry))))
    (testing "superuser can delete an entry"
      (mt/user-http-request :crowberto :delete 204 (str "osi/ai-context/" (:id entry)))
      (is (nil? (t2/select-one :model/OsiAiContext :id (:id entry)))))
    (testing "returns 404 for unknown id"
      (mt/user-http-request :crowberto :delete 404 "osi/ai-context/0"))))
