(ns metabase.domain-entities.core-test
  (:require [clojure.test :refer :all]
            [metabase.domain-entities.core :as de]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.test.data :as data]
            [metabase.test.domain-entities :as test.domain-entities]
            [toucan.hydrate :as hydrate]))

(deftest mbql-reference-test
  (is (= [:field (data/id :venues :price) nil]
         (#'de/mbql-reference (Field (data/id :venues :price)))))

  (is (= [:field "PRICE" {:base-type :type/Integer}]
         (#'de/mbql-reference (dissoc (Field (data/id :venues :price)) :id)))))

(defn- hydrated-table
  [table-name]
  (-> table-name data/id Table (hydrate/hydrate :fields)))

(deftest satisfies-requierments?-test
  (is (de/satisfies-requierments? (hydrated-table :venues) (test.domain-entities/test-domain-entity-specs "Venues"))))

(deftest best-match-test
  (testing "Do we correctly pick the best (most specific and most defined) candidate"
    (is (= "Venues"
           (-> test.domain-entities/test-domain-entity-specs vals (#'de/best-match) :name)))))

(deftest instantiate-snippets-test
  (testing "Do all the MBQL snippets get instantiated correctly"
    (test.domain-entities/with-test-domain-entity-specs
      (is (= {:metrics             {"Avg Price" {:name        "Avg Price"
                                                 :aggregation [:avg (#'de/mbql-reference (Field (data/id :venues :price)))]}}
              :segments            nil
              :breakout_dimensions [(#'de/mbql-reference (Field (data/id :venues :category_id)))]
              :dimensions          (into {} (for [field (:fields (hydrated-table :venues))]
                                              [(-> field (#'de/field-type) name) field]))
              :type                :DomainEntity/Venues
              :description         nil
              :source_table        (data/id :venues)
              :name                "Venues"}
             (de/domain-entity-for-table (hydrated-table :venues)))))))
