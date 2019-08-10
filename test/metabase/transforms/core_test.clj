(ns metabase.transforms.core-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.test
             [data :as data]
             [transforms :refer :all]
             [util :as tu]]
            [metabase.test.data.users :as test-users]))

(expect
  [:field-id (data/id :venues :price)]
  (#'t/mbql-reference (Field (data/id :venues :price))))

(expect
  [:field-literal "PRICE" :type/Integer]
  (#'t/mbql-reference (dissoc (Field (data/id :venues :price)) :id)))


(expect
  (#'t/satisfy-requirements (data/id) "PUBLIC" test-transform-spec))


;; Run the transform and make sure it produces the correct result
(expect
  [[4 1 10.0646 -165.374 "Red Medicine" 3 1 4 3 2 1]
   [11 2 34.0996 -118.329 "Stout Burgers & Beers" 2 2 11 2 1 1]
   [11 3 34.0406 -118.428 "The Apple Pan" 2 2 11 2 1 1]]
  (test-users/with-test-user :rasta
    (tu/with-model-cleanup [Card Collection]
      (-> (t/apply-transform! (data/id) "PUBLIC" test-transform-spec)
          first
          Card
          :dataset_query
          qp/process-query
          :data
          :rows))))


(expect
  "Test transform"
  (with-test-transform-specs
    (-> (t/candidates (Table (data/id :venues)))
        first
        :name)))
