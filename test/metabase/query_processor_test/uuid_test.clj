(ns ^:mb/driver-tests metabase.query-processor-test.uuid-test
  "Tests for queries involving uuids."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel simple-uuid-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uuid-type)
    (testing "Simple query"
      (mt/dataset uuid-dogs
        (is (= [[#uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859" "Tim"]]
               (mt/rows
                (mt/run-mbql-query people
                  {:filter [:=
                            [:field (mt/id :people :id) {:base-type "type/UUID"}]
                            "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]}))))))))

(deftest ^:parallel joined-uuid-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uuid-type)
    (testing "Query with joins"
      (mt/dataset uuid-dogs
        (is (= [[#uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859" "Tim"]]
               (mt/rows
                (mt/run-mbql-query people
                  {:joins [{:source-table $$dogs
                            :condition    [:= &d.dogs.person_id $people.id]
                            :alias        "d"}]
                   :filter [:=
                            [:field (mt/id :dogs :id) {:base-type "type/UUID"}]
                            "27e164bc-54f8-47a0-a85a-9f0e90dd7667"]}))))))))
