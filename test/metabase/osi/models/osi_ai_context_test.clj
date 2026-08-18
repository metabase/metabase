(ns metabase.osi.models.osi-ai-context-test
  (:require
   [clojure.test :refer :all]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.models.serialization :as serdes]
   ;; Load the model's serdes defmethods (make-spec, load-update!) so an isolated run of this namespace
   ;; doesn't fall through to the compound-key-incorrect defaults.
   [metabase.osi.models.osi-ai-context]
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

(deftest string-ai-context-migrates-to-instructions-test
  (testing "the OSI string shorthand is migrated to {:instructions s} on write, so storage is always the
           object form (this covers every write path — the coercion is in the model transform, not the API)"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context "Use for revenue questions.")]
      (is (= {:instructions "Use for revenue questions."} (:ai_context (by-key entity)))))))

(deftest model-writes-nudge-the-index-test
  (testing "the nudge hangs off the model, so a writer with nowhere obvious to call one from — a serdes
           import, a direct t2 write — still gets its change indexed without the periodic reconcile"
    (let [nudges (atom [])]
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [entity-type entity-local-id]
                                                                (swap! nudges conj [entity-type entity-local-id])
                                                                nil)]
        (try
          (t2/insert! :model/OsiAiContext (assoc entity :ai_context ai-context))
          (t2/update! :model/OsiAiContext :entity_type "table" :entity_local_id 42
                      {:ai_context {:instructions "changed"}})
          (is (= [["table" 42] ["table" 42]] @nudges)
              "an insert and an ai_context update each nudge once")
          (reset! nudges [])
          (t2/update! :model/OsiAiContext :entity_type "table" :entity_local_id 42
                      {:generator_version "v1"})
          (is (= [] @nudges)
              "a write touching only generation metadata feeds no index doc, so it nudges nothing")
          (reset! nudges [])
          (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 42)
          (is (= [["table" 42]] @nudges) "a delete nudges so the entity's docs are collected")
          (finally (t2/delete! :model/OsiAiContext :entity_type "table" :entity_local_id 42)))))))

(deftest card-flavors-share-one-canonical-key-test
  (testing "card flavors are stored under one canonical \"card\" key (normalized on write), so a metric and
           a model with the same local id are the same primary-key row"
    (mt/with-temp [:model/OsiAiContext _ {:entity_type "metric" :entity_local_id 7
                                          :ai_context {:instructions "x"}}]
      (is (=? {:entity_type "card" :entity_local_id 7 :ai_context {:instructions "x"}}
              (t2/select-one :model/OsiAiContext :entity_type "card" :entity_local_id 7))))))

;;; ------------------------------------------- Generation metadata -------------------------------------------

(deftest generation-metadata-defaults-test
  (testing "a row written without generation metadata is human-approved with no generation state"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context ai-context)]
      (is (= {:data_source          :human
              :generated_at         nil
              :invalidated_at       nil
              :basis_invalidated_at nil
              :basis                nil
              :rewrite_requested_at nil
              :generator_version    nil}
             (select-keys (by-key entity)
                          [:data_source :generated_at :invalidated_at :basis_invalidated_at :basis
                           :rewrite_requested_at :generator_version]))))))

(deftest data-source-keyword-roundtrip-test
  (testing "data_source is a keyword in Clojure and a plain string in the appdb"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context ai-context :data_source :metabot)]
      (is (= :metabot (:data_source (by-key entity))))
      (is (= "metabot"
             (:data_source (t2/query-one {:select [:data_source]
                                          :from   [:osi_ai_context]
                                          :where  [:and
                                                   [:= :entity_type "table"]
                                                   [:= :entity_local_id 42]]}))))))
  (testing "unknown approval states are rejected on inserts and updates"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"data_source must be one of"
                          (t2/insert! :model/OsiAiContext
                                      (assoc entity :entity_local_id 43 :ai_context ai-context
                                             :data_source :unknown))))
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context ai-context)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"data_source must be one of"
                            (t2/update! :model/OsiAiContext entity {:data_source :unknown}))))))

(deftest basis-json-roundtrip-test
  (testing "basis round-trips as a keywordized map, so the job's stored-vs-fresh comparison is by value"
    (let [basis {:name "Orders"
                 :description nil
                 :active true
                 :card-type "metric"
                 :dimensions [{:name "created_at" :position 1}]}]
      (mt/with-temp [:model/OsiAiContext _ (assoc entity :ai_context ai-context :basis basis)]
        (is (= basis (:basis (by-key entity))))))))

(deftest serdes-import-approval-and-invalidation-test
  (testing "an old export with no data_source imports as human-approved"
    (let [import-data-source (get-in (serdes/make-spec "OsiAiContext" nil)
                                     [:transform :data_source :import])]
      (is (= :human (import-data-source nil)))
      (is (= :metabot (import-data-source "metabot")))))
  (testing "replacing imported content clears target-local generation claims"
    (let [updated (atom nil)
          local   (merge entity {:ai_context {:instructions "old"}
                                 :data_source :metabot
                                 :generated_at :generated
                                 :basis_invalidated_at :basis-invalidated
                                 :basis {:name "old"}
                                 :rewrite_requested_at :rewrite
                                 :generator_version "v1"})]
      (mt/with-dynamic-fn-redefs [t2/update! (fn [_model _key1 _value1 _key2 _value2 attrs]
                                               (reset! updated attrs)
                                               1)
                                  t2/select-one (constantly nil)]
        (serdes/load-update! "OsiAiContext"
                             {:ai_context {:instructions "imported"} :data_source :human}
                             local))
      (is (= {:ai_context {:instructions "imported"}
              :data_source :human
              :generated_at nil
              :basis_invalidated_at nil
              :basis nil
              :rewrite_requested_at nil
              :generator_version nil}
             @updated))))
  (testing "equivalent string shorthand does not manufacture a content change"
    (let [updated (atom nil)]
      (mt/with-dynamic-fn-redefs [t2/update! (fn [_model _key1 _value1 _key2 _value2 attrs]
                                               (reset! updated attrs)
                                               1)
                                  t2/select-one (constantly nil)]
        (serdes/load-update! "OsiAiContext"
                             {:ai_context "same" :data_source :human}
                             (merge entity {:ai_context {:instructions "same"}
                                            :generated_at :generated
                                            :basis {:name "same"}})))
      (is (= {:ai_context "same" :data_source :human} @updated)))))

(deftest ai-context-storage-schema-test
  (testing "unknown keys survive storage for forward-compatible SerDes round trips"
    (mt/with-temp [:model/OsiAiContext _ (assoc entity :entity_local_id 44
                                                :ai_context {:instructions "x" :future-key "y"})]
      (is (= {:instructions "x" :future-key "y"}
             (:ai_context (by-key (assoc entity :entity_local_id 44)))))))
  (testing "known fields remain bounded at the model boundary"
    (is (thrown? clojure.lang.ExceptionInfo
                 (t2/insert! :model/OsiAiContext
                             (assoc entity :entity_local_id 45
                                    :ai_context {:instructions (apply str (repeat 5001 "x"))}))))))
