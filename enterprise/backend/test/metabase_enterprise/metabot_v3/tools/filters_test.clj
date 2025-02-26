(ns metabase-enterprise.metabot-v3.tools.filters-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- by-name
  [dimensions dimension-name]
  (m/find-first (comp #{dimension-name} :name) dimensions))

(deftest ^:parallel query-metric-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        created-at-meta (lib.metadata/field mp (mt/id :orders :created_at))
        metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :subtotal))))
                         (lib/breakout (lib/with-temporal-bucket created-at-meta :month)))
        legacy-metric-query (lib.convert/->legacy-MBQL metric-query)]
    (mt/with-temp [:model/Card {metric-id :id} {:dataset_query legacy-metric-query
                                                :database_id (mt/id)
                                                :name "Average Order Value"
                                                :description "The average subtotal of orders."
                                                :type :metric}]
      (testing "User has to have execution rights."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.filters/query-metric
                               {:metric-id metric-id
                                :filters []
                                :group-by []}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (let [metric-details (metabot-v3.dummy-tools/metric-details metric-id)
              ->field-id #(u/prog1 (-> metric-details :queryable_dimensions (by-name %) :field_id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]}}}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters []
                      :group-by []}))))
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
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field_id (->field-id "User → State")
                                 :operation "string-equals"
                                 :value "TX"}
                                {:field_id (->field-id "Discount")
                                 :operation "number-greater-than"
                                 :value 3}]
                      :group-by [{:field_id (->field-id "Product → Category")
                                  :field_granularity "year"}]}))))
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
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :group-by [{:field_id (->field-id "Created At")
                                  :field_granularity "week"}]})))))
        (testing "Missing metric results in an error."
          (is (= {:output (str "No metric found with metric_id " Integer/MAX_VALUE)}
                 (metabot-v3.tools.filters/query-metric {:metric-id Integer/MAX_VALUE}))))
        (testing "Invalid metric-id results in an error."
          (is (= {:output (str "Invalid metric_id " metric-id)}
                 (metabot-v3.tools.filters/query-metric {:metric-id (str metric-id)}))))))))

(deftest ^:parallel filter-records-table-test
  (testing "User has to have execution rights, otherwise the table should be invisible."
    (is (= {:output (str "No table found with table_id " (mt/id :orders))}
           (metabot-v3.tools.filters/filter-records
            {:data-source {:table_id (mt/id :orders)}
             :filters []}))))
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          table-id (mt/id :orders)
          table-details (#'metabot-v3.dummy-tools/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Trivial query works."
        (is (=? {:structured-output {:type :query,
                                     :query_id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id}}}}
                (metabot-v3.tools.filters/filter-records
                 {:data-source {:table_id table-id}
                  :filters []}))))
      (testing "Filtering works."
        (is (=? {:structured-output {:type :query,
                                     :query_id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table (mt/id :orders)
                                                     :filter
                                                     [:> [:field (mt/id :orders :discount)
                                                          {:base-type :type/Float}]
                                                      3]}}}}
                (metabot-v3.tools.filters/filter-records
                 {:data-source {:table_id table-id}
                  :filters [{:field_id (->field-id "Discount")
                             :operation "number-greater-than"
                             :value 3}]})))))
    (testing "Missing table results in an error."
      (is (= {:output (str "No table found with table_id " Integer/MAX_VALUE)}
             (metabot-v3.tools.filters/filter-records
              {:data-source {:table_id Integer/MAX_VALUE}}))))))

(deftest ^:parallel filter-records-model-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        legacy-query (lib.convert/->legacy-MBQL query)]
    (mt/with-temp [:model/Card {model-id :id} {:dataset_query legacy-query
                                               :database_id (mt/id)
                                               :name "Orders"
                                               :description "The orders."
                                               :type :model}]
      (testing "User has to have execution rights."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.filters/filter-records
                               {:data-source {:table_id (str "card__" model-id)}
                                :filters []}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-details (#'metabot-v3.dummy-tools/card-details model-id)
              table-id (str "card__" model-id)
              ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:table_id table-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id
                                                         :filter [:> [:field "DISCOUNT" {:base-type :type/Float}] 3]}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:table_id table-id}
                      :filters [{:field_id (->field-id "Discount")
                                 :operation "number-greater-than"
                                 :value 3}]})))))
        (testing "Missing table results in an error."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                                (metabot-v3.tools.filters/filter-records
                                 {:data-source {:table_id (str "card__" Integer/MAX_VALUE)}}))))))))

(deftest ^:parallel filter-records-report-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        table-id (mt/id :orders)
        query (lib/query mp (lib.metadata/table mp table-id))
        legacy-query (lib.convert/->legacy-MBQL query)]
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query legacy-query
                                              :database_id (mt/id)
                                              :name "Orders"
                                              :description "The orders."
                                              :type :question}]
      (testing "User has to have execution rights."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.filters/filter-records
                               {:data-source {:report_id card-id}
                                :filters []}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (let [report-details (#'metabot-v3.dummy-tools/card-details card-id)
              ->field-id #(u/prog1 (-> report-details :fields (by-name %) :field_id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:report_id card-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query_id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id
                                                         :filter [:>
                                                                  [:field
                                                                   (mt/id :orders :discount)
                                                                   {:base-type :type/Float}]
                                                                  3]}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:report_id card-id}
                      :filters [{:field_id (->field-id "Discount")
                                 :operation "number-greater-than"
                                 :value 3}]})))))
        (testing "Missing table results in an error."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                                (metabot-v3.tools.filters/filter-records
                                 {:data-source {:report_id Integer/MAX_VALUE}}))))))))

(deftest ^:parallel filter-records-query-test
  (let [query-id (u/generate-nano-id)
        mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        table-id (mt/id :orders)
        query (lib/query mp (lib.metadata/table mp table-id))
        legacy-query (lib.convert/->legacy-MBQL query)
        query-details (#'metabot-v3.dummy-tools/execute-query query-id legacy-query)
        ->field-id #(u/prog1 (-> query-details :result_columns (by-name %) :field_id)
                      (when-not <>
                        (throw (ex-info (str "Column " % " not found") {:column %}))))
        env {:history [{:role :tool
                        :tool-call-id "some tool call ID"
                        :structured-content query-details}]}]
    (testing "Trivial query works."
      (is  (=? {:structured-output
                {:type :query
                 :query_id string?
                 :query {:database (mt/id), :type :query, :query {:source-query {:source-table table-id}}}}}
               (metabot-v3.tools.filters/filter-records
                {:data-source {:query_id query-id}}
                env))))
    (let [input {:data-source {:query_id query-id}
                 :filters [{:field_id (->field-id "Discount")
                            :operation "number-greater-than"
                            :value 3}]}
          expected {:structured-output {:type :query,
                                        :query_id string?
                                        :query {:database (mt/id)
                                                :type :query
                                                :query {:source-query {:source-table table-id}
                                                        :filter [:>
                                                                 [:field
                                                                  "DISCOUNT"
                                                                  {:base-type :type/Float}]
                                                                 3]}}}}]
      (testing "Filtering works."
        (testing "new tool call with query and query_id"
          (is (=? expected
                  (metabot-v3.tools.filters/filter-records
                   (assoc input :data-source (select-keys query-details [:query :query_id]))))))
        (testing "new tool call with just query"
          (is (=? expected
                  (metabot-v3.tools.filters/filter-records
                   (assoc input :data-source (select-keys query-details [:query]))))))))
    (testing "Missing query results in an error."
      (is (= {:output (str "No query found with query_id " query-id)}
             (metabot-v3.tools.filters/filter-records
              {:data-source {:query_id query-id}}))))))
