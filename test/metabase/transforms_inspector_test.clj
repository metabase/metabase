(ns ^:mb/driver-tests metabase.transforms-inspector-test
  "Integration tests for the Transform Inspector API."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms-inspector :as inspector]
   [metabase.transforms.test-util :as transforms.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- default-schema []
  (t2/select-one-fn :schema :model/Table :id (mt/id :orders)))

(defn- make-mbql-transform
  "Create a transform map for testing with an MBQL query."
  [query target-name & [schema]]
  {:source {:type :query
            :query query}
   :name (str "inspector_test_" target-name)
   :target {:schema (or schema (default-schema))
            :name target-name
            :type :table}})

;;; -------------------------------------------------- discover-lenses --------------------------------------------------

(deftest discover-lenses-not-run-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "discover-lenses returns :not-run when transform has no target table"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_nr"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform transform transform-data]
            (let [result (inspector/discover-lenses transform)]
              (is (= :not-run (:status result)))
              (is (string? (:name result)))
              (is (nil? (:target result)))
              (is (= [] (:available_lenses result))))))))))

(deftest discover-lenses-ready-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "discover-lenses returns :ready with available lenses after transform is run"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_rdy"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            ;; Run the transform to create the target table
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            ;; Reload transform to get latest state
            (let [transform' (t2/select-one :model/Transform tid)
                  result (inspector/discover-lenses transform')]
              (is (= :ready (:status result)))
              (is (some? (:target result)))
              (is (seq (:sources result)))
              (is (seq (:available_lenses result)))
              (testing "generic-summary is always in the available lenses"
                (is (some #(= "generic-summary" (:id %)) (:available_lenses result)))))))))))

(deftest discover-lenses-source-info-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "discover-lenses populates source table info with fields"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_src"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            (let [transform' (t2/select-one :model/Transform tid)
                  result (inspector/discover-lenses transform')]
              (testing "sources contain table metadata"
                (let [source (first (:sources result))]
                  (is (pos-int? (:table_id source)))
                  (is (string? (:table_name source)))
                  (is (pos-int? (:column_count source)))
                  (is (seq (:fields source)))))
              (testing "target contains table metadata"
                (let [target (:target result)]
                  (is (pos-int? (:table_id target)))
                  (is (= target-name (:table_name target)))
                  (is (pos-int? (:column_count target)))
                  (is (seq (:fields target))))))))))))

;;; -------------------------------------------------- get-lens --------------------------------------------------

(deftest get-lens-generic-summary-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "get-lens returns generic-summary lens with sections and cards"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_gs"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            (let [transform' (t2/select-one :model/Transform tid)
                  lens (inspector/get-lens transform' "generic-summary" nil)]
              (is (= "generic-summary" (:id lens)))
              (is (= "Data Summary" (:display_name lens)))
              (is (seq (:sections lens)))
              (is (seq (:cards lens)))
              (testing "cards have required structure"
                (let [card (first (:cards lens))]
                  (is (string? (:id card)))
                  (is (string? (:title card)))
                  (is (keyword? (:display card)))
                  (is (map? (:dataset_query card))))))))))))

(deftest get-lens-join-analysis-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
    (testing "get-lens returns join-analysis lens for transforms with joins"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_ja"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)
                                       :joins [{:fields "all"
                                                :strategy "left-join"
                                                :alias "Products"
                                                :condition [:=
                                                            [:field (mt/id :orders :product_id)
                                                             {:base-type "type/Integer"}]
                                                            [:field (mt/id :products :id)
                                                             {:base-type "type/Integer"
                                                              :join-alias "Products"}]]
                                                :source-table (mt/id :products)}]}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            (let [transform' (t2/select-one :model/Transform tid)
                  lens (inspector/get-lens transform' "join-analysis" nil)]
              (is (= "join-analysis" (:id lens)))
              (is (= "Join Analysis" (:display_name lens)))
              (testing "has join stats section"
                (is (some #(= "join-stats" (:id %)) (:sections lens))))
              (testing "has base-count and join-step cards"
                (is (some #(= "base-count" (:id %)) (:cards lens)))
                (is (some #(re-matches #"join-step-\d+" (:id %)) (:cards lens))))
              (testing "has alert and drill lens triggers for outer joins"
                (is (seq (:alert_triggers lens)))
                (is (seq (:drill_lens_triggers lens)))))))))))

(deftest get-lens-inapplicable-throws-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "get-lens throws for inapplicable lens"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_na"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            (let [transform' (t2/select-one :model/Transform tid)]
              ;; A simple query without joins shouldn't have join-analysis applicable
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Lens data not available"
                                    (inspector/get-lens transform' "join-analysis" nil))))))))))

;;; -------------------------------------------------- Context building --------------------------------------------------

(deftest discover-lenses-with-joins-has-join-info-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
    (testing "discover-lenses includes join-related lenses for transforms with joins"
      (transforms.tu/with-transform-cleanup!
        [{target-name :name} {:type :table
                              :schema (default-schema)
                              :name "g_inspector_ji"}]
        (let [transform-data (make-mbql-transform
                              {:database (mt/id)
                               :type "query"
                               :query {:source-table (mt/id :orders)
                                       :joins [{:fields "all"
                                                :strategy "left-join"
                                                :alias "Products"
                                                :condition [:=
                                                            [:field (mt/id :orders :product_id)
                                                             {:base-type "type/Integer"}]
                                                            [:field (mt/id :products :id)
                                                             {:base-type "type/Integer"
                                                              :join-alias "Products"}]]
                                                :source-table (mt/id :products)}]}}
                              target-name
                              (default-schema))]
          (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table target-name 10000)
            (let [transform' (t2/select-one :model/Transform tid)
                  result (inspector/discover-lenses transform')]
              (testing "join-analysis is in available lenses"
                (is (some #(= "join-analysis" (:id %)) (:available_lenses result))))
              (testing "multiple source tables are detected"
                (is (>= (count (:sources result)) 2))))))))))
