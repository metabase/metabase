(ns metabase.segments.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.segments.replacement :as segments.replacement]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- orders-segment
  "A segment of the orders table filtered on its id."
  []
  (let [mp (mt/metadata-provider)]
    {:id         1
     :table_id   (mt/id :orders)
     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                     (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))}))

(deftest ^:parallel upgrade-field-refs-test
  (testing "segment whose definition has nothing to upgrade writes nothing"
    (is (= [] (segments.replacement/upgrade-field-refs (orders-segment)))))
  (testing "segment without valid definition writes nothing"
    (is (= [] (segments.replacement/upgrade-field-refs {:id 1, :definition {}})))))

(deftest ^:parallel swap-source-test
  (testing "segment on old table moves its definition and table id to new table"
    (is (=? [[:model/Segment 1 {:definition {:stages [{:source-table (mt/id :reviews)}]}
                                :table_id   (mt/id :reviews)}]]
            (segments.replacement/swap-source (orders-segment) [:table (mt/id :orders)] [:table (mt/id :reviews)]))))
  (testing "segment without valid definition swaps nothing"
    (is (nil? (segments.replacement/swap-source {:id 1, :definition {}}
                                                [:table (mt/id :orders)]
                                                [:table (mt/id :reviews)])))))
