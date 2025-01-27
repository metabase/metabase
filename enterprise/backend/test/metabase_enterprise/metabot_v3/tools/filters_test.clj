(ns metabase-enterprise.metabot-v3.tools.filters-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- name->dimension
  [dimensions dimension-name]
  (m/find-first (comp #{dimension-name} :name) dimensions))

(deftest ^:parallel query-metric-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        created-at-meta (lib.metadata/field mp (mt/id :orders :created_at))
        metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :subtotal))))
                         (lib/breakout (lib/with-temporal-bucket created-at-meta :month)))
        legacy-metric-query (lib.convert/->legacy-MBQL metric-query)]
    (mt/with-temp [:model/Card {metric-id :id :as metric} {:dataset_query legacy-metric-query
                                                           :database_id (mt/id)
                                                           :name "Average Order Value"
                                                           :description "The average subtotal of orders."
                                                           :type :metric}]
      (testing "User has to have execution rights."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.interface/*invoke-tool*
                               :metabot.tool/query-metric
                               {:metric-id metric-id
                                :filters []
                                :group-by []}
                               {}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "Invalid metric-id results in an error."
          (is (thrown? clojure.lang.ExceptionInfo (metabot-v3.tools.interface/*invoke-tool*
                                                   :metabot.tool/query-metric
                                                   {:metric-id "42"}
                                                   {}))))
        (testing "Missing metric results in an error."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                                (metabot-v3.tools.interface/*invoke-tool*
                                 :metabot.tool/query-metric
                                 {:metric-id Long/MAX_VALUE}
                                 {}))))
        (let [metric-id (:id metric)
              metric-details (metabot-v3.dummy-tools/metric-details metric-id)
              ->field-id #(u/prog1 (-> metric-details :queryable_dimensions (name->dimension %) :field_id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]}}}}
                    (metabot-v3.tools.interface/*invoke-tool*
                     :metabot.tool/query-metric
                     {:metric-id metric-id
                      :filters []
                      :group-by []}
                     {}))))
          (testing "Filtering and grouping works and ignores bucketing for non-temporal columns."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]
                                                         :breakout [[:field (mt/id :products :category)
                                                                     {:base-type :type/Text
                                                                      :source-field (mt/id :orders :product_id)}]]
                                                         :filter
                                                         [:and
                                                          [:= [:field (mt/id :people :state)
                                                               {:base-type :type/Text
                                                                :source-field (mt/id :orders :user_id)}]
                                                           "TX"]
                                                          [:> [:field (mt/id :orders :discount)
                                                               {:base-type :type/Float}]
                                                           3]]}}}}
                    (metabot-v3.tools.interface/*invoke-tool*
                     :metabot.tool/query-metric
                     {:metric-id metric-id
                      :filters [{:field_id (->field-id "User → State")
                                 :operation "string-equals"
                                 :value "TX"}
                                {:field_id (->field-id "Discount")
                                 :operation "number-greater-than"
                                 :value 3}]
                      :group-by [{:field_id (->field-id "Product → Category")
                                  :field_granularity "year"}]}
                     {}))))
          (testing "Temporal bucketing works for temporal columns."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]
                                                         :breakout [[:field (mt/id :orders :created_at)
                                                                     {:base-type :type/DateTimeWithLocalTZ
                                                                      :temporal-unit :week}]]}}}}
                    (metabot-v3.tools.interface/*invoke-tool*
                     :metabot.tool/query-metric
                     {:metric-id metric-id
                      :group-by [{:field_id (->field-id "Created At")
                                  :field_granularity "week"}]}
                     {})))))))))
