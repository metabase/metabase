(ns metabase-enterprise.similarity.models.similarity-pagerank-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential keyword-coercion-roundtrips-test
  (testing "scope and entity_type roundtrip as keywords"
    (mt/with-model-cleanup [:model/SimilarityPagerank]
      (t2/insert! :model/SimilarityPagerank
                  {:scope       :card
                   :entity_type :card
                   :entity_id   100
                   :score       0.0123
                   :rank        1
                   :computed_at (t/offset-date-time)})
      (let [row (t2/select-one :model/SimilarityPagerank :entity_id 100)]
        (is (= :card (:scope row)))
        (is (= :card (:entity_type row)))
        (is (= 1     (:rank row)))
        (is (== 0.0123 (:score row)))))))
