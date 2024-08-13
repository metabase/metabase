(ns metabase.xrays.domain-entities.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :as table :refer [Table]]
   [metabase.test.data :as data]
   [metabase.xrays.domain-entities.core :as de]
   [metabase.xrays.test-util.domain-entities :as test.de]
   [toucan2.core :as t2]))

(deftest ^:parallel mbql-reference-test
  (is (= [:field (data/id :venues :price) nil]
         (#'de/mbql-reference (t2/select-one Field :id (data/id :venues :price)))))

  (is (= [:field "PRICE" {:base-type :type/Integer}]
         (#'de/mbql-reference (dissoc (t2/select-one Field :id (data/id :venues :price)) :id)))))

(defn- hydrated-table
  [table-name]
  (-> (t2/select-one Table :id (data/id table-name))
      (t2/hydrate :fields)))

(deftest ^:parallel satisfies-requierments?-test
  (is (de/satisfies-requierments? (hydrated-table :venues) (test.de/test-domain-entity-specs "Venues"))))

(deftest ^:parallel best-match-test
  (testing "Do we correctly pick the best (most specific and most defined) candidate"
    (is (= "Venues"
           (-> test.de/test-domain-entity-specs vals (#'de/best-match) :name)))))

(deftest instantiate-snippets-test
  (testing "Do all the MBQL snippets get instantiated correctly"
    (test.de/with-test-domain-entity-specs!
      (is (= {:metrics             {"Avg Price" {:name        "Avg Price"
                                                 :aggregation [:avg (#'de/mbql-reference (t2/select-one Field :id (data/id :venues :price)))]}}
              :segments            nil
              :breakout_dimensions [(#'de/mbql-reference (t2/select-one Field :id (data/id :venues :category_id)))]
              :dimensions          (into {} (for [field (:fields (hydrated-table :venues))]
                                              [(-> field (#'de/field-type) name) field]))
              :type                :DomainEntity/Venues
              :description         nil
              :source_table        (data/id :venues)
              :name                "Venues"}
             (de/domain-entity-for-table (hydrated-table :venues)))))))
