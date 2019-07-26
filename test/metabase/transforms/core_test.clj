(ns metabase.transforms.core-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.test
             [automagic-dashboards :refer [with-rasta]]
             [data :as data]
             [transforms :refer :all]
             [util :as tu]]
            [metabase.transforms
             [core :as t]
             [specs :as t.specs]]))

(expect
  [:field-id (data/id :venues :price)]
  (#'t/->mbql (Field (data/id :venues :price))))

(expect
  [:field-literal "PRICE" :type/Integer]
  (#'t/->mbql (dissoc (Field (data/id :venues :price)) :id)))

(expect
  [:joined-field "Soruce table" [:field-id (data/id :venues :price)]]
  (#'t/->mbql (assoc (Field (data/id :venues :price)) :source-alias "Source table")))

(expect
  [:sum [:field-id (data/id :venues :price)]]
  (#'t/->mbql [:sum [:field-id (data/id :venues :price)]]))


(expect
  (#'t/satisfy-requirements (data/id) "PUBLIC" test-transform-spec))


(expect
  ["FK" "PK" "Latitude" "Longitude" "Name" "Category"]
  (-> (data/id :venues)
      Table
      (assoc :fields (table/fields {:id (data/id "venues")}))
      (#'t/table-dimensions)
      keys))


;; Run the transform and make sure it produces the correct result
(expect
  [[4 1 10.0646 -165.374 "Red Medicine" 3 1 4 3 2 1]
   [11 2 34.0996 -118.329 "Stout Burgers & Beers" 2 2 11 2 1 1]
   [11 3 34.0406 -118.428 "The Apple Pan" 2 2 11 2 1 1]]
  (with-rasta
    (tu/with-model-cleanup ['Card 'Collection]
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
