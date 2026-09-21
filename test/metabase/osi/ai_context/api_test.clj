(ns metabase.osi.ai-context.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-test-entry
  "`mt/with-temp` for an OsiAiContext, with entity/ai_context defaults so callers can pass `{}`."
  [[sym attrs] & body]
  `(mt/with-temp [:model/OsiAiContext ~sym (merge {:entity_type     "table"
                                                   :entity_local_id 1
                                                   :ai_context      {:instructions "find orders"}}
                                                  ~attrs)]
     ~@body))

(defn- has-entity?
  "Whether `entries` contains a row for `(entity-type, entity-local-id)`."
  [entries entity-type entity-local-id]
  (some #(= {:entity_type entity-type :entity_local_id entity-local-id}
            (select-keys % [:entity_type :entity_local_id]))
        entries))

(deftest list-test
  (with-test-entry [_ {}]
    (testing "superuser can list ai_context entries"
      (let [response (mt/user-http-request :crowberto :get 200 "osi/ai-context/")]
        (is (contains? response :data))
        (is (contains? response :total))
        (is (has-entity? (:data response) "table" 1))))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 "osi/ai-context/"))
    (testing "a legacy row whose entity_type is no longer in the write enum still reads back fine"
      (with-test-entry [_ {:entity_type "retired-model-string" :entity_local_id 7}]
        (is (has-entity? (:data (mt/user-http-request :crowberto :get 200 "osi/ai-context/"))
                         "retired-model-string" 7))))))

(deftest get-test
  (with-test-entry [_ {:entity_type "table" :entity_local_id 1 :ai_context {:instructions "find customers"}}]
    (testing "superuser can fetch an ai_context entry by its logical key"
      (is (=? {:entity_type     "table"
               :entity_local_id 1
               :ai_context      {:instructions "find customers"}}
              (mt/user-http-request :crowberto :get 200 "osi/ai-context/table/1"))))
    (testing "a card flavor resolves the canonical \"card\" row"
      (with-test-entry [_ {:entity_type "metric" :entity_local_id 8 :ai_context {:instructions "by month"}}]
        (is (=? {:entity_type "card" :entity_local_id 8}
                (mt/user-http-request :crowberto :get 200 "osi/ai-context/model/8")))))
    (testing "returns 404 for an entity with no row (including an unknown entity_type)"
      (mt/user-http-request :crowberto :get 404 "osi/ai-context/table/999999")
      (mt/user-http-request :crowberto :get 404 "osi/ai-context/garbage/1"))
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :get 403 "osi/ai-context/table/1"))))

(deftest upsert-test
  (testing "PUT creates the entry (a card flavor is stored under the canonical \"card\")"
    (try
      (is (=? {:entity_type     "card"
               :entity_local_id 42
               :ai_context      {:instructions "Use the Revenue metric." :synonyms ["sales"]
                                 :examples ["revenue last month"]}}
              (mt/user-http-request :crowberto :put 200 "osi/ai-context/metric/42"
                                    {:ai_context {:instructions "Use the Revenue metric." :synonyms ["sales"]
                                                  :examples ["revenue last month"]}})))
      (finally (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id 42))))
  (testing "measure and segment entity refs are accepted (they are indexed library entities)"
    (doseq [entity-type ["measure" "segment"]]
      (try
        (is (=? {:entity_type entity-type :entity_local_id 5}
                (mt/user-http-request :crowberto :put 200 (str "osi/ai-context/" entity-type "/5")
                                      {:ai_context {:synonyms ["alias"]}})))
        (finally (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id 5)))))
  (testing "PUTting the same card under different flavors upserts one row (both normalize to \"card\")"
    (try
      (mt/user-http-request :crowberto :put 200 "osi/ai-context/metric/99" {:ai_context {:instructions "v1"}})
      (let [second-resp (mt/user-http-request :crowberto :put 200 "osi/ai-context/model/99"
                                              {:ai_context {:instructions "v2"}})]
        (is (= {:instructions "v2"} (:ai_context second-resp)) "ai_context replaced across a metric->model relabel")
        (is (=? {:entity_type "card" :entity_local_id 99 :ai_context {:instructions "v2"}}
                (mt/user-http-request :crowberto :get 200 "osi/ai-context/model/99"))
            "one canonical card row, fetched by either flavor")
        (is (= 1 (t2/count :model/OsiAiContext :entity_type "card" :entity_local_id 99))))
      (finally (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id 99))))
  (testing "a re-PUT with the same ai_context is idempotent (a no-op update must not retry as a duplicate insert)"
    (try
      (mt/user-http-request :crowberto :put 200 "osi/ai-context/measure/77" {:ai_context {:instructions "same"}})
      (is (=? {:entity_type "measure" :entity_local_id 77 :ai_context {:instructions "same"}}
              (mt/user-http-request :crowberto :put 200 "osi/ai-context/measure/77" {:ai_context {:instructions "same"}})))
      (finally (t2/delete! :model/OsiAiContext :entity_type "measure" :entity_local_id 77))))
  (testing "the OSI string shorthand for ai_context is accepted and migrated to {:instructions s}"
    (try
      (is (=? {:entity_type     "table"
               :entity_local_id 3
               :ai_context      {:instructions "Use for revenue questions."}}
              (mt/user-http-request :crowberto :put 200 "osi/ai-context/table/3"
                                    {:ai_context "Use for revenue questions."})))
      (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 3))))
  (testing "ai_context is required"
    (mt/user-http-request :crowberto :put 400 "osi/ai-context/table/1" {}))
  (testing "an over-long instructions string is rejected"
    (mt/user-http-request :crowberto :put 400 "osi/ai-context/table/1"
                          {:ai_context {:instructions (apply str (repeat 6000 "x"))}}))
  (testing "an over-long string shorthand is rejected (capped like instructions, which it becomes)"
    (mt/user-http-request :crowberto :put 400 "osi/ai-context/table/1"
                          {:ai_context (apply str (repeat 6000 "x"))}))
  (testing "too many synonyms is rejected"
    (mt/user-http-request :crowberto :put 400 "osi/ai-context/table/1"
                          {:ai_context {:synonyms (mapv str (range 51))}}))
  (testing "entity types the reconciler never indexes (card/question/garbage) are rejected by the route"
    (doseq [entity-type ["card" "question" "garbage"]]
      (mt/user-http-request :crowberto :put 400 (str "osi/ai-context/" entity-type "/1")
                            {:ai_context {:instructions "x"}})))
  (testing "non-superuser gets 403"
    (mt/user-http-request :rasta :put 403 "osi/ai-context/table/1" {:ai_context {:instructions "x"}})))

(deftest reconcile-test
  (testing "POST /reconcile requires superuser"
    (mt/user-http-request :rasta :post 403 "osi/ai-context/reconcile"))
  (testing "without semantic search the index can't be reconciled, so it 400s rather than no-opping silently"
    (mt/user-http-request :crowberto :post 400 "osi/ai-context/reconcile")))

(deftest delete-test
  (with-test-entry [_ {}]
    (testing "non-superuser gets 403"
      (mt/user-http-request :rasta :delete 403 "osi/ai-context/table/1"))
    (testing "superuser can delete an entry by its logical key"
      (mt/user-http-request :crowberto :delete 204 "osi/ai-context/table/1")
      (is (nil? (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id 1))))
    (testing "returns 404 for an entity with no row"
      (mt/user-http-request :crowberto :delete 404 "osi/ai-context/table/999999"))))
