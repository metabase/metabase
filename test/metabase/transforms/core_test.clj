(ns metabase.transforms.core-test
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.domain-entities.specs :as de.specs]
            [metabase.models
             [card :as card :refer [Card]]
             [collection :refer [Collection]]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]
             [transforms :refer :all]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [metabase.transforms
             [core :as t]
             [specs :as t.specs]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def test-bindings
  (delay
   (with-test-domain-entity-specs
     {"Venues" {:dimensions {"ID"        [:field-id (data/id :venues :id)],
                             "NAME"      [:field-id (data/id :venues :name)],
                             "PRICE"     [:field-id (data/id :venues :price)],
                             "FK"        [:field-id (data/id :venues :category_id)],
                             "Longitude" [:field-id (data/id :venues :longitude)],
                             "Latitude"  [:field-id (data/id :venues :latitude)]}
                :entity     (m/find-first (comp #{(data/id :venues)} u/get-id) (#'t/tableset (data/id) "PUBLIC"))}})))

;; Can we accure bindings?
(let [new-bindings {"D2" [:sum [:field-id 4]]
                    "D3" [:field-id 5]}]
  (expect
    (update-in @test-bindings ["Venues" :dimensions] merge new-bindings)
    (#'t/add-bindings @test-bindings "Venues" new-bindings)))

;; Gracefully handle nil
(expect
    @test-bindings
    (#'t/add-bindings @test-bindings "Venues" nil))


(expect
  "PRICE"
  (#'t/mbql-reference->col-name [:field-id (data/id :venues :price)]))

(expect
  "PRICE"
  (#'t/mbql-reference->col-name [:field-literal "PRICE" :type/Integer]))

(expect
  "PRICE"
  (#'t/mbql-reference->col-name [{:foo [:field-id (data/id :venues :price)]}]))


;; Can we turn a given entity into a format suitable for a query's `:source_table`?
(expect
  (data/id :venues)
  (#'t/->source-table-reference (Table (data/id :venues))))

(tt/expect-with-temp [Card [{card-id :id}]]
  (str "card__" card-id)
  (#'t/->source-table-reference (Card card-id)))


;; Can we get a tableset for a given schema?
(expect
  (db/select-ids Table :db_id (data/id))
  (set (map u/get-id (#'t/tableset (data/id) "PUBLIC"))))


;; Can we filter a tableset by domain entity?
(expect
  [(data/id :venues)]
  (with-test-domain-entity-specs
    (map u/get-id (#'t/find-tables-with-domain-entity (#'t/tableset (data/id) "PUBLIC")
                                                      (@de.specs/domain-entity-specs "Venues")))))

;; Greacefully handle no-match
(expect
  nil
  (with-test-domain-entity-specs
    (not-empty
     (#'t/find-tables-with-domain-entity [] (@de.specs/domain-entity-specs "Venues")))))


;; Can we extract results from the final bindings?
(expect
  [(data/id :venues)]
  (with-test-transform-specs
    (map u/get-id (#'t/resulting-entities {"VenuesEnhanced" {:entity     (Table (data/id :venues))
                                                             :dimensions {"D1" [:field-id 1]}}}
                                          (first @t.specs/transform-specs)))))


;; Can we find a table set matching requirements of a given spec?
(expect
  [(data/id :venues)]
  (with-test-transform-specs
    (with-test-domain-entity-specs
      (map u/get-id (#'t/tables-matching-requirements (#'t/tableset (data/id) "PUBLIC")
                                                      (first @t.specs/transform-specs))))))


;; Can we turn a tableset into corresponding bindings?
(expect
  @test-bindings
  (with-test-domain-entity-specs
    (#'t/tableset->bindings (filter (comp #{(data/id :venues)} u/get-id) (#'t/tableset (data/id) "PUBLIC")))))


;; Is the validation of results working?
(expect
  (with-test-domain-entity-specs
    (with-test-transform-specs
      (#'t/validate-results {"VenuesEnhanced" {:entity     (card/map->CardInstance
                                                             {:result_metadata [{:name "AvgPrice"}
                                                                                {:name "MaxPrice"}
                                                                                {:name "MinPrice"}]})
                                               :dimensions {"D1" [:field-id 1]}}}
                            (first @t.specs/transform-specs)))))

;; ... and do we throw if we didn't get what we expected?
(expect
  java.lang.AssertionError
  (with-test-domain-entity-specs
    (with-test-transform-specs
      (#'t/validate-results {"VenuesEnhanced" {:entity     (Table (data/id :venues))
                                               :dimensions {"D1" [:field-id 1]}}}
                            (first @t.specs/transform-specs)))))


;; Run the transform and make sure it produces the correct result
(expect
  [[3 4 -165.374 10.0646 1 "Red Medicine" 1 4 3 2 1]
   [2 11 -118.329 34.0996 2 "Stout Burgers & Beers" 2 11 2 1 1]
   [2 11 -118.428 34.0406 3 "The Apple Pan" 2 11 2 1 1]]
  (test-users/with-test-user :rasta
    (with-test-domain-entity-specs
      (tu/with-model-cleanup [Card Collection]
        (-> (t/apply-transform! (data/id) "PUBLIC" test-transform-spec)
            first
            :dataset_query
            qp/process-query
            :data
            :rows)))))


;; Can we find the right transform(s) for a given table
(expect
  "Test transform"
  (with-test-transform-specs
    (with-test-domain-entity-specs
      (-> (t/candidates (Table (data/id :venues)))
          first
          :name))))
