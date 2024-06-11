(ns metabase.xrays.transforms.core-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.xrays.domain-entities.core :as de]
   [metabase.xrays.domain-entities.specs :as de.specs]
   [metabase.xrays.test-util.domain-entities :refer [with-test-domain-entity-specs!]]
   [metabase.xrays.test-util.transforms :refer [test-transform-spec with-test-transform-specs!]]
   [metabase.xrays.transforms.core :as tf]
   [metabase.xrays.transforms.specs :as tf.specs]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :each (fn [thunk]
                      (mt/with-model-cleanup [Card Collection]
                        (thunk))))

(def ^:private test-bindings
  (delay
    (with-test-domain-entity-specs!
      (let [table (m/find-first (comp #{(mt/id :venues)} u/the-id) (#'tf/tableset (mt/id) "PUBLIC"))]
        {"Venues" {:dimensions (m/map-vals de/mbql-reference (get-in table [:domain_entity :dimensions]))
                   :entity     table}}))))

(deftest add-bindings-test
  (testing "Can we accure bindings?"
    (let [new-bindings {"D2" [:sum [:field 4 nil]]
                        "D3" [:field 5 nil]}]
      (is (= (update-in @test-bindings ["Venues" :dimensions] merge new-bindings)
             (#'tf/add-bindings @test-bindings "Venues" new-bindings)))))

  (testing "Gracefully handle nil"
    (is (= @test-bindings
           (#'tf/add-bindings @test-bindings "Venues" nil)))))

(deftest mbql-reference->col-name-test
  (is (= "PRICE"
         (#'tf/mbql-reference->col-name [:field (mt/id :venues :price) nil])))
  (is (= "PRICE"
         (#'tf/mbql-reference->col-name [:field "PRICE" {:base-type :type/Integer}])))
  (is (= "PRICE"
         (#'tf/mbql-reference->col-name [{:foo [:field (mt/id :venues :price) nil]}]))))

(deftest ->source-table-reference-test
  (testing "Can we turn a given entity into a format suitable for a query's `:source_table`?"
    (testing "for a Table"
      (is (= (mt/id :venues)
             (#'tf/->source-table-reference (t2/select-one Table :id (mt/id :venues))))))

    (testing "for a Card"
      (t2.with-temp/with-temp [Card {card-id :id}]
        (is (= (str "card__" card-id)
               (#'tf/->source-table-reference (t2/select-one Card :id card-id))))))))

(deftest tableset-test
  (testing "Can we get a tableset for a given schema?"
    (is (= (t2/select-pks-set Table :db_id (mt/id))
           (set (map u/the-id (#'tf/tableset (mt/id) "PUBLIC")))))))

(deftest find-tables-with-domain-entity-test
  (with-test-domain-entity-specs!
    (testing "Can we filter a tableset by domain entity?"
      (is (= [(mt/id :venues)]
             (map u/the-id (#'tf/find-tables-with-domain-entity (#'tf/tableset (mt/id) "PUBLIC")
                                                                (@de.specs/domain-entity-specs "Venues"))))))
    (testing "Gracefully handle no-match"
      (with-test-domain-entity-specs!
        (is (= nil
               (not-empty
                (#'tf/find-tables-with-domain-entity [] (@de.specs/domain-entity-specs "Venues")))))))))

(deftest resulting-entities-test
  (testing "Can we extract results from the final bindings?"
    (with-test-transform-specs!
      (is (= [(mt/id :venues)]
             (map u/the-id (#'tf/resulting-entities {"VenuesEnhanced" {:entity     (t2/select-one Table :id (mt/id :venues))
                                                                       :dimensions {"D1" [:field 1 nil]}}}
                                                    (first @tf.specs/transform-specs))))))))

(deftest tables-matching-requirements-test
  (testing "Can we find a table set matching requirements of a given spec?"
    (with-test-transform-specs!
      (with-test-domain-entity-specs!
        (is (= [(mt/id :venues)]
               (map u/the-id (#'tf/tables-matching-requirements (#'tf/tableset (mt/id) "PUBLIC")
                                                                (first @tf.specs/transform-specs)))))))))

(deftest tableset->bindings-test
  (testing "Can we turn a tableset into corresponding bindings?"
    (with-test-domain-entity-specs!
      (is (= @test-bindings
             (#'tf/tableset->bindings (filter (comp #{(mt/id :venues)} u/the-id) (#'tf/tableset (mt/id) "PUBLIC"))))))))

(deftest validation-test
  (with-test-domain-entity-specs!
    (with-test-transform-specs!
      (testing "Is the validation of results working?"
        (is (#'tf/validate-results {"VenuesEnhanced" {:entity     (mi/instance
                                                                   Card
                                                                   {:result_metadata [{:name "AvgPrice"}
                                                                                      {:name "MaxPrice"}
                                                                                      {:name "MinPrice"}]})
                                                      :dimensions {"D1" [:field 1 nil]}}}
                                   (first @tf.specs/transform-specs))))

      (testing "... and do we throw if we didn't get what we expected?"
        (is (thrown?
             java.lang.AssertionError
             (#'tf/validate-results {"VenuesEnhanced" {:entity     (t2/select-one Table :id (mt/id :venues))
                                                       :dimensions {"D1" [:field 1 nil]}}}
                                    (first @tf.specs/transform-specs))))))))

(deftest transform-test
  (testing "Run the transform and make sure it produces the correct result"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-test-user :rasta
        (with-test-domain-entity-specs!
          (is (= [[1 "Red Medicine" 4 10.065 -165.374 3 1.5 4 3 2 1]
                  [2 "Stout Burgers & Beers" 11 34.1 -118.329 2 1.1 11 2 1 1]
                  [3 "The Apple Pan" 11 34.041 -118.428 2 1.1 11 2 1 1]]
                 (mt/formatted-rows [int str int 3.0 3.0 int 1.0 int int int int]
                  (-> (tf/apply-transform! (mt/id) "PUBLIC" test-transform-spec)
                      first
                      :dataset_query
                      qp/process-query)))))))))

(deftest correct-transforms-for-table-test
  (testing "Can we find the right transform(s) for a given table"
    (with-test-transform-specs!
      (with-test-domain-entity-specs!
        (is (= "Test transform"
               (-> (tf/candidates (t2/select-one Table :id (mt/id :venues)))
                   first
                   :name)))))))
