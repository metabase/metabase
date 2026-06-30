(ns metabase.osi.models.osi-ai-context-test
  (:require
   [clojure.test :refer :all]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity {:entity_type "table" :entity_local_id 42})
(def ^:private ai-context {:instructions "Use for total revenue; group by month."
                           :synonyms     ["sales" "turnover"]
                           :examples     ["monthly revenue by region"]})

(defn- by-key
  "Look the row up by its compound key."
  [{:keys [entity_type entity_local_id]}]
  (t2/select-one :model/OsiAiContext :entity_type entity_type :entity_local_id entity_local_id))

(deftest entity-and-ai-context-roundtrip-test
  (testing "ai_context is a keywordized JSON object and timestamps are populated"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context ai-context)]
      (is (=? {:entity_type     "table"
               :entity_local_id 42
               :ai_context      ai-context
               :created_at      some?
               :updated_at      some?}
              (by-key entity))))))

(deftest ai-context-minimal-test
  (testing "ai_context can be a minimal blob (just instructions, no synonyms/examples)"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context {:instructions "Just this."})]
      (is (= {:instructions "Just this."} (:ai_context (by-key entity)))))))

(deftest hooks-nudge-a-targeted-reconcile-test
  (testing "insert, update and delete each nudge the entity's reconcile once — deferred until the txn commits"
    (let [nudges (atom [])
          ref    ["table" 42]]
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [entity-type entity-local-id]
                                                                (swap! nudges conj [entity-type entity-local-id])
                                                                nil)]
        (try
          (testing "insert"
            (t2/with-transaction [_conn]
              (t2/insert! :model/OsiAiContext (assoc entity :ai_context ai-context))
              (is (= [] @nudges) "not nudged while the transaction is still open"))
            (is (= [ref] @nudges) "nudged once, after commit"))
          (testing "update"
            (t2/with-transaction [_conn]
              (t2/update! :model/OsiAiContext :entity_type "table" :entity_local_id 42 {:ai_context {:instructions "changed"}})
              (is (= [ref] @nudges) "still only the insert's nudge while open"))
            (is (= [ref ref] @nudges) "nudged again, after commit"))
          (testing "delete"
            (t2/with-transaction [_conn]
              (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 42)
              (is (= [ref ref] @nudges) "not nudged while open"))
            (is (= [ref ref ref] @nudges) "nudged again, after commit"))
          (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 42)))))))

(deftest nudge-not-fired-on-rollback-test
  (testing "a rolled-back write never nudges (and leaves no row)"
    (let [nudges (atom [])]
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [entity-type entity-local-id]
                                                                (swap! nudges conj [entity-type entity-local-id])
                                                                nil)]
        (u/ignore-exceptions
          (t2/with-transaction [_conn]
            (t2/insert! :model/OsiAiContext (assoc entity :entity_local_id 43 :ai_context ai-context))
            (throw (ex-info "roll back" {}))))
        (is (= [] @nudges))
        (is (nil? (by-key (assoc entity :entity_local_id 43))))))))

(deftest card-flavors-share-one-canonical-key-test
  (testing "card flavors are stored under one canonical \"card\" key (normalized on write), so a metric and
           a model with the same local id are the same primary-key row"
    (mt/with-temp [:model/OsiAiContext _ {:entity_type "metric" :entity_local_id 7
                                          :ai_context {:instructions "x"}}]
      (is (=? {:entity_type "card" :entity_local_id 7 :ai_context {:instructions "x"}}
              (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id 7))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the mirror is unavailable in tests"
    ;; The hooks call the OSS defenterprise shim, which no-ops without an enterprise license. They must
    ;; never throw or fail the authoritative write.
    (mt/with-temp [:model/OsiAiContext row (assoc entity :ai_context ai-context)]
      (let [k [(:entity_type row) (:entity_local_id row)]]
        (testing "update"
          (is (pos? (t2/update! :model/OsiAiContext :entity_type (k 0) :entity_local_id (k 1)
                                {:ai_context {:instructions "u"}})))
          (is (= {:instructions "u"} (:ai_context (by-key entity)))))
        (testing "delete"
          (is (pos? (t2/delete! :model/OsiAiContext :entity_type (k 0) :entity_local_id (k 1))))
          (is (nil? (by-key entity))))))))
