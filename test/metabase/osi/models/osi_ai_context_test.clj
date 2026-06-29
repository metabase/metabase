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

(deftest entity-and-ai-context-roundtrip-test
  (testing "ai_context is a keywordized JSON object and timestamps are populated"
    (mt/with-temp [:model/OsiAiContext {:keys [id]} (assoc entity :ai_context ai-context)]
      (is (=? {:entity_type     "table"
               :entity_local_id 42
               :ai_context      ai-context
               :created_at      some?
               :updated_at      some?}
              (t2/select-one :model/OsiAiContext :id id))))))

(deftest ai-context-minimal-test
  (testing "ai_context can be a minimal blob (just instructions, no synonyms/examples)"
    (mt/with-temp [:model/OsiAiContext {:keys [id]} (assoc entity :ai_context {:instructions "Just this."})]
      (is (= {:instructions "Just this."}
             (t2/select-one-fn :ai_context :model/OsiAiContext :id id))))))

(deftest hooks-nudge-a-targeted-reconcile-test
  (testing "insert, update and delete each request a targeted reconcile of the entity — and nothing else"
    (let [nudges (atom [])]
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [entity-type entity-local-id]
                                                                (swap! nudges conj [entity-type entity-local-id])
                                                                nil)]
        (mt/with-temp [:model/OsiAiContext {:keys [id] :as row} (assoc entity :ai_context ai-context)]
          (let [ref [(:entity_type row) (:entity_local_id row)]]
            (is (= [ref] @nudges) "insert nudges once with the entity ref")
            (t2/update! :model/OsiAiContext id {:ai_context {:instructions "changed"}})
            (is (= [ref ref] @nudges) "update nudges once with the entity ref")
            (t2/delete! :model/OsiAiContext :id id)
            (is (= [ref ref ref] @nudges) "delete nudges once with the entity ref")))))))

(deftest cannot-re-point-to-a-different-entity-test
  (mt/with-temp [:model/OsiAiContext {:keys [id]} (assoc entity :ai_context ai-context)]
    (testing "changing entity_local_id is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot re-point"
                            (t2/update! :model/OsiAiContext id {:entity_local_id 99}))))
    (testing "changing entity_type to a different stored type is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot re-point"
                            (t2/update! :model/OsiAiContext id {:entity_type "metric" :entity_local_id 42}))))
    (testing "a no-op type relabel that normalizes to the same stored type rides along without a re-point error"
      (mt/with-temp [:model/OsiAiContext {card-id :id} {:entity_type "metric" :entity_local_id 7
                                                        :ai_context {:instructions "x"}}]
        ;; stored as "card"; re-labelling to "model" normalizes back to "card", so it isn't a re-point
        (is (pos? (t2/update! :model/OsiAiContext card-id {:entity_type "model" :entity_local_id 7
                                                           :ai_context {:instructions "y"}})))
        (is (=? {:entity_type "card" :entity_local_id 7 :ai_context {:instructions "y"}}
                (t2/select-one :model/OsiAiContext :id card-id)))))
    (testing "an ai_context-only update still works"
      (is (pos? (t2/update! :model/OsiAiContext id {:ai_context {:instructions "changed"}}))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the mirror is unavailable in tests"
    ;; The hooks call the OSS defenterprise shim, which no-ops without an enterprise license. They must
    ;; never throw or fail the authoritative write.
    (mt/with-temp [:model/OsiAiContext {:keys [id]} (assoc entity :ai_context ai-context)]
      (testing "update"
        (is (pos? (t2/update! :model/OsiAiContext id {:ai_context {:instructions "u"}})))
        (is (= {:instructions "u"} (t2/select-one-fn :ai_context :model/OsiAiContext :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/OsiAiContext :id id)))
        (is (nil? (t2/select-one :model/OsiAiContext :id id)))))))
