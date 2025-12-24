(ns metabase-enterprise.metabot-v3.tools.filters-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.entity-details :as metabot-v3.tools.entity-details]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- by-name
  [dimensions dimension-name]
  (let [pred (if (string? dimension-name)
               (comp #{dimension-name} :display_name)
               (every-pred (comp #{(first dimension-name)} :table_reference)
                           (comp #{(second dimension-name)} :display_name)))]
    (m/find-first pred dimensions)))

(deftest ^:parallel query-metric-test
  (let [mp (mt/metadata-provider)
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
        (let [metric-details (metabot-v3.tools.entity-details/metric-details metric-id)
              ->field-id #(u/prog1 (-> metric-details :queryable-dimensions (by-name %) :field_id)
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
            (let [state-id (->field-id ["User" "State"])
                  stat-field-clause [:field (mt/id :people :state)
                                     {:base-type :type/Text
                                      :source-field (mt/id :orders :user_id)}]]
              (is (=? {:structured-output {:type :query,
                                           :query-id string?
                                           :query {:database (mt/id)
                                                   :type :query
                                                   :query {:source-table (mt/id :orders)
                                                           :aggregation [[:metric metric-id]]
                                                           :filter
                                                           [:and
                                                            [:contains {:case-sensitive false}
                                                             stat-field-clause "o" "e"]
                                                            [:does-not-contain
                                                             stat-field-clause "y" {:case-sensitive false}]
                                                            [:starts-with {:case-sensitive false}
                                                             stat-field-clause "A" "G"]
                                                            [:ends-with {:case-sensitive false}
                                                             stat-field-clause "e" "f" "i" "T" "x"]
                                                            [:!=
                                                             [:field (mt/id :orders :discount) {:base-type :type/Float}]
                                                             3 42]]}}}}
                      (metabot-v3.tools.filters/query-metric
                       {:metric-id metric-id
                        :filters [{:field-id state-id
                                   :operation :string-contains
                                   :values ["o" "e"]}
                                  {:field-id state-id
                                   :operation :string-not-contains
                                   :value "y"}
                                  {:field-id state-id
                                   :operation :string-starts-with
                                   :values ["A" "G"]}
                                  {:field-id state-id
                                   :operation :string-ends-with
                                   :values ["e" "f" "i" "T" "x"]}
                                  {:field-id (->field-id "Discount")
                                   :operation :not-equals
                                   :values [3 42]}]}))))))
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
      (let [model-details (-> (metabot-v3.tools.entity-details/get-table-details {:model-id model-id})
                              :structured-output)
            model-card-id (str "card__" model-id)
            ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
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
        ;;
        ;; TODO (Cam 6/19/25) -- disabled for now since this was generating invalid queries with duplicate expression
        ;; names. Previously this was ok I think because the MBQL 5 didn't enforce it but when I added that this started
        ;; failing
        ;;
        #_(testing "Fields can be selected"
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
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                          (metabot-v3.tools.filters/filter-records
                           {:data-source {:table-id (mt/id :orders)}
                            :filters []}))))
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
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
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found."
                            (metabot-v3.tools.filters/filter-records
                             {:data-source {:table-id Integer/MAX_VALUE}}))))))

(deftest ^:parallel filter-records-model-test
  (let [mp (mt/metadata-provider)
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
        (let [model-details (#'metabot-v3.tools.entity-details/card-details model-id)
              table-id (str "card__" model-id)
              ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
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
  (let [mp (mt/metadata-provider)
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
        (let [report-details (#'metabot-v3.tools.entity-details/card-details card-id)
              ->field-id #(u/prog1 (-> report-details :fields (by-name %) :field_id)
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
        mp (mt/metadata-provider)
        table-id (mt/id :orders)
        query (lib/query mp (lib.metadata/table mp table-id))
        legacy-query (lib.convert/->legacy-MBQL query)
        query-details (mt/with-current-user (mt/user->id :crowberto)
                        (#'metabot-v3.tools.entity-details/execute-query query-id legacy-query))
        ->field-id #(u/prog1 (-> query-details :result-columns (by-name %) :field_id)
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
                   (assoc input :data-source (select-keys query-details [:query]))))))
        (testing "MBQL v5 query works"
          (is (=? expected
                  (metabot-v3.tools.filters/filter-records
                   (assoc input :data-source {:query query})))))))))

(deftest ^:parallel query-datasource-table-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Basic table query works"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id}))))

      (testing "Table query with fields selection"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id
                                                     :fields [[:field (mt/id :orders :created_at) {:base-type :type/DateTimeWithLocalTZ}]
                                                              [:field (mt/id :orders :total) {:base-type :type/Float}]]}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :fields [{:field-id (->field-id "Created At")}
                           {:field-id (->field-id "Total")}]}))))

      (testing "Table query with filters"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id
                                                     :filter [:and
                                                              [:> [:field (mt/id :orders :discount) {:base-type :type/Float}] 3]
                                                              [:= [:field (mt/id :orders :user_id) {:base-type :type/Integer}] 10]]}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:field-id (->field-id "Discount")
                             :operation :number-greater-than
                             :value 3}
                            {:field-id (->field-id "User ID")
                             :operation :equals
                             :value 10}]}))))

      (testing "Table query with aggregations and grouping"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id
                                                     :aggregation [[:sum [:field (mt/id :orders :subtotal) {:base-type :type/Float}]]
                                                                   [:avg [:field (mt/id :orders :discount) {:base-type :type/Float}]]]
                                                     :breakout [[:field (mt/id :orders :product_id) {:base-type :type/Integer}]]}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Subtotal")
                                  :function :sum}
                                 {:field-id (->field-id "Discount")
                                  :function :avg}]
                  :group-by [{:field-id (->field-id "Product ID")}]}))))

      (testing "Table query with order by and limit"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id
                                                     :order-by [[:asc [:field (mt/id :orders :created_at) {:base-type :type/DateTimeWithLocalTZ}]]
                                                                [:desc [:field (mt/id :orders :total) {:base-type :type/Float}]]]
                                                     :limit 100}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :order-by [{:field {:field-id (->field-id "Created At")}
                              :direction :asc}
                             {:field {:field-id (->field-id "Total")}
                              :direction :desc}]
                  :limit 100}))))

      (testing "Table query with temporal bucketing"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :type :query
                                             :query {:source-table table-id
                                                     :aggregation [[:count]]
                                                     :breakout [[:field (mt/id :orders :created_at)
                                                                 {:base-type :type/DateTimeWithLocalTZ
                                                                  :temporal-unit :month}]]}}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Product ID")
                                  :function :count}]
                  :group-by [{:field-id (->field-id "Created At")
                              :field-granularity :month}]})))))))

(deftest ^:parallel query-datasource-model-test
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders {})
                                             :database_id (mt/id)
                                             :name "Orders Model"
                                             :description "Test model for orders"
                                             :type :model}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [model-details (-> (metabot-v3.tools.entity-details/get-table-details {:model-id model-id})
                              :structured-output)
            model-card-id (str "card__" model-id)
            ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
                          (when-not <>
                            (throw (ex-info (str "Column " % " not found") {:column %}))))]
        (testing "Basic model query works"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query (mt/mbql-query orders {:source-table model-card-id})}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id}))))

        (testing "Model query with fields selection"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :fields [[:field "CREATED_AT" {:base-type :type/DateTimeWithLocalTZ}]
                                                          [:field "TOTAL" {:base-type :type/Float}]]})}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :fields [{:field-id (->field-id "Created At")}
                             {:field-id (->field-id "Total")}]}))))

        (testing "Model query with filters"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :filter [:and
                                                          [:> [:field "DISCOUNT" {:base-type :type/Float}] 5]
                                                          [:< [:field "SUBTOTAL" {:base-type :type/Float}] 100]]})}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :filters [{:field-id (->field-id "Discount")
                               :operation :number-greater-than
                               :value 5}
                              {:field-id (->field-id "Subtotal")
                               :operation :number-less-than
                               :value 100}]}))))

        (testing "Model query with aggregations and grouping"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :aggregation [[:count]
                                                               [:max [:field "TOTAL" {:base-type :type/Float}]]]
                                                 :breakout [[:field "USER_ID" {:base-type :type/Integer}]]})}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :aggregations [{:field-id (->field-id "Product ID")
                                    :function :count}
                                   {:field-id (->field-id "Total")
                                    :function :max}]
                    :group-by [{:field-id (->field-id "User ID")}]}))))

        (testing "Model query with order by and limit"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query (mt/mbql-query orders
                                                {:source-table model-card-id
                                                 :order-by [[:desc [:field "CREATED_AT" {:base-type :type/DateTimeWithLocalTZ}]]]
                                                 :limit 50})}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :order-by [{:field {:field-id (->field-id "Created At")}
                                :direction :desc}]
                    :limit 50}))))))))

(deftest ^:parallel query-datasource-validation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "Error when neither table-id nor model-id provided"
      (is (= {:output "Either table_id or model_id must be provided"}
             (metabot-v3.tools.filters/query-datasource {}))))

    (testing "Error when both table-id and model-id provided"
      (is (= {:output "Cannot provide both table_id and model_id"}
             (metabot-v3.tools.filters/query-datasource
              {:table-id (mt/id :orders)
               :model-id 123}))))

    (testing "Error with invalid table-id"
      (is (= {:output "Invalid table_id not-a-number"}
             (metabot-v3.tools.filters/query-datasource
              {:table-id "not-a-number"}))))

    (testing "Error with invalid model-id"
      (is (= {:output "Invalid model_id not-a-number"}
             (metabot-v3.tools.filters/query-datasource
              {:model-id "not-a-number"}))))

    (testing "Error with non-existent table"
      (is (= {:output (str "No table found with table_id " Integer/MAX_VALUE)}
             (metabot-v3.tools.filters/query-datasource
              {:table-id Integer/MAX_VALUE}))))

    (testing "Error with non-existent model"
      (is (= {:output (str "No model found with model_id " Integer/MAX_VALUE)}
             (metabot-v3.tools.filters/query-datasource
              {:model-id Integer/MAX_VALUE}))))))

(deftest ^:parallel query-datasource-permissions-test
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders {})
                                             :database_id (mt/id)
                                             :name "Orders Model"
                                             :type :model}]
    (testing "User without permissions gets error for table"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot-v3.tools.filters/query-datasource
                             {:table-id (mt/id :orders)}))))

    (testing "User without permissions gets error for model"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot-v3.tools.filters/query-datasource
                             {:model-id model-id}))))))
