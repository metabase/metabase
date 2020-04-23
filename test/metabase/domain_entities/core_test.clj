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


;; Do we correctly pick the best (most specific and most defined) candidate
(expect
  "Venues"
  (-> test-domain-entity-specs vals (#'de/best-match) :name))


;; Do all the MBQL snippets get instantiated correctly
(expect
  {:metrics             {"Avg Price" {:name        "Avg Price"
                                      :aggregation [:avg (#'de/mbql-reference (Field (data/id :venues :price)))]}}
   :segments            nil
   :breakout_dimensions [(#'de/mbql-reference (Field (data/id :venues :category_id)))]
   :dimensions          (into {} (for [field (:fields (hydrated-table :venues))]
                                   [(-> field (#'de/field-type) name) field]))
   :type                :DomainEntity/Venues
   :description         nil
   :source_table        (data/id :venues)
   :name                "Venues"}
  (with-test-domain-entity-specs
    (de/domain-entity-for-table (hydrated-table :venues))))
