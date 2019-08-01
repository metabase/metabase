(ns metabase.domain-entities.core-test
  (:require [expectations :refer [expect]]
            [metabase.domain-entities.core :as de]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]]))


(expect
  [:field-id (data/id :venues :price)]
  (#'de/mbql-reference (Field (data/id :venues :price))))

(expect
  [:field-literal "PRICE" :type/Integer]
  (#'de/mbql-reference (dissoc (Field (data/id :venues :price)) :id)))


(defn- hydrated-table
  [table-name]
  (let [table (-> table-name data/id Table)]
    (assoc table :fields (table/fields table))))

(expect
  (de/satisfies-requierments? (hydrated-table :venues) (test-domain-entity-specs "Venues")))


(expect
  "Venues"
  (-> test-domain-entity-specs vals (#'de/best-match) :name))


(expect
  {:metrics             {"Avg Price" {:name        "Avg Price"
                                      :aggregation [:avg (#'de/mbql-reference (Field (data/id :venues :price)))]}}
   :segments            nil
   :breakout_dimensions [(#'de/mbql-reference (Field (data/id :venues :category_id)))]
   :dimensions          (into {} (for [field (:fields (hydrated-table :venues))]
                                   [(-> field (#'de/field-type) name) field]))
   :type                :DomainEntity/Venues
   :description         nil
   :source_table        (data/id :venues)}
  (with-test-domain-entity-specs
    (de/domain-entity-for-table (hydrated-table :venues))))
