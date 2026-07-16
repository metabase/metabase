(ns metabase.queries.models.stored-result-use-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stored-result! []
  (first (t2/insert-returning-pks! :model/StoredResult {:result_data (byte-array [1 2 3])})))

(deftest exactly-one-reference-required-test
  (testing "stored_result_use requires exactly one of :card_id / :exploration_id"
    (mt/with-temp [:model/User       u    {}
                   :model/Collection coll {}
                   :model/Card       card {:collection_id (:id coll)}
                   :model/Exploration expl {:name "sru-test" :creator_id (:id u)}]
      (let [sr-id (stored-result!)]
        (testing "card_id only succeeds"
          (let [id (first (t2/insert-returning-pks! :model/StoredResultUse
                                                    {:stored_result_id sr-id :card_id (:id card)}))]
            (is (=? {:card_id (:id card) :exploration_id nil}
                    (t2/select-one :model/StoredResultUse :id id)))))
        (testing "neither set is rejected"
          (is (thrown? Exception
                       (t2/insert! :model/StoredResultUse {:stored_result_id sr-id}))))
        (testing "both set is rejected"
          (is (thrown? Exception
                       (t2/insert! :model/StoredResultUse
                                   {:stored_result_id sr-id
                                    :card_id          (:id card)
                                    :exploration_id   (:id expl)}))))))))

(deftest exploration-reference-test
  (testing "exploration_id only succeeds"
    (mt/with-temp [:model/User        u    {}
                   :model/Exploration expl {:name "sru-test" :creator_id (:id u)}]
      (let [sr-id (stored-result!)
            id    (first (t2/insert-returning-pks! :model/StoredResultUse
                                                   {:stored_result_id sr-id :exploration_id (:id expl)}))]
        (is (=? {:card_id nil :exploration_id (:id expl)}
                (t2/select-one :model/StoredResultUse :id id)))))))
