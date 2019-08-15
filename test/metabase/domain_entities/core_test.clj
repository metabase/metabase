(ns metabase.domain-entities.core-test
  (:require [expectations :refer [expect]]
            [metabase.domain-entities.core :as de]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]]
            [toucan.hydrate :as hydrate]))


(expect
  [:field-id (data/id :venues :price)]
  (#'de/mbql-reference (Field (data/id :venues :price))))

(expect
  [:field-literal "PRICE" :type/Integer]
  (#'de/mbql-reference (dissoc (Field (data/id :venues :price)) :id)))


(defn- hydrated-table
  [table-name]
  (-> table-name data/id Table (hydrate/hydrate :fields)))

(expect
  (de/satisfies-requierments? (hydrated-table :venues) (test-domain-entity-specs "Venues")))


;; Pick the least specific type
(expect
  {:special_type :type/Float}
  (#'de/best-match-for-dimension [{:special_type :type/Income}
                                  {:special_type :type/Float}
                                  {:special_type :type/Currency}]))

;; ... if there's a tie, pick the shortest name
(expect
  {:special_type :type/Income :name "income"}
  (#'de/best-match-for-dimension [{:special_type :type/Income :name "income_after_taxes"}
                                  {:special_type :type/Income :name "income"}]))


;; Do we correctly build a dimensions map of a table for a given spec
(expect
  {"PRICE"     (Field (data/id :venues :price))
   "FK"        (Field (data/id :venues :category_id))
   "Longitude" (Field (data/id :venues :longitude))
   "Latitude"  (Field (data/id :venues :latitude))}
  (#'de/fields->dimensions (test-domain-entity-specs "Venues") (:fields (hydrated-table :venues))))


;; Do we correctly pick the best (most specific and most defined) candidate
(expect
  "Venues"
  (-> test-domain-entity-specs vals (#'de/most-specific-domain-entity) :name))


;; Do all the MBQL snippets get instantiated correctly
(expect
  {:metrics             {"Avg Price" {:name        "Avg Price"
                                      :aggregation [:avg (#'de/mbql-reference (Field (data/id :venues :price)))]}}
   :segments            nil
   :breakout_dimensions [(#'de/mbql-reference (Field (data/id :venues :category_id)))]
   :dimensions          (#'de/fields->dimensions (test-domain-entity-specs "Venues")
                                                 (:fields (hydrated-table :venues)))
   :type                :DomainEntity/Venues
   :description         nil
   :source_table        (data/id :venues)
   :name                "Venues"}
  (with-test-domain-entity-specs
    (de/domain-entity-for-table (hydrated-table :venues))))
