(ns ^:mb/driver-tests metabase.query-processor-test.uuid-test
  "Tests for queries involving uuids."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defmethod driver/database-supports? [::driver/driver ::uuids-in-create-table-statements]
  [_driver _feature _database]
  true)

;; Athena supports uuids in queries, but not in create table
(defmethod driver/database-supports? [:athena ::uuids-in-create-table-statements]
  [_driver _feature _database]
  false)

(deftest ^:parallel simple-uuid-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uuid-type ::uuids-in-create-table-statements)
    (testing "Simple query"
      (mt/dataset uuid-dogs
        (is (= [[#uuid "d6b02fa2-bf7b-4b32-80d5-060b649c9859" "Tim"]]
               (mt/rows
                (mt/run-mbql-query people
                  {:filter [:=
                            [:field (mt/id :people :id) {:base-type "type/UUID"}]
                            "d6b02fa2-bf7b-4b32-80d5-060b649c9859"]}))))))))

(deftest ^:parallel joined-uuid-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uuid-type ::uuids-in-create-table-statements)
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

(deftest ^:parallel field-filter-uuid-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :uuid-type
                                                   ::uuids-in-create-table-statements)
    (testing "uuid field filters"
      (mt/dataset uuid-dogs
        (let [query (assoc (mt/native-query
                             (assoc (mt/count-with-field-filter-query driver/*driver* :people :id "27e164bc-54f8-47a0-a85a-9f0e90dd7667")
                                    :template-tags {"id" {:name         "id"
                                                          :display-name "id"
                                                          :type         :dimension
                                                          :widget-type  :id
                                                          :dimension    [:field (mt/id :people :id) nil]}}))
                           :parameters [{:type   :id
                                         :name   "id"
                                         :target [:dimension [:template-tag "id"]]
                                         :value  "d6b02fa2-bf7b-4b32-80d5-060b649c9859"}])]
          (mt/with-native-query-testing-context query
            (is (= 1 (ffirst (mt/rows (qp/process-query query)))))))))))
