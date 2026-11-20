(ns metabase.transforms.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms.replacement :as transforms.replacement]))

(set! *warn-on-reflection* true)

(defn- orders-transform
  "A transform whose source is a query of the orders table."
  []
  (let [mp (mt/metadata-provider)]
    {:id     1
     :source {:type :query, :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}}))

(deftest ^:parallel upgrade-field-refs-test
  (testing "transform whose query has nothing to upgrade writes nothing"
    (is (= [] (transforms.replacement/upgrade-field-refs (orders-transform)))))
  (testing "transform whose source is not a query writes nothing"
    (is (= [] (transforms.replacement/upgrade-field-refs {:id 1, :source {:type :python, :body "x"}})))))

(deftest ^:parallel swap-source-test
  (testing "transform on old table moves its query to new table"
    (is (=? [[:model/Transform 1 {:source {:type :query, :query {:stages [{:source-table (mt/id :reviews)}]}}}]]
            (transforms.replacement/swap-source (orders-transform) [:table (mt/id :orders)] [:table (mt/id :reviews)]))))
  (testing "transform that does not use old source writes nothing"
    (is (= [] (transforms.replacement/swap-source (orders-transform) [:table (mt/id :products)] [:table (mt/id :reviews)]))))
  (testing "transform without query swaps nothing"
    (is (nil? (transforms.replacement/swap-source {:id 1, :source {:type :python, :body "x"}}
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])))))
