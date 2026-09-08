(ns metabase.osi.ai-context.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.osi.ai-context.api :as osi.api]
   [metabase.test :as mt]
   [metabase.util.json :as json]
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

(deftest upsert-creates-test
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
  (testing "the OSI string shorthand for ai_context is accepted and migrated to {:instructions s}"
    (try
      (is (=? {:entity_type     "table"
               :entity_local_id 3
               :ai_context      {:instructions "Use for revenue questions."}}
              (mt/user-http-request :crowberto :put 200 "osi/ai-context/table/3"
                                    {:ai_context "Use for revenue questions."})))
      (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 3)))))

(deftest upsert-normalizes-card-flavors-test
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
      (finally (t2/delete! :model/OsiAiContext :entity_type "measure" :entity_local_id 77)))))

(deftest upsert-validation-test
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
  (testing "unknown ai_context keys are rejected instead of silently persisted"
    (mt/user-http-request :crowberto :put 400 "osi/ai-context/table/1"
                          {:ai_context {:instructions "x" :surprise "not in OSI"}})))

(deftest upsert-authorization-test
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

;;; ------------------------------------------- Generation metadata -------------------------------------------

(deftest put-flips-data-source-to-human-test
  (testing "any PUT is an approval: the row becomes human-owned and its generation state is untouched"
    (let [generated-at         (t/offset-date-time "2026-07-20T10:00Z")
          invalidated-at       (t/offset-date-time "2026-07-20T11:00Z")
          basis-invalidated-at (t/offset-date-time "2026-07-20T09:00Z")
          rewrite-requested-at (t/offset-date-time "2026-07-20T12:00Z")
          basis                {:name "old"}
          generation-state     {:generated_at generated-at :invalidated_at invalidated-at
                                :basis_invalidated_at basis-invalidated-at :basis basis
                                :rewrite_requested_at rewrite-requested-at :generator_version "v1"}]
      (with-test-entry [_ (merge {:data_source :metabot} generation-state)]
        (is (= "human" (:data_source
                        (mt/user-http-request :crowberto :put 200 "osi/ai-context/table/1"
                                              {:ai_context {:instructions "approved"}}))))
        (is (= (assoc generation-state :data_source :human)
               (select-keys (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id 1)
                            (conj (vec (keys generation-state)) :data_source))))))))

(deftest put-on-new-row-is-human-test
  (testing "a PUT that creates a row stores human, with no generation state"
    (try
      (is (=? {:data_source "human" :generated_at nil}
              (mt/user-http-request :crowberto :put 200 "osi/ai-context/table/991"
                                    {:ai_context {:instructions "new"}})))
      (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 991)))))

(deftest read-tolerates-rows-that-bypassed-the-write-caps-test
  (testing "a row that predates the caps (or arrived by serdes or a direct write) still reads back: the
           write limits are not asserted on responses, or one legacy row would break the list for every
           other entity"
    (with-test-entry [_ {}]
      (t2/query {:update :osi_ai_context
                 :set    {:ai_context (json/encode
                                       {:instructions (apply str (repeat (* 2 entity-retrieval/max-instructions-len) "x"))
                                        ;; over the list cap, over the item cap, and a non-string item:
                                        ;; the read schema asserts none of the three
                                        :synonyms     (conj (mapv str (range (* 2 entity-retrieval/max-list-len))) 42)
                                        :examples     [(apply str (repeat (* 2 entity-retrieval/max-item-len) "y"))
                                                       nil
                                                       {:not "a string"}]})}
                 :where  [:and [:= :entity_type "table"] [:= :entity_local_id 1]]})
      (is (= (inc (* 2 entity-retrieval/max-list-len))
             (count (:synonyms (:ai_context (mt/user-http-request :crowberto :get 200 "osi/ai-context/table/1"))))))
      (is (has-entity? (:data (mt/user-http-request :crowberto :get 200 "osi/ai-context/")) "table" 1)
          "and it does not take the whole list down with it"))))

(deftest read-exposes-generation-metadata-test
  (testing "reads carry the generation timestamps and never the basis blob"
    (with-test-entry [_ {:data_source :metabot :basis {:name "private"}}]
      (doseq [row [(mt/user-http-request :crowberto :get 200 "osi/ai-context/table/1")
                   (some #(when (= 1 (:entity_local_id %)) %)
                         (:data (mt/user-http-request :crowberto :get 200 "osi/ai-context/")))]]
        (is (= "metabot" (:data_source row)))
        (is (every? #(contains? row %)
                    [:generated_at :invalidated_at :basis_invalidated_at :rewrite_requested_at
                     :generator_version :created_at :updated_at]))
        (is (not (contains? row :basis)))))))

(deftest regenerate-requests-rewrite-test
  (testing "regenerate records the request without destroying generation state or revoking approval"
    (let [generated-at         (t/offset-date-time "2026-07-20T10:00Z")
          basis-invalidated-at (t/offset-date-time "2026-07-20T09:00Z")
          basis                {:name "Orders"}]
      (with-test-entry [_ {:data_source :human :generated_at generated-at
                           :basis_invalidated_at basis-invalidated-at :basis basis}]
        (is (= "human" (:data_source
                        (mt/user-http-request :crowberto :post 200
                                              "osi/ai-context/table/1/regenerate"))))
        (let [row (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id 1)]
          (is (t/after? (:rewrite_requested_at row) generated-at))
          (is (= {:ai_context {:instructions "find orders"}
                  :data_source :human
                  :basis basis :basis_invalidated_at basis-invalidated-at :generated_at generated-at}
                 (select-keys row [:ai_context :data_source :basis :basis_invalidated_at :generated_at]))))))))

(deftest regenerate-keeps-instructions-serving-test
  (testing "the instructions an entity serves to the agent survive a regenerate request — the content is
           unchanged until the job rewrites it, so the human approval it is gated on must not be revoked"
    (with-test-entry [_ {:data_source :human}]
      (is (= {["table" 1] "find orders"}
             (entity-retrieval/ai-context-instructions [{:model "table" :id 1}])))
      (mt/user-http-request :crowberto :post 200 "osi/ai-context/table/1/regenerate")
      (is (= {["table" 1] "find orders"}
             (entity-retrieval/ai-context-instructions [{:model "table" :id 1}]))))))

(deftest regenerate-outruns-clock-skew-test
  (testing "rewrite_requested_at lands strictly after a generated_at that is ahead of this node's clock —
           otherwise the endpoint reports success while the row never re-enters tier 1"
    (let [future-generated-at (t/plus (t/offset-date-time) (t/hours 1))]
      (with-test-entry [_ {:data_source :metabot :generated_at future-generated-at}]
        (mt/user-http-request :crowberto :post 200 "osi/ai-context/table/1/regenerate")
        (let [row (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id 1)]
          (is (t/after? (:rewrite_requested_at row) (:generated_at row))
              "the stamp must beat the stored generated_at, not just now()"))))))

(deftest regenerate-stamp-survives-database-precision-test
  (testing "a sub-millisecond clock advance still leaves a database-safe gap after generated_at"
    (let [generated-at (t/offset-date-time "2026-01-02T03:04:05.123456Z")
          now          (.plusNanos ^java.time.OffsetDateTime generated-at 500)
          stamp        (#'osi.api/rewrite-request-stamp now generated-at)]
      (is (= (t/plus generated-at (t/millis 1)) stamp)))))

(deftest regenerate-recovers-from-racing-generation-test
  (testing "when generated_at advances between the read and the CAS, the endpoint refetches and recomputes
           so the stamp still outranks the newer generated_at instead of landing behind a stale read"
    (let [future-generated-at (t/plus (t/offset-date-time) (t/hours 1))]
      (with-test-entry [_ {:data_source :metabot :generated_at future-generated-at}]
        (let [calls    (atom 0)
              real-get (mt/original-fn #'osi.api/get-entry)]
          ;; Make only the FIRST read stale — an older generated_at and a non-matching updated_at, as if a
          ;; generator advanced the row a moment after we read it. A naive stamp off this read would be
          ;; now(), which is before the row's real (future) generated_at; only a refetch+recompute beats it.
          (mt/with-dynamic-fn-redefs
            [osi.api/get-entry (fn [entity-type entity-local-id]
                                 (let [row (real-get entity-type entity-local-id)]
                                   (if (= 1 (swap! calls inc))
                                     (assoc row
                                            :generated_at (t/minus (t/offset-date-time) (t/hours 1))
                                            :updated_at   (t/offset-date-time "2000-01-01T00:00Z"))
                                     row)))]
            (mt/user-http-request :crowberto :post 200 "osi/ai-context/table/1/regenerate"))
          (is (<= 2 @calls) "the first CAS missed on the stale updated_at, so the endpoint retried"))
        (let [row (t2/select-one :model/OsiAiContext :entity_type "table" :entity_local_id 1)]
          (is (t/after? (:rewrite_requested_at row) future-generated-at)
              "the retry recomputed the stamp against the real, newer generated_at"))))))

(deftest regenerate-auth-test
  (testing "regenerate is superuser-only and 404s when there is nothing to rewrite"
    (with-test-entry [_ {}]
      (mt/user-http-request :rasta :post 403 "osi/ai-context/table/1/regenerate")
      (mt/user-http-request :crowberto :post 200 "osi/ai-context/table/1/regenerate"))
    (mt/user-http-request :crowberto :post 404 "osi/ai-context/table/999999/regenerate")))

(deftest regenerate-rejects-non-writable-entity-types-test
  (testing "regenerate rejects storage-only types that the generation worker cannot process"
    (with-test-entry [_ {:entity_type "card"}]
      (with-test-entry [_ {:entity_type "retired-model-string" :entity_local_id 2}]
        (doseq [[entity-type entity-id] [["card" 1]
                                         ["question" 1]
                                         ["retired-model-string" 2]]]
          (mt/user-http-request :crowberto :post 400
                                (format "osi/ai-context/%s/%d/regenerate" entity-type entity-id)))))))

;;; --------------------------------------------- Nudge call sites ---------------------------------------------
;;;
;;; The model nudges from its own write hooks, so every writer gets it. What is pinned here is that the
;;; interactive CRUD paths nudge exactly once with the normalized key, and that a write touching only
;;; generation metadata does not nudge at all.
;;;
;;; No `with-test-entry` in these tests: `mt/with-temp` runs its body inside a transaction, and the
;;; in-process client executes the endpoint on the same thread, so a `do-after-commit` nudge would be
;;; deferred past the assertion (and past the spy's scope) instead of running immediately.

(defn- spying-on-nudges!
  "Run `f` with `mirror/request-entity-sync!` replaced by a spy; returns the arg vectors it received."
  [f]
  (let [nudges (atom [])]
    (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [& args]
                                                              (swap! nudges conj (vec args))
                                                              nil)]
      (f))
    @nudges))

(deftest regenerate-does-not-nudge-test
  (testing "regenerate writes nothing that feeds an index doc, so it queues no targeted reconcile"
    ;; Pinned so the no-nudge is a decision, not an accident of the hook removal.
    (t2/insert! :model/OsiAiContext {:entity_type     "table"
                                     :entity_local_id 1
                                     :ai_context      {:instructions "find orders"}})
    (try
      (is (= [] (spying-on-nudges!
                 #(mt/user-http-request :crowberto :post 200 "osi/ai-context/table/1/regenerate"))))
      (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 1)))))

(deftest crud-put-nudges-test
  (testing "PUT nudges the targeted reconcile exactly once, with the normalized stored key"
    (try
      (is (= [["card" 42]]
             (spying-on-nudges!
              #(do (mt/user-http-request :crowberto :put 200 "osi/ai-context/metric/42"
                                         {:ai_context {:instructions "x"}})
                   (mt/user-http-request :crowberto :get 200 "osi/ai-context/metric/42"))))
          "a metric PUT nudges the canonical card key once; GET never nudges")
      (finally (t2/delete! :model/OsiAiContext :entity_type "card" :entity_local_id 42)))))

(deftest crud-delete-nudges-test
  (testing "DELETE nudges the targeted reconcile exactly once"
    (t2/insert! :model/OsiAiContext {:entity_type     "table"
                                     :entity_local_id 1
                                     :ai_context      {:instructions "find orders"}})
    (try
      (is (= [["table" 1]]
             (spying-on-nudges!
              #(mt/user-http-request :crowberto :delete 204 "osi/ai-context/table/1"))))
      (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 1)))))

(deftest nudge-observes-the-committed-ai-context-test
  (testing "the reconcile a write schedules reads the new `ai_context`, not the row as it stood before"
    ;; Toucan runs `before-update` outside its own transaction, so a nudge issued from there would fire
    ;; before the UPDATE and reconcile the old content, with nothing to nudge again afterwards.
    (t2/insert! :model/OsiAiContext {:entity_type     "table"
                                     :entity_local_id 4242
                                     :ai_context      {:synonyms ["before"]}})
    (try
      (let [seen (atom ::never-nudged)]
        (mt/with-dynamic-fn-redefs [mirror/request-entity-sync!
                                    (fn [entity-type entity-local-id]
                                      (reset! seen (t2/select-one-fn :ai_context :model/OsiAiContext
                                                                     :entity_type     entity-type
                                                                     :entity_local_id entity-local-id))
                                      nil)]
          (t2/update! :model/OsiAiContext
                      {:entity_type "table" :entity_local_id 4242}
                      {:ai_context {:synonyms ["after"]}}))
        (is (= {:synonyms ["after"]} @seen)))
      (finally
        (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 4242)))))

(deftest nudge-covers-every-row-a-multi-row-update-touches-test
  (testing "an update matching several entities nudges each of them, not just the first"
    ;; The changes map is published once around the update; the hook runs per affected row.
    (doseq [id [7001 7002]]
      (t2/insert! :model/OsiAiContext {:entity_type     "table"
                                       :entity_local_id id
                                       :ai_context      {:synonyms ["before"]}
                                       :data_source     :human}))
    (try
      (is (= #{["table" 7001] ["table" 7002]}
             (set (spying-on-nudges!
                   #(t2/update! :model/OsiAiContext
                                {:entity_type "table" :data_source :human}
                                {:ai_context {:synonyms ["after"]}})))))
      (finally
        (doseq [id [7001 7002]]
          (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id id))))))
