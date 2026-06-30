(ns metabase.osi.models.osi-ai-context-test
  (:require
   [clojure.test :refer :all]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.test :as mt]
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
  (testing "insert, update and delete each request a targeted reconcile of the entity — and nothing else"
    (let [nudges (atom [])]
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [entity-type entity-local-id]
                                                                (swap! nudges conj [entity-type entity-local-id])
                                                                nil)]
        (mt/with-temp [:model/OsiAiContext row (assoc entity :ai_context ai-context)]
          (let [ref [(:entity_type row) (:entity_local_id row)]]
            (is (= [ref] @nudges) "insert nudges once with the entity ref")
            (t2/update! :model/OsiAiContext :entity_type (:entity_type row) :entity_local_id (:entity_local_id row)
                        {:ai_context {:instructions "changed"}})
            (is (= [ref ref] @nudges) "update nudges once with the entity ref")
            (t2/delete! :model/OsiAiContext :entity_type (:entity_type row) :entity_local_id (:entity_local_id row))
            (is (= [ref ref ref] @nudges) "delete nudges once with the entity ref")))))))

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
