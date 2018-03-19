(ns metabase.driver.generic-sql.field-hierarchy-factory-test
  (:require
    [metabase.driver.generic-sql.field-hierarchy-factory :as factory]
    [expectations :refer :all]))


; create list for fields without parent
(expect
  [{:field-id 1 :field-name "id" :base-type "type/Integer" :parent-id nil :parent nil}
   {:field-id 2 :field-name "name" :base-type "type/Text" :parent-id nil :parent nil}]
  (factory/create-from-list [{:field-id 1 :field-name "id" :base-type "type/Integer" :parent-id nil}
                             {:field-id 2 :field-name "name" :base-type "type/Text" :parent-id nil}]))


; create list for fields with parent hierarchy
(expect
  [{:field-id 1 :field-name "id" :base-type "type/Integer" :parent-id nil :parent nil}
   {:field-id 2 :field-name "job" :base-type "type/Dictionary" :parent-id nil :parent nil}
   {:field-id 3 :field-name "name" :base-type "type/Text" :parent-id 2 :parent {:field-id 2 :field-name "job"
                                                                                :base-type "type/Dictionary"
                                                                                :parent-id nil :parent nil}}]
  (factory/create-from-list [{:field-id 1 :field-name "id" :base-type "type/Integer" :parent-id nil}
                             {:field-id 2 :field-name "job" :base-type "type/Dictionary" :parent-id nil}
                             {:field-id 3 :field-name "name" :base-type "type/Text" :parent-id 2}]))


; create list for fields with multi parent hierarchy on the same field
(expect
  [{:field-id 1 :field-name "job" :base-type "type/Dictionary" :parent-id nil :parent nil}
   {:field-id 2 :field-name "run" :base-type "type/Dictionary" :parent-id 1 :parent {:field-id 1 :field-name "job"
                                                                                     :base-type "type/Dictionary"
                                                                                     :parent-id nil :parent nil}}
   {:field-id 3 :field-name "id" :base-type "type/Integer" :parent-id 2
    :parent {:field-id 2 :field-name "run"
             :base-type "type/Dictionary"
             :parent-id 1 :parent {:field-id 1
                                   :field-name "job"
                                   :base-type "type/Dictionary"
                                   :parent-id nil
                                   :parent nil}}}]
  (factory/create-from-list [{:field-id 1 :field-name "job" :base-type "type/Dictionary" :parent-id nil}
                             {:field-id 2 :field-name "run" :base-type "type/Dictionary" :parent-id 1}
                             {:field-id 3 :field-name "id" :base-type "type/Integer" :parent-id 2}]))

