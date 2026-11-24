(ns metabase.measures.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.replacement :as measures.replacement]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- orders-measure
  "A measure counting the rows of the orders table."
  []
  (let [mp (mt/metadata-provider)]
    {:id         1
     :table_id   (mt/id :orders)
     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     (lib/aggregate (lib/count)))}))

(deftest ^:parallel upgrade-field-refs-test
  (testing "measure whose definition has nothing to upgrade writes nothing"
    (is (= [] (measures.replacement/upgrade-field-refs (orders-measure)))))
  (testing "measure without valid definition writes nothing"
    (is (= [] (measures.replacement/upgrade-field-refs {:id 1, :definition {}})))))

(deftest ^:parallel swap-source-test
  (testing "measure on old table moves its definition and table id to new table"
    (is (=? [[:model/Measure 1 {:definition {:stages [{:source-table (mt/id :reviews)}]}
                                :table_id   (mt/id :reviews)}]]
            (measures.replacement/swap-source (orders-measure) [:table (mt/id :orders)] [:table (mt/id :reviews)]))))
  (testing "measure without valid definition swaps nothing"
    (is (nil? (measures.replacement/swap-source {:id 1, :definition {}}
                                                [:table (mt/id :orders)]
                                                [:table (mt/id :reviews)])))))
