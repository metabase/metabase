(ns metabase.semantic-layer-search.models.semantic-layer-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.semantic-layer-search.mirror :as mirror]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private one-entity [{:model "table" :id 42}])
(def ^:private many-entities [{:model "table" :id 1} {:model "card" :id 9}])

(deftest entities-json-roundtrips-test
  (testing "entities is a JSON array, type is keywordized, and timestamps are populated"
    (mt/with-temp [:model/SemanticLayerIndex {:keys [id]}
                   {:search_prompt "monthly revenue by region" :type :canonical :entities one-entity}]
      (is (=? {:search_prompt "monthly revenue by region"
               :type          :canonical
               :entities      one-entity
               :verified      false
               :created_at    some?
               :updated_at    some?}
              (t2/select-one :model/SemanticLayerIndex :id id))))))

(deftest usage-instructions-persist-test
  (testing "usage_instructions persists alongside the prompt"
    (mt/with-temp [:model/SemanticLayerIndex {:keys [id]}
                   {:search_prompt "monthly revenue by region" :type :canonical :entities one-entity
                    :usage_instructions "Use this metric for total revenue; group by month."}]
      (is (= "Use this metric for total revenue; group by month."
             (t2/select-one-fn :usage_instructions :model/SemanticLayerIndex :id id)))))
  (testing "usage_instructions is optional (nil when omitted)"
    (mt/with-temp [:model/SemanticLayerIndex {:keys [id]}
                   {:search_prompt "orders" :type :sources :entities one-entity}]
      (is (nil? (t2/select-one-fn :usage_instructions :model/SemanticLayerIndex :id id))))))

(deftest multi-entity-sources-persist-test
  (testing "a sources entry persists its full entity list"
    (mt/with-temp [:model/SemanticLayerIndex {sources-id :id}
                   {:search_prompt "orders joined to customers" :type :sources :entities many-entities}]
      (is (= many-entities (t2/select-one-fn :entities :model/SemanticLayerIndex :id sources-id))))))

(deftest entities-validation-test
  (testing "the entities list must be non-empty"
    (is (thrown-with-msg? Exception #"at least one entity"
                          (mt/with-temp [:model/SemanticLayerIndex _
                                         {:search_prompt "x" :type :sources :entities []}]))))
  (testing "a canonical entry must reference exactly one entity"
    (is (thrown-with-msg? Exception #"exactly one entity"
                          (mt/with-temp [:model/SemanticLayerIndex _
                                         {:search_prompt "x" :type :canonical :entities many-entities}]))))
  (testing "canonical with a single entity, and sources with several, are both fine"
    (mt/with-temp [:model/SemanticLayerIndex {c-id :id} {:search_prompt "c" :type :canonical :entities one-entity}
                   :model/SemanticLayerIndex {s-id :id} {:search_prompt "s" :type :sources :entities many-entities}]
      (is (every? some? [c-id s-id])))))

(deftest hooks-nudge-the-background-sync-test
  (testing "insert, update and delete each request a background sync — and do nothing else"
    (let [nudges (atom 0)]
      (mt/with-dynamic-fn-redefs [mirror/request-sync! (fn [] (swap! nudges inc) nil)]
        (mt/with-temp [:model/SemanticLayerIndex {:keys [id]}
                       {:search_prompt "p1" :type :canonical :entities one-entity}]
          (is (= 1 @nudges) "insert nudges once")
          (t2/update! :model/SemanticLayerIndex id {:search_prompt "p1 updated"})
          (is (= 2 @nudges) "update nudges once")
          (t2/delete! :model/SemanticLayerIndex :id id)
          (is (= 3 @nudges) "delete nudges once"))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the mirror is unavailable in tests"
    ;; The hooks call the OSS defenterprise shim, which no-ops without an enterprise license. They must
    ;; never throw or fail the authoritative write.
    (mt/with-temp [:model/SemanticLayerIndex {:keys [id]}
                   {:search_prompt "p1" :type :canonical :entities one-entity}]
      (testing "update"
        (is (pos? (t2/update! :model/SemanticLayerIndex id {:search_prompt "p1 updated"})))
        (is (= "p1 updated" (t2/select-one-fn :search_prompt :model/SemanticLayerIndex :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/SemanticLayerIndex :id id)))
        (is (nil? (t2/select-one :model/SemanticLayerIndex :id id)))))))
