(ns metabase-enterprise.similarity.models.similarity-community-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential keyword-coercion-roundtrips-test
  (testing "scope and entity_type roundtrip as keywords"
    (mt/with-model-cleanup [:model/SimilarityCommunity]
      (t2/insert! :model/SimilarityCommunity
                  {:scope        :card
                   :entity_type  :card
                   :entity_id    42
                   :community_id 7
                   :centrality   0.5
                   :computed_at  (t/offset-date-time)})
      (let [row (t2/select-one :model/SimilarityCommunity :entity_id 42)]
        (is (= :card (:scope row)))
        (is (= :card (:entity_type row)))
        (is (= 7     (:community_id row)))
        (is (== 0.5  (:centrality row)))))))
