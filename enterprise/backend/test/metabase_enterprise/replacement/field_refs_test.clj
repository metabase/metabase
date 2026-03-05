(ns metabase-enterprise.replacement.field-refs-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest card-upgrade-field-refs!-query-test
  (testing "should upgrade refs in a query"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count))
                    (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                    lib/append-stage
                    (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders :id)) 1)))]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:dataset_query
                 {:stages [{:source-table (mt/id :orders)
                            :aggregation [[:count {}]]
                            :breakout [[:field {} (mt/id :orders :id)]]}
                           {:filters [[:= {} [:field {} "ID"] 1]]}]}}
                (t2/select-one :model/Card card-id)))))))