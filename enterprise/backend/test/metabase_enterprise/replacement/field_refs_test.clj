(ns metabase-enterprise.replacement.field-refs-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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

(deftest card-upgrade-field-refs!-viz-settings-test
  (testing "should upgrade refs in viz settings"
    (let [mp           (mt/metadata-provider)
          query        (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/count))
                           (lib/aggregate (lib/count))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :created_at))))
          viz-settings {:column_settings
                        {(json/encode ["ref" [:field (mt/id :orders :id) nil]])
                         {:column_title "Order ID"}

                         (json/encode ["ref" [:field (mt/id :orders :created_at) nil]])
                         {:column_title "Created"}}

                        :table.column_formatting
                        [{:columns [[:field (mt/id :orders :id) nil]]
                          :value   10}
                         {:columns [[:field (mt/id :orders :created_at) nil]]
                          :value   "1970-01-01"}]

                        :pivot_table.column_split
                        {:rows    [[:field (mt/id :orders :id) nil]]
                         :columns [[:field (mt/id :orders :created_at) nil]]
                         :values  [[:aggregation 0] [:aggregation 1]]}

                        :pivot_table.collapsed_rows
                        {:rows  [[:field (mt/id :orders :id) nil]]
                         :value [10]}}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                :visualization_settings viz-settings}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:visualization_settings
                 {:column_settings
                  {(json/encode ["name" "ID"])         {:column_title "Order ID"}
                   (json/encode ["name" "CREATED_AT"]) {:column_title "Created"}}

                  :table.column_formatting
                  [{:columns ["ID"]
                    :value 10}
                   {:columns ["CREATED_AT"]
                    :value "1970-01-01"}]

                  :pivot_table.column_split
                  {:rows    ["ID"]
                   :columns ["CREATED_AT"]
                   :values  ["count" "count_2"]}

                  :pivot_table.collapsed_rows
                  {:rows  ["ID"]
                   :value [10]}}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-viz-settings-broken-test
  (testing "should ignore refs in viz settings that cannot be resolved"
    (let [mp           (mt/metadata-provider)
          query        (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/count))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :created_at))))
          viz-settings {:pivot_table.column_split
                        {:rows    [[:field (mt/id :orders :id) nil]]
                         :columns [[:field 9999 nil]]
                         :values  [[:aggregation 0] [:aggregation 1]]}}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                :visualization_settings viz-settings}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:visualization_settings
                 {:pivot_table.column_split
                  {:rows    ["ID"]
                   :columns [[:field 9999 nil]]
                   :values  ["count" [:aggregation 1]]}}}
                (t2/select-one :model/Card card-id)))))))