(ns metabase.transforms.core-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.domain-entities.core :as de]
            [metabase.domain-entities.specs :as de.specs]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.domain-entities :refer :all]
            [metabase.test.transforms :refer :all]
            [metabase.transforms.core :as t]
            [metabase.transforms.specs :as t.specs]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:private test-bindings
  (delay
   (with-test-domain-entity-specs
     (let [table (m/find-first (comp #{(mt/id :venues)} u/the-id) (#'t/tableset (mt/id) "PUBLIC"))]
       {"Venues" {:dimensions (m/map-vals de/mbql-reference (get-in table [:domain_entity :dimensions]))
                  :entity     table}}))))

(deftest add-bindings-test
  (testing "Can we accure bindings?"
    (let [new-bindings {"D2" [:sum [:field-id 4]]
                        "D3" [:field-id 5]}]
      (is (= (update-in @test-bindings ["Venues" :dimensions] merge new-bindings)
             (#'t/add-bindings @test-bindings "Venues" new-bindings)))))

  (testing "Gracefully handle nil"
    (is (= @test-bindings
           (#'t/add-bindings @test-bindings "Venues" nil)))))

(deftest mbql-reference->col-name-test
  (is (= "PRICE"
         (#'t/mbql-reference->col-name [:field (mt/id :venues :price) nil])))
  (is (= "PRICE"
         (#'t/mbql-reference->col-name [:field "PRICE" {:base-type :type/Integer}])))
  (is (= "PRICE"
         (#'t/mbql-reference->col-name [{:foo [:field (mt/id :venues :price) nil]}]))))

(deftest ->source-table-reference-test
  (testing "Can we turn a given entity into a format suitable for a query's `:source_table`?"
    (testing "for a Table"
      (is (= (mt/id :venues)
             (#'t/->source-table-reference (Table (mt/id :venues))))))

    (testing "for a Card"
      (mt/with-temp Card [{card-id :id}]
        (is (= (str "card__" card-id)
               (#'t/->source-table-reference (Card card-id))))))))

(deftest tableset-test
  (testing "Can we get a tableset for a given schema?"
    (is (= (db/select-ids Table :db_id (mt/id))
           (set (map u/the-id (#'t/tableset (mt/id) "PUBLIC")))))))

(deftest find-tables-with-domain-entity-test
  (with-test-domain-entity-specs
    (testing "Can we filter a tableset by domain entity?"
      (is (= [(mt/id :venues)]
             (map u/the-id (#'t/find-tables-with-domain-entity (#'t/tableset (mt/id) "PUBLIC")
                                                               (@de.specs/domain-entity-specs "Venues"))))))
    (testing "Gracefully handle no-match"
      (with-test-domain-entity-specs
        (is (= nil
               (not-empty
                (#'t/find-tables-with-domain-entity [] (@de.specs/domain-entity-specs "Venues")))))))))

(deftest resulting-entities-test
  (testing "Can we extract results from the final bindings?"
    (with-test-transform-specs
      (is (= [(mt/id :venues)]
             (map u/the-id (#'t/resulting-entities {"VenuesEnhanced" {:entity     (Table (mt/id :venues))
                                                                      :dimensions {"D1" [:field-id 1]}}}
                                                   (first @t.specs/transform-specs))))))))

(deftest tables-matching-requirements-test
  (testing "Can we find a table set matching requirements of a given spec?"
    (with-test-transform-specs
      (with-test-domain-entity-specs
        (is (= [(mt/id :venues)]
               (map u/the-id (#'t/tables-matching-requirements (#'t/tableset (mt/id) "PUBLIC")
                                                               (first @t.specs/transform-specs)))))))))

(deftest tableset->bindings-test
  (testing "Can we turn a tableset into corresponding bindings?"
    (with-test-domain-entity-specs
      (is (= @test-bindings
             (#'t/tableset->bindings (filter (comp #{(mt/id :venues)} u/the-id) (#'t/tableset (mt/id) "PUBLIC"))))))))

(deftest validation-test
  (with-test-domain-entity-specs
    (with-test-transform-specs
      (testing "Is the validation of results working?"
        (is (#'t/validate-results {"VenuesEnhanced" {:entity     (card/map->CardInstance
                                                                  {:result_metadata [{:name "AvgPrice"}
                                                                                     {:name "MaxPrice"}
                                                                                     {:name "MinPrice"}]})
                                                     :dimensions {"D1" [:field-id 1]}}}
                                  (first @t.specs/transform-specs))))

      (testing "... and do we throw if we didn't get what we expected?"
        (is (thrown?
             java.lang.AssertionError
             (#'t/validate-results {"VenuesEnhanced" {:entity     (Table (mt/id :venues))
                                                      :dimensions {"D1" [:field-id 1]}}}
                                   (first @t.specs/transform-specs))))))))

(deftest transform-test
  (testing "Run the transform and make sure it produces the correct result"
    (mt/with-test-user :rasta
      (with-test-domain-entity-specs
        (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 1.5 4 3 2 1]
                [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0 11 2 1 1]
                [3 "The Apple Pan" 11 34.0406 -118.428 2 2.0 11 2 1 1]]
               (-> (t/apply-transform! (mt/id) "PUBLIC" test-transform-spec)
                   first
                   :dataset_query
                   qp/process-query
                   mt/rows)))))))

(deftest correct-transforms-for-table-test
  (testing "Can we find the right transform(s) for a given table"
    (with-test-transform-specs
      (with-test-domain-entity-specs
        (is (= "Test transform"
               (-> (t/candidates (Table (mt/id :venues)))
                   first
                   :name)))))))
