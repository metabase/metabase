(ns metabase-enterprise.representations.v0.common-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [toucan2.core :as t2]))

(deftest type->model-test
  (is (thrown? clojure.lang.ExceptionInfo (v0-common/type->model :unknown))))

(deftest map-entity-index-lookup-success-test
  (testing "MapEntityIndex successfully looks up entity by ref"
    (let [card (t2/instance :model/Card {:id 123 :name "Test Question" :type :question})
          idx (v0-common/map-entity-index {"question-123" card})
          result (v0-common/lookup-id idx "ref:question-123")]
      (is (= 123 result)))))

(deftest map-entity-index-lookup-ref-not-found-test
  (testing "MapEntityIndex throws exception when ref not found"
    (let [card (t2/instance :model/Card {:id 123 :name "Test Card" :type :question})
          idx (v0-common/map-entity-index {"card-123" card})]
      (is (nil? (v0-common/lookup-id idx "ref:card-999"))))))

(deftest map-entity-index-strips-ref-prefix-test
  (testing "MapEntityIndex handles ref: prefix correctly"
    (let [card (t2/instance :model/Card {:id 456 :name "Another Card" :type :question})
          idx (v0-common/map-entity-index {"card-456" card})]
      (is (= 456 (v0-common/lookup-id idx "ref:card-456"))))))

(deftest parse-ref-entity-index-success-test
  (testing "ParseRefEntityIndex successfully parses ref and returns ID as Long"
    (let [idx (v0-common/->ParseRefEntityIndex)]
      (is (= 123 (v0-common/lookup-id idx "ref:database-123")))
      (is (= 456 (v0-common/lookup-id idx "ref:question-456")))
      (is (= 789 (v0-common/lookup-id idx "ref:model-789")))
      (is (instance? Long (v0-common/lookup-id idx "ref:database-123"))))))

(deftest parse-ref-entity-index-malformed-ref-test
  (testing "ParseRefEntityIndex throws exception for malformed refs"
    (let [idx (v0-common/->ParseRefEntityIndex)]
      (testing "ref without dash separator"
        (is (thrown? NumberFormatException
                     (v0-common/lookup-id idx "ref:database123"))))
      (testing "ref with non-numeric ID"
        (is (thrown? NumberFormatException
                     (v0-common/lookup-id idx "ref:database-abc")))))))

(deftest entity-lookup-protocol-satisfaction-test
  (testing "Both implementations satisfy EntityLookup protocol"
    (let [map-idx (v0-common/map-entity-index {})
          parse-idx (v0-common/->ParseRefEntityIndex)]
      (is (satisfies? v0-common/EntityLookup map-idx))
      (is (satisfies? v0-common/EntityLookup parse-idx)))))
