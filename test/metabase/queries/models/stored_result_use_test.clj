(ns metabase.queries.models.stored-result-use-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stored-result! []
  (first (t2/insert-returning-pks! :model/StoredResult {:result_data (byte-array [1 2 3])})))

(deftest exploration-reference-required-test
  (testing "stored_result_use requires :exploration_id"
    (mt/with-temp [:model/User        u    {}
                   :model/Exploration expl {:name "sru-test" :creator_id (:id u)}]
      (let [sr-id (stored-result!)]
        (testing "exploration_id succeeds"
          (let [id (first (t2/insert-returning-pks! :model/StoredResultUse
                                                    {:stored_result_id sr-id :exploration_id (:id expl)}))]
            (is (=? {:exploration_id (:id expl)}
                    (t2/select-one :model/StoredResultUse :id id)))))
        (testing "missing exploration_id is rejected"
          (is (thrown? Exception
                       (t2/insert! :model/StoredResultUse {:stored_result_id sr-id}))))))))
