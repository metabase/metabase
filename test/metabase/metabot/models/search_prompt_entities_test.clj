(ns metabase.metabot.models.search-prompt-entities-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private canonical-entities
  {:type "canonical" :entity {:model "table" :id 42}})

(def ^:private source-entities
  {:type "sources" :entities [{:model "table" :id 1} {:model "card" :id 9}]})

(deftest entities-json-roundtrips-test
  (testing "the entities column is JSON, round-tripping to a Clojure map with keyword keys"
    (mt/with-temp [:model/SearchPromptEntity {:keys [id]}
                   {:prompt "monthly revenue by region" :entities canonical-entities}]
      (is (=? {:prompt   "monthly revenue by region"
               :entities canonical-entities
               :verified false}
              (t2/select-one :model/SearchPromptEntity :id id))))))

(deftest both-entity-shapes-persist-test
  (testing "both canonical and source-entity-set shapes persist faithfully"
    (mt/with-temp [:model/SearchPromptEntity {sources-id :id}
                   {:prompt "orders joined to customers" :entities source-entities}]
      (is (= source-entities (t2/select-one-fn :entities :model/SearchPromptEntity :id sources-id))))))

(deftest hooks-never-break-appdb-writes-test
  (testing "insert/update/delete succeed even though the pgvector mirror is unavailable in tests"
    ;; The after-insert / after-update / before-delete hooks call the pgvector mirror, which no-ops
    ;; under the OSS defenterprise fallback. These must never throw or fail the authoritative write.
    (mt/with-temp [:model/SearchPromptEntity {:keys [id]}
                   {:prompt "p1" :entities canonical-entities}]
      (testing "update"
        (is (pos? (t2/update! :model/SearchPromptEntity id {:prompt "p1 updated"})))
        (is (= "p1 updated" (t2/select-one-fn :prompt :model/SearchPromptEntity :id id))))
      (testing "delete"
        (is (pos? (t2/delete! :model/SearchPromptEntity :id id)))
        (is (nil? (t2/select-one :model/SearchPromptEntity :id id)))))))
