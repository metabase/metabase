(ns metabase-enterprise.metabot-v3.tools.filters-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- by-name
  [dimensions dimension-name]
  (let [pred (if (string? dimension-name)
               (comp #{dimension-name} :name)
               (every-pred (comp #{(first dimension-name)} :table-reference)
                           (comp #{(second dimension-name)} :name)))]
    (m/find-first pred dimensions)))

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
              ->field-id #(u/prog1 (-> metric-details :queryable-dimensions (by-name %) :field-id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
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
                                         :query-id string?
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
                      :filters [{:field-id (->field-id ["User" "State"])
                                 :operation :string-equals
                                 :value "TX"}
                                {:field-id (->field-id "Discount")
                                 :operation :number-greater-than
                                 :value 3}]
                      :group-by [{:field-id (->field-id ["Product" "Category"])
                                  :field-granularity :year}]}))))
          (testing "Temporal bucketing works for temporal columns."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]
                                                         :filter [:and
                                                                  [:!=
                                                                   [:get-week
                                                                    [:field (mt/id :orders :created_at)
                                                                     {:base-type :type/DateTimeWithLocalTZ}]
                                                                    :iso]
                                                                   1 2 3]
                                                                  [:=
                                                                   [:get-month [:field (mt/id :orders :created_at)
                                                                                {:base-type :type/DateTimeWithLocalTZ}]]
                                                                   6 7 8]]
                                                         :breakout [[:field (mt/id :orders :created_at)
                                                                     {:base-type :type/DateTimeWithLocalTZ
                                                                      :temporal-unit :week}]]}}}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field-id (->field-id "Created At")
                                 :bucket :week-of-year
                                 :operation :not-equals
                                 :values [1 2 3]}
                                {:field-id (->field-id "Created At")
                                 :bucket :month-of-year
                                 :operation :equals
                                 :values [6 7 8]}]
                      :group-by [{:field-id (->field-id "Created At")
                                  :field-granularity :week}]}))))
          (testing "Multi-value filtering works"
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table (mt/id :orders)
                                                         :aggregation [[:metric metric-id]]
                                                         :filter
                                                         [:and
                                                          [:starts-with {}
                                                           [:field (mt/id :people :state)
                                                            {:base-type :type/Text
                                                             :source-field (mt/id :orders :user_id)}]
                                                           "A" "G"]
                                                          [:!=
                                                           [:field (mt/id :orders :discount) {:base-type :type/Float}]
                                                           3 42]]}}}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field-id (->field-id ["User" "State"])
                                 :operation :string-starts-with
                                 :values ["A" "G"]}
                                {:field-id (->field-id "Discount")
                                 :operation :not-equals
                                 :values [3 42]}]})))))
        (testing "Missing metric results in an error."
          (is (= {:output (str "No metric found with metric_id " Integer/MAX_VALUE)}
                 (metabot-v3.tools.filters/query-metric {:metric-id Integer/MAX_VALUE}))))
        (testing "Invalid metric-id results in an error."
          (is (= {:output (str "Invalid metric_id " metric-id)}
                 (metabot-v3.tools.filters/query-metric {:metric-id (str metric-id)}))))))))

(deftest ^:parallel query-model-test
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders {})
                                             :database_id (mt/id)
                                             :name "Orders Model"
                                             :description "The _real_ orders."
                                             :type :model}]
    (testing "User has to have execution rights."
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot-v3.tools.filters/query-model
                             {:model-id model-id
                              :filters []
                              :group-by []}))))
    (mt/with-current-user (mt/user->id :crowberto)
      (let [model-details (-> (metabot-v3.dummy-tools/get-table-details {:model-id model-id})
                              :structured-output)
            model-card-id (str "card__" model-id)
            ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field-id)
                          (when-not <>
                            (throw (ex-info (str "Column " % " not found") {:column %}))))
            order-created-at-field-id (->field-id "Created At")]
        (testing "Trivial query works."
          (is (=? {:structured-output {:type :query,
                                       :query-id string?
                                       :query (mt/mbql-query orders {:source-table model-card-id})}}
                  (metabot-v3.tools.filters/query-model
                   {:model-id model-id
                    :filters []
                    :group-by []}))))
        (testing "Filtering, aggregation and grouping works and ignores bucketing for non-temporal columns."
          (is (=? {:structured-output {:type :query,
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :aggregation [[:sum [:field "SUBTOTAL" {}]]]
                                                 :breakout [[:field "PRODUCT_ID" {}]]
                                                 :filter [:> [:field "DISCOUNT" {}] 3]})}}
                  (metabot-v3.tools.filters/query-model
                   {:model-id model-id
                    :filters [{:field-id (->field-id "Discount")
                               :operation :number-greater-than
                               :value 3}]
                    :aggregations [{:field-id (->field-id "Subtotal")
                                    :bucket :day-of-month ; ignored
                                    :function :sum}]
                    :group-by [{:field-id (->field-id "Product ID")
                                :field-granularity :year}]}))))
        (testing "Temporal bucketing works for temporal columns."
          (is (=? {:structured-output {:type :query,
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :aggregation [[:min [:field "CREATED_AT"
                                                                      {:base-type :type/DateTimeWithLocalTZ
                                                                       :temporal-unit :hour-of-day}]]
                                                               [:avg [:field "CREATED_AT"
                                                                      {:base-type :type/DateTimeWithLocalTZ
                                                                       :temporal-unit :hour-of-day}]]
                                                               [:max [:field "CREATED_AT"
                                                                      {:base-type :type/DateTimeWithLocalTZ
                                                                       :temporal-unit :hour-of-day}]]]
                                                 :filter [:and
                                                          [:!= [:get-week [:field "CREATED_AT" {}] :iso] 1 2 3]
                                                          [:=
                                                           [:get-month [:field "CREATED_AT"
                                                                        {:base-type :type/DateTimeWithLocalTZ}]]
                                                           6 7 8]]
                                                 :breakout [[:field "PRODUCT_ID" {}]
                                                            [:field "CREATED_AT"
                                                             {:base-type :type/DateTimeWithLocalTZ
                                                              :temporal-unit :week}]]})}}
                  (metabot-v3.tools.filters/query-model
                   {:model-id model-id
                    :filters [{:field-id order-created-at-field-id
                               :bucket :week-of-year
                               :operation :not-equals
                               :values [1 2 3]}
                              {:field-id order-created-at-field-id
                               :bucket :month-of-year
                               :operation :equals
                               :values [6 7 8]}]
                    :aggregations [{:field-id order-created-at-field-id
                                    :bucket :hour-of-day
                                    :function :min}
                                   {:field-id order-created-at-field-id
                                    :bucket :hour-of-day
                                    :function :avg}
                                   {:field-id order-created-at-field-id
                                    :bucket :hour-of-day
                                    :function :max}]
                    :group-by [{:field-id (->field-id "Product ID")}
                               {:field-id order-created-at-field-id
                                :field-granularity :week}]}))))
        (testing "Fields can be selected"
          (is (=? {:structured-output
                   {:type :query,
                    :query-id string?
                    :query (mt/mbql-query orders
                             {:source-table model-card-id
                              :expressions {"Created At: Day of month"
                                            [:get-day [:field "CREATED_AT" {:base-type :type/DateTimeWithLocalTZ}]],
                                            "Created At: Day of week"
                                            [:get-day-of-week [:field "CREATED_AT" {}] :iso]}
                              :fields [[:expression "Created At: Day of month" {:base-type :type/Integer}]
                                       [:expression "Created At: Day of week" {:base-type :type/Integer}]
                                       [:field "TOTAL" {:base-type :type/Float}]]
                              :filter [:!= [:field "USER_ID" {}] 3 42]})}}
                  (metabot-v3.tools.filters/query-model
                   {:model-id model-id
                    :fields [{:field-id order-created-at-field-id
                              :bucket :day-of-month}
                             {:field-id order-created-at-field-id
                              :bucket :day-of-week}
                             {:field-id (->field-id "Total")}]
                    :filters [{:field-id (->field-id "User ID")
                               :operation :not-equals
                               :values [3 42]}]}))))
        (testing "With empty or missing fields and no summary, all fields are returned"
          (let [expected-query {:structured-output
                                {:type :query,
                                 :query-id string?
                                 :query (mt/mbql-query orders
                                          {:source-table model-card-id
                                           :filter [:!= [:field "USER_ID" {}] 3 42]})}}
                input {:model-id model-id
                       :filters [{:field-id (->field-id "User ID")
                                  :operation :not-equals
                                  :values [3 42]}]}]
            (are [input] (=? expected-query (metabot-v3.tools.filters/query-model input))
              input
              (assoc input :fields nil)
              (assoc input :fields [])))))
      (testing "Missing model results in an error."
        (is (= {:output (str "No model found with model_id " Integer/MAX_VALUE)}
               (metabot-v3.tools.filters/query-model {:model-id Integer/MAX_VALUE}))))
      (testing "Invalid model-id results in an error."
        (is (= {:output (str "Invalid model_id " model-id)}
               (metabot-v3.tools.filters/query-model {:model-id (str model-id)})))))))

(deftest ^:parallel filter-records-table-test
  (testing "User has to have execution rights, otherwise the table should be invisible."
    (is (= {:output (str "No table found with table_id " (mt/id :orders))}
           (metabot-v3.tools.filters/filter-records
            {:data-source {:table-id (mt/id :orders)}
             :filters []}))))
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          table-id (mt/id :orders)
          table-details (#'metabot-v3.dummy-tools/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field-id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Trivial query works."
        (is (=? {:structured-output {:type :query,
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id}}}}
                (metabot-v3.tools.filters/filter-records
                 {:data-source {:table-id table-id}
                  :filters []}))))
      (testing "Filtering works."
        (is (=? {:structured-output {:type :query,
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table (mt/id :orders)
                                                     :filter
                                                     [:and
                                                      [:=
                                                       [:get-day-of-week
                                                        [:field (mt/id :orders :created_at)
                                                         {:base-type :type/DateTimeWithLocalTZ}]
                                                        :iso]
                                                       1 7]
                                                      [:>
                                                       [:field (mt/id :orders :discount) {:base-type :type/Float}]
                                                       3]]}}}}
                (metabot-v3.tools.filters/filter-records
                 {:data-source {:table-id table-id}
                  :filters [{:field-id (->field-id "Created At")
                             :bucket :day-of-week
                             :operation :equals
                             :values [1 7]}
                            {:field-id (->field-id "Discount")
                             :operation :number-greater-than
                             :value 3}]})))))
    (testing "Missing table results in an error."
      (is (= {:output (str "No table found with table_id " Integer/MAX_VALUE)}
             (metabot-v3.tools.filters/filter-records
              {:data-source {:table-id Integer/MAX_VALUE}}))))))

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
                               {:data-source {:table-id (str "card__" model-id)}
                                :filters []}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-details (#'metabot-v3.dummy-tools/card-details model-id)
              table-id (str "card__" model-id)
              ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field-id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:table-id table-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id
                                                         :filter [:> [:field "DISCOUNT" {:base-type :type/Float}] 3]}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:table-id table-id}
                      :filters [{:field-id (->field-id "Discount")
                                 :operation :number-greater-than
                                 :value 3}]})))))
        (testing "Missing table results in an error."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                                (metabot-v3.tools.filters/filter-records
                                 {:data-source {:table-id (str "card__" Integer/MAX_VALUE)}}))))))))

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
                               {:data-source {:report-id card-id}
                                :filters []}))))
      (mt/with-current-user (mt/user->id :crowberto)
        (let [report-details (#'metabot-v3.dummy-tools/card-details card-id)
              ->field-id #(u/prog1 (-> report-details :fields (by-name %) :field-id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Trivial query works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:report-id card-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table table-id
                                                         :filter [:>
                                                                  [:field
                                                                   (mt/id :orders :discount)
                                                                   {:base-type :type/Float}]
                                                                  3]}}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:report-id card-id}
                      :filters [{:field-id (->field-id "Discount")
                                 :operation :number-greater-than
                                 :value 3}]})))))
        (testing "Missing table results in an error."
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                                (metabot-v3.tools.filters/filter-records
                                 {:data-source {:report-id Integer/MAX_VALUE}}))))))))

(deftest ^:parallel filter-records-query-test
  (let [query-id (u/generate-nano-id)
        mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        table-id (mt/id :orders)
        query (lib/query mp (lib.metadata/table mp table-id))
        legacy-query (lib.convert/->legacy-MBQL query)
        query-details (mt/with-current-user (mt/user->id :crowberto)
                        (#'metabot-v3.dummy-tools/execute-query query-id legacy-query))
        ->field-id #(u/prog1 (-> query-details :result-columns (by-name %) :field-id)
                      (when-not <>
                        (throw (ex-info (str "Column " % " not found") {:column %}))))
        input {:data-source {:query-id query-id}
               :filters [{:field-id (->field-id "Discount")
                          :operation :number-greater-than
                          :value 3}]}
        expected {:structured-output {:type :query,
                                      :query-id string?
                                      :query {:database (mt/id)
                                              :type :query
                                              :query {:source-query {:source-table table-id}
                                                      :filter [:>
                                                               [:field
                                                                "DISCOUNT"
                                                                {:base-type :type/Float}]
                                                               3]}}}}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "Filtering works."
        (testing "new tool call with query and query-id"
          (is (=? expected
                  (metabot-v3.tools.filters/filter-records
                   (assoc input :data-source (select-keys query-details [:query :query-id]))))))
        (testing "new tool call with just query"
          (is (=? expected
                  (metabot-v3.tools.filters/filter-records
                   (assoc input :data-source (select-keys query-details [:query]))))))))))
