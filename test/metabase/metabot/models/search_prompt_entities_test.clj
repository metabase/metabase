(ns metabase.metabot.models.search-prompt-entities-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private one-entity [{:model "table" :id 42}])
(def ^:private many-entities [{:model "table" :id 1} {:model "card" :id 9}])

(deftest entities-json-roundtrips-test
  (testing "entities is a JSON array, type is keywordized, and timestamps are populated"
    (mt/with-temp [:model/SearchPromptEntity {:keys [id]}
                   {:prompt "monthly revenue by region" :type :canonical :entities one-entity}]
      (is (=? {:prompt     "monthly revenue by region"
               :type       :canonical
               :entities   one-entity
               :verified   false
               :created_at some?
               :updated_at some?}
              (t2/select-one :model/SearchPromptEntity :id id))))))

(deftest multi-entity-sources-persist-test
  (testing "a sources prompt persists its full entity list"
    (mt/with-temp [:model/SearchPromptEntity {sources-id :id}
                   {:prompt "orders joined to customers" :type :sources :entities many-entities}]
      (is (= many-entities (t2/select-one-fn :entities :model/SearchPromptEntity :id sources-id))))))

(deftest entities-validation-test
  (testing "the entities list must be non-empty"
    (is (thrown-with-msg? Exception #"at least one entity"
                          (mt/with-temp [:model/SearchPromptEntity _
                                         {:prompt "x" :type :sources :entities []}]))))
  (testing "a canonical prompt must reference exactly one entity"
    (is (thrown-with-msg? Exception #"exactly one entity"
                          (mt/with-temp [:model/SearchPromptEntity _
                                         {:prompt "x" :type :canonical :entities many-entities}]))))
  (testing "canonical with a single entity, and sources with several, are both fine"
    (mt/with-temp [:model/SearchPromptEntity {c-id :id} {:prompt "c" :type :canonical :entities one-entity}
                   :model/SearchPromptEntity {s-id :id} {:prompt "s" :type :sources :entities many-entities}]
      (is (every? some? [c-id s-id])))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the pgvector mirror is unavailable in tests"
    ;; The after-insert / after-update / before-delete hooks call the pgvector mirror, which no-ops
    ;; under the OSS defenterprise fallback. These must never throw or fail the authoritative write.
    (mt/with-temp [:model/SearchPromptEntity {:keys [id]}
                   {:prompt "p1" :type :canonical :entities one-entity}]
      (testing "update"
        (is (pos? (t2/update! :model/SearchPromptEntity id {:prompt "p1 updated"})))
        (is (= "p1 updated" (t2/select-one-fn :prompt :model/SearchPromptEntity :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/SearchPromptEntity :id id)))
        (is (nil? (t2/select-one :model/SearchPromptEntity :id id)))))))
