(ns metabase-enterprise.metabot-v3.tools.filters-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.entity-details :as metabot-v3.tools.entity-details]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.test-util :as tools.tu]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-util :as lib.tu]
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
            (let [result (metabot-v3.tools.filters/query-metric
                          {:metric-id metric-id
                           :filters []
                           :group-by []})
                  actual-query (get-in result [:structured-output :query])
                  expected-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                     (lib/aggregate (lib.options/ensure-uuid [:metric {} metric-id])))]
              (is (= :query (get-in result [:structured-output :type])))
              (is (string? (get-in result [:structured-output :query-id])))
              (is (tools.tu/query= expected-query actual-query))))
          (testing "Filtering and grouping works and ignores bucketing for non-temporal columns."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-table (mt/id :orders)
                                                           :aggregation [[:metric {} metric-id]]
                                                           :breakout [[:field {:source-field (mt/id :orders :product_id)}
                                                                       (mt/id :products :category)]]
                                                           :filters
                                                           [[:= {} [:field {:source-field (mt/id :orders :user_id)}
                                                                    (mt/id :people :state)]
                                                             "TX"]
                                                            [:> {} [:field {} (mt/id :orders :discount)]
                                                             3]]}]}}}
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
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-table (mt/id :orders)
                                                           :aggregation [[:metric {} metric-id]]
                                                           :filters [[:!= {}
                                                                      [:get-week {} [:field {} (mt/id :orders :created_at)] :iso]
                                                                      1 2 3]
                                                                     [:= {}
                                                                      [:get-month {} [:field {} (mt/id :orders :created_at)]]
                                                                      6 7 8]]
                                                           :breakout [[:field {:temporal-unit :week}
                                                                       (mt/id :orders :created_at)]]}]}}}
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
            (let [state-id (->field-id ["User" "State"])]
              (is (=? {:structured-output {:type :query,
                                           :query-id string?
                                           :query {:database (mt/id)
                                                   :lib/type :mbql/query
                                                   :stages [{:lib/type :mbql.stage/mbql
                                                             :source-table (mt/id :orders)
                                                             :aggregation [[:metric {} metric-id]]
                                                             :filters
                                                             [[:contains {:case-sensitive false}
                                                               [:field {:source-field (mt/id :orders :user_id)}
                                                                (mt/id :people :state)]
                                                               "o" "e"]
                                                              [:does-not-contain {:case-sensitive false}
                                                               [:field {:source-field (mt/id :orders :user_id)}
                                                                (mt/id :people :state)]
                                                               "y"]
                                                              [:starts-with {:case-sensitive false}
                                                               [:field {:source-field (mt/id :orders :user_id)}
                                                                (mt/id :people :state)]
                                                               "A" "G"]
                                                              [:ends-with {:case-sensitive false}
                                                               [:field {:source-field (mt/id :orders :user_id)}
                                                                (mt/id :people :state)]
                                                               "e" "f" "i" "T" "x"]
                                                              [:!= {}
                                                               [:field {} (mt/id :orders :discount)]
                                                               3 42]]}]}}}
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
          (is (= {:output "Not found."
                  :status-code 404}
                 (metabot-v3.tools.filters/query-metric {:metric-id Integer/MAX_VALUE}))))
        (testing "Invalid metric-id results in an error."
          (is (= {:output (str "Invalid metric_id " metric-id)
                  :status-code 400}
                 (metabot-v3.tools.filters/query-metric {:metric-id (str metric-id)}))))))))

(deftest query-metric-temporal-value-validation-test
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
      (mt/with-current-user (mt/user->id :crowberto)
        (let [metric-details (metabot-v3.tools.entity-details/metric-details metric-id)
              ->field-id #(u/prog1 (-> metric-details :queryable-dimensions (by-name %) :field_id)
                            (when-not <>
                              (throw (ex-info (str "Column " % " not found") {:column %}))))]
          (testing "Negative value on temporal field without bucket is rejected"
            (let [result (metabot-v3.tools.filters/query-metric
                          {:metric-id metric-id
                           :filters [{:field-id (->field-id "Created At")
                                      :operation :greater-than-or-equal
                                      :value -30}]
                           :group-by []})]
              (is (= 400 (:status-code result)))
              (is (str/includes? (:output result) "not valid for a date/datetime field"))))
          (testing "Small positive integer on temporal field without bucket is rejected"
            (let [result (metabot-v3.tools.filters/query-metric
                          {:metric-id metric-id
                           :filters [{:field-id (->field-id "Created At")
                                      :operation :greater-than-or-equal
                                      :value 7}]
                           :group-by []})]
              (is (= 400 (:status-code result)))
              (is (str/includes? (:output result) "not valid for a date/datetime field"))))
          (testing "Date string on temporal field without bucket passes validation"
            (is (=? {:structured-output {:type :query}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field-id (->field-id "Created At")
                                 :operation :greater-than-or-equal
                                 :value "2024-01-01"}]
                      :group-by []}))))
          (testing "Large integer (year) on temporal field without bucket passes validation"
            (is (=? {:structured-output {:type :query}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field-id (->field-id "Created At")
                                 :operation :greater-than-or-equal
                                 :value 2024}]
                      :group-by []}))))
          (testing "Numeric value on non-temporal field without bucket passes validation"
            (is (=? {:structured-output {:type :query}}
                    (metabot-v3.tools.filters/query-metric
                     {:metric-id metric-id
                      :filters [{:field-id (->field-id "Discount")
                                 :operation :greater-than-or-equal
                                 :value -5}]
                      :group-by []})))))))))

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
            ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
                          (when-not <>
                            (throw (ex-info (str "Column " % " not found") {:column %}))))
            order-created-at-field-id (->field-id "Created At")]
        (testing "Trivial query works."
          (is (=? {:structured-output {:type :query,
                                       :query-id string?
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id}]}}}
                  (metabot-v3.tools.filters/query-model
                   {:model-id model-id
                    :filters []
                    :group-by []}))))
        (testing "Filtering, aggregation and grouping works and ignores bucketing for non-temporal columns."
          (is (=? {:structured-output {:type :query,
                                       :query-id string?
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :aggregation [[:sum {} [:field {} "SUBTOTAL"]]]
                                                         :breakout [[:field {} "PRODUCT_ID"]]
                                                         :filters [[:> {} [:field {} "DISCOUNT"] 3]]}]}}}
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
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :aggregation [[:min {} [:field {:temporal-unit :hour-of-day} "CREATED_AT"]]
                                                                       [:avg {} [:field {:temporal-unit :hour-of-day} "CREATED_AT"]]
                                                                       [:max {} [:field {:temporal-unit :hour-of-day} "CREATED_AT"]]]
                                                         :filters [[:!= {} [:get-week {} [:field {} "CREATED_AT"] :iso] 1 2 3]
                                                                   [:= {} [:get-month {} [:field {} "CREATED_AT"]] 6 7 8]]
                                                         :breakout [[:field {} "PRODUCT_ID"]
                                                                    [:field {:temporal-unit :week} "CREATED_AT"]]}]}}}
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
                                 :query {:database (mt/id)
                                         :lib/type :mbql/query
                                         :stages [{:lib/type :mbql.stage/mbql
                                                   :source-card model-id
                                                   :filters [[:!= {} [:field {} "USER_ID"] 3 42]]}]}}}
                input {:model-id model-id
                       :filters [{:field-id (->field-id "User ID")
                                  :operation :not-equals
                                  :values [3 42]}]}]
            (are [input] (=? expected-query (metabot-v3.tools.filters/query-model input))
              input
              (assoc input :fields nil)
              (assoc input :fields [])))))
      (testing "Missing model results in an error."
        (is (= {:output "Not found."
                :status-code 404}
               (metabot-v3.tools.filters/query-model {:model-id Integer/MAX_VALUE}))))
      (testing "Invalid model-id results in an error."
        (is (= {:output (str "Invalid model_id " model-id)
                :status-code 400}
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
        (let [result (metabot-v3.tools.filters/filter-records
                      {:data-source {:table-id table-id}
                       :filters []})
              actual-query (get-in result [:structured-output :query])
              expected-query (lib/query mp (lib.metadata/table mp table-id))]
          (is (= :query (get-in result [:structured-output :type])))
          (is (string? (get-in result [:structured-output :query-id])))
          (is (tools.tu/query= expected-query actual-query))))
      (testing "Filtering works."
        (let [result (metabot-v3.tools.filters/filter-records
                      {:data-source {:table-id table-id}
                       :filters [{:field-id (->field-id "Created At")
                                  :bucket :day-of-week
                                  :operation :equals
                                  :values [1 7]}
                                 {:field-id (->field-id "Discount")
                                  :operation :number-greater-than
                                  :value 3}]})
              actual-query (get-in result [:structured-output :query])
              orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
              created-at-col (lib.metadata/field mp (mt/id :orders :created_at))
              discount-col (lib.metadata/field mp (mt/id :orders :discount))
              expected-query (-> orders-query
                                 (lib/filter (lib/= (lib/get-day-of-week created-at-col :iso) 1 7))
                                 (lib/filter (lib/> discount-col 3)))]
          (is (= :query (get-in result [:structured-output :type])))
          (is (string? (get-in result [:structured-output :query-id])))
          (is (tools.tu/query= expected-query actual-query)))))
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
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-card model-id}]}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:table-id table-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-card model-id
                                                           :filters [[:> {} [:field {} "DISCOUNT"] 3]]}]}}}
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
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-table table-id}]}}}
                    (metabot-v3.tools.filters/filter-records
                     {:data-source {:report-id card-id}
                      :filters []}))))
          (testing "Filtering works."
            (is (=? {:structured-output {:type :query,
                                         :query-id string?
                                         :query {:database (mt/id)
                                                 :lib/type :mbql/query
                                                 :stages [{:lib/type :mbql.stage/mbql
                                                           :source-table table-id
                                                           :filters [[:> {} [:field {} (mt/id :orders :discount)] 3]]}]}}}
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
                                              :lib/type :mbql/query
                                              :stages [{:lib/type :mbql.stage/mbql
                                                        :source-table table-id}
                                                       {:lib/type :mbql.stage/mbql
                                                        :filters [[:> {} [:field {} "DISCOUNT"] 3]]}]}}}]
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
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id}))))

      (testing "Table query with fields selection"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :fields [[:field {} (mt/id :orders :created_at)]
                                                                [:field {} (mt/id :orders :total)]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :fields [{:field-id (->field-id "Created At")}
                           {:field-id (->field-id "Total")}]}))))

      (testing "Table query with filters"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:> {} [:field {} (mt/id :orders :discount)] 3]
                                                                 [:= {} [:field {} (mt/id :orders :user_id)] 10]]}]}}}
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
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:sum {} [:field {} (mt/id :orders :subtotal)]]
                                                                     [:avg {} [:field {} (mt/id :orders :discount)]]]
                                                       :breakout [[:field {} (mt/id :orders :product_id)]]}]}}}
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
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :order-by [[:asc {} [:field {} (mt/id :orders :created_at)]]
                                                                  [:desc {} [:field {} (mt/id :orders :total)]]]
                                                       :limit 100}]}}}
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
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:count {}]]
                                                       :breakout [[:field {:temporal-unit :month} (mt/id :orders :created_at)]]}]}}}
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
            ->field-id #(u/prog1 (-> model-details :fields (by-name %) :field_id)
                          (when-not <>
                            (throw (ex-info (str "Column " % " not found") {:column %}))))]
        (testing "Basic model query works"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id}]}}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id}))))

        (testing "Model query with fields selection"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :fields [[:field {} "CREATED_AT"]
                                                                  [:field {} "TOTAL"]]}]}}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :fields [{:field-id (->field-id "Created At")}
                             {:field-id (->field-id "Total")}]}))))

        (testing "Model query with filters"
          (is (=? {:structured-output {:type :query
                                       :query-id string?
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :filters [[:> {} [:field {} "DISCOUNT"] 5]
                                                                   [:< {} [:field {} "SUBTOTAL"] 100]]}]}}}
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
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :aggregation [[:count {}]
                                                                       [:max {} [:field {} "TOTAL"]]]
                                                         :breakout [[:field {} "USER_ID"]]}]}}}
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
                                       :query {:database (mt/id)
                                               :lib/type :mbql/query
                                               :stages [{:lib/type :mbql.stage/mbql
                                                         :source-card model-id
                                                         :order-by [[:desc {} [:field {} "CREATED_AT"]]]
                                                         :limit 50}]}}}
                  (metabot-v3.tools.filters/query-datasource
                   {:model-id model-id
                    :order-by [{:field {:field-id (->field-id "Created At")}
                                :direction :desc}]
                    :limit 50}))))))))

(deftest ^:parallel query-datasource-validation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "Error when neither table-id nor model-id provided"
      (is (= {:output "Either table_id or model_id must be provided"
              :status-code 400}
             (metabot-v3.tools.filters/query-datasource {}))))

    (testing "Error when both table-id and model-id provided"
      (is (= {:output "Cannot provide both table_id and model_id"
              :status-code 400}
             (metabot-v3.tools.filters/query-datasource
              {:table-id (mt/id :orders)
               :model-id 123}))))

    (testing "Error with invalid table-id"
      (is (= {:output "Invalid table_id not-a-number"
              :status-code 400}
             (metabot-v3.tools.filters/query-datasource
              {:table-id "not-a-number"}))))

    (testing "Error with invalid model-id"
      (is (= {:output "Invalid model_id not-a-number"
              :status-code 400}
             (metabot-v3.tools.filters/query-datasource
              {:model-id "not-a-number"}))))

    (testing "Error with non-existent table"
      (is (= {:output (str "No table found with table_id " Integer/MAX_VALUE)
              :status-code 404}
             (metabot-v3.tools.filters/query-datasource
              {:table-id Integer/MAX_VALUE}))))

    (testing "Error with non-existent model"
      (is (= {:output (str "No model found with model_id " Integer/MAX_VALUE)
              :status-code 404}
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

(defn- mbql-measure-definition
  "Create an MBQL5 measure definition with a sum aggregation."
  [table-id field-id]
  (let [mp (mt/metadata-provider)
        table (lib.metadata/table mp table-id)
        query (lib/query mp table)
        field (lib.metadata/field mp field-id)]
    (lib/aggregate query (lib/sum field))))

(defn- mbql-segment-definition
  "Create an MBQL5 segment definition with a filter."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)
        table (lib.metadata/table mp table-id)
        query (lib/query mp table)
        field (lib.metadata/field mp field-id)]
    (lib/filter query (lib/> field value))))

(defn- add-mock-segment
  "Add a mock segment to a metadata provider."
  [base-mp segment-id table-id definition]
  (lib.tu/mock-metadata-provider
   base-mp
   {:segments [{:lib/type   :metadata/segment
                :id         segment-id
                :name       (str "Mock Segment " segment-id)
                :table-id   table-id
                :archived   false
                :definition definition}]}))

(defn- add-mock-measure
  "Add a mock measure to a metadata provider."
  [base-mp measure-id table-id definition]
  (lib.tu/mock-metadata-provider
   base-mp
   {:measures [{:lib/type   :metadata/measure
                :id         measure-id
                :name       (str "Mock Measure " measure-id)
                :table-id   table-id
                :archived   false
                :definition definition}]}))

(deftest query-metric-with-segment-filter-test
  (let [mp (mt/metadata-provider)
        created-at-meta (lib.metadata/field mp (mt/id :orders :created_at))
        metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total))))
                         (lib/breakout (lib/with-temporal-bucket created-at-meta :month)))
        legacy-metric-query (lib.convert/->legacy-MBQL metric-query)
        segment-def (mbql-segment-definition (mt/id :orders) (mt/id :orders :total) 50)
        mock-segment-id 1
        mock-mp (add-mock-segment mp mock-segment-id (mt/id :orders) segment-def)]
    (mt/with-temp [:model/Card {metric-id :id} {:dataset_query legacy-metric-query
                                                :database_id (mt/id)
                                                :name "Total Orders"
                                                :type :metric}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "query-metric with segment filter applies the segment"
          (with-redefs [lib-be/application-database-metadata-provider (constantly mock-mp)]
            (let [result (metabot-v3.tools.filters/query-metric
                          {:metric-id metric-id
                           :filters [{:segment-id mock-segment-id}]
                           :group-by []})
                  query (get-in result [:structured-output :query])
                  filters (get-in query [:stages 0 :filters])]
              (is (some? (:structured-output result)))
              (is (= :query (get-in result [:structured-output :type])))
              (is (=? [[:segment {} mock-segment-id]] filters)))))))))

(deftest query-datasource-with-measure-aggregation-test
  (let [mp (mt/metadata-provider)
        measure-def (mbql-measure-definition (mt/id :orders) (mt/id :orders :total))
        mock-measure-id 1
        mock-mp (add-mock-measure mp mock-measure-id (mt/id :orders) measure-def)]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [lib-be/application-database-metadata-provider (constantly mock-mp)]
        (testing "query-datasource with measure aggregation"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :aggregations [{:measure-id mock-measure-id}]})
                query (get-in result [:structured-output :query])
                aggregations (get-in query [:stages 0 :aggregation])]
            (is (some? (:structured-output result)))
            (is (= :query (get-in result [:structured-output :type])))
            ;; Check that a measure aggregation is present
            (is (some #(and (vector? %) (= :measure (first %))) aggregations))))

        (testing "query-datasource with measure aggregation and sort order"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :aggregations [{:measure-id mock-measure-id
                                         :sort-order :desc}]})
                query (get-in result [:structured-output :query])
                order-by (get-in query [:stages 0 :order-by])]
            (is (some? order-by))
            (is (some #(= :desc (first %)) order-by))))))))

(deftest query-datasource-with-segment-filter-test
  (let [mp (mt/metadata-provider)
        segment-def (mbql-segment-definition (mt/id :orders) (mt/id :orders :total) 100)
        mock-segment-id 1
        mock-mp (add-mock-segment mp mock-segment-id (mt/id :orders) segment-def)]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [lib-be/application-database-metadata-provider (constantly mock-mp)]
        (testing "query-datasource with segment filter"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :filters [{:segment-id mock-segment-id}]})
                query (get-in result [:structured-output :query])
                filters (get-in query [:stages 0 :filters])]
            (is (some? (:structured-output result)))
            (is (= :query (get-in result [:structured-output :type])))
            ;; Check that a segment filter is present
            (is (some #(and (vector? %) (= :segment (first %))) filters))))))))

(deftest query-datasource-with-measures-and-segments-test
  (let [mp (mt/metadata-provider)
        measure-def (mbql-measure-definition (mt/id :orders) (mt/id :orders :total))
        segment-def (mbql-segment-definition (mt/id :orders) (mt/id :orders :discount) 0)
        mock-measure-id 1
        mock-segment-id 1
        mock-mp (-> mp
                    (add-mock-measure mock-measure-id (mt/id :orders) measure-def)
                    (add-mock-segment mock-segment-id (mt/id :orders) segment-def))]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [lib-be/application-database-metadata-provider (constantly mock-mp)]
        (testing "query-datasource with both measure aggregation and segment filter"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :aggregations [{:measure-id mock-measure-id}]
                         :filters [{:segment-id mock-segment-id}]})
                query (get-in result [:structured-output :query])
                aggregations (get-in query [:stages 0 :aggregation])
                filters (get-in query [:stages 0 :filters])]
            (is (some? (:structured-output result)))
            ;; Check that both measure and segment are present
            (is (some #(and (vector? %) (= :measure (first %))) aggregations))
            (is (some #(and (vector? %) (= :segment (first %))) filters))))))))

(deftest segment-not-found-test
  (let [mp (mt/metadata-provider)
        non-existent-segment-id 99999]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [lib-be/application-database-metadata-provider (constantly mp)]
        (testing "query-datasource with non-existent segment returns error"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :filters [{:segment-id non-existent-segment-id}]})]
            (is (nil? (:structured-output result)))
            (is (string? (:output result)))
            (is (str/includes? (:output result) "Segment"))
            (is (str/includes? (:output result) "not found"))))))))

(deftest measure-not-found-test
  (let [mp (mt/metadata-provider)
        non-existent-measure-id 99999]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [lib-be/application-database-metadata-provider (constantly mp)]
        (testing "query-datasource with non-existent measure returns error"
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id (mt/id :orders)
                         :aggregations [{:measure-id non-existent-measure-id}]})]
            (is (nil? (:structured-output result)))
            (is (string? (:output result)))
            (is (str/includes? (:output result) "Measure"))
            (is (str/includes? (:output result) "not found"))))))))

;;; ======================= Compound Filter Tests =======================

(deftest ^:parallel query-datasource-with-compound-filter-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Compound OR filter combines conditions with OR"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:or {}
                                                                  [:> {} [:field {} (mt/id :orders :discount)] 5]
                                                                  [:> {} [:field {} (mt/id :orders :quantity)] 10]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :compound
                             :operator :or
                             :filters [{:field-id (->field-id "Discount")
                                        :operation :number-greater-than
                                        :value 5}
                                       {:field-id (->field-id "Quantity")
                                        :operation :number-greater-than
                                        :value 10}]}]}))))

      (testing "Compound AND filter combines conditions with AND"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:and {}
                                                                  [:> {} [:field {} (mt/id :orders :discount)] 5]
                                                                  [:< {} [:field {} (mt/id :orders :quantity)] 100]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :compound
                             :operator :and
                             :filters [{:field-id (->field-id "Discount")
                                        :operation :number-greater-than
                                        :value 5}
                                       {:field-id (->field-id "Quantity")
                                        :operation :number-less-than
                                        :value 100}]}]}))))

      (testing "Nested compound filters work correctly"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:or {}
                                                                  [:and {}
                                                                   [:> {} [:field {} (mt/id :orders :discount)] 5]
                                                                   [:< {} [:field {} (mt/id :orders :quantity)] 50]]
                                                                  [:> {} [:field {} (mt/id :orders :total)] 1000]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :compound
                             :operator :or
                             :filters [{:filter-kind :compound
                                        :operator :and
                                        :filters [{:field-id (->field-id "Discount")
                                                   :operation :number-greater-than
                                                   :value 5}
                                                  {:field-id (->field-id "Quantity")
                                                   :operation :number-less-than
                                                   :value 50}]}
                                       {:field-id (->field-id "Total")
                                        :operation :number-greater-than
                                        :value 1000}]}]})))))))

;;; ======================= Between Filter Tests =======================

(deftest ^:parallel query-datasource-with-between-filter-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Between filter with numeric values"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:between {}
                                                                  [:field {} (mt/id :orders :total)]
                                                                  100
                                                                  500]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :between
                             :field-id (->field-id "Total")
                             :lower-value 100
                             :upper-value 500}]}))))

      (testing "Between filter with date values"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:between {}
                                                                  [:field {} (mt/id :orders :created_at)]
                                                                  "2024-01-01"
                                                                  "2024-12-31"]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :between
                             :field-id (->field-id "Created At")
                             :lower-value "2024-01-01"
                             :upper-value "2024-12-31"}]})))))))

;;; ======================= Advanced Aggregation Tests =======================

(deftest ^:parallel query-datasource-with-advanced-aggregations-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Median aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:median {} [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :median}]}))))

      (testing "Standard deviation aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:stddev {} [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :stddev}]}))))

      (testing "Variance aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:var {} [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :var}]}))))

      (testing "Percentile aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:percentile {} [:field {} (mt/id :orders :total)] 0.95]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :percentile
                                  :percentile-value 0.95}]}))))

      (testing "Cumulative sum aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:cum-sum {} [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :cum-sum}]}))))

      (testing "Cumulative count aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:cum-count {}]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :cum-count}]})))))))

;;; ======================= Conditional Aggregation Tests =======================

(deftest ^:parallel query-datasource-with-conditional-aggregations-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Count-where aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:count-where {}
                                                                      [:> {} [:field {} (mt/id :orders :total)] 100]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:function :count-where
                                  :condition {:field-id (->field-id "Total")
                                              :operation :number-greater-than
                                              :value 100}}]}))))

      (testing "Sum-where aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:sum-where {}
                                                                      [:field {} (mt/id :orders :total)]
                                                                      [:> {} [:field {} (mt/id :orders :discount)] 5]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "Total")
                                  :function :sum-where
                                  :condition {:field-id (->field-id "Discount")
                                              :operation :number-greater-than
                                              :value 5}}]}))))

      (testing "Distinct-where aggregation"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :aggregation [[:distinct-where {}
                                                                      [:field {} (mt/id :orders :user_id)]
                                                                      [:> {} [:field {} (mt/id :orders :total)] 50]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :aggregations [{:field-id (->field-id "User ID")
                                  :function :distinct-where
                                  :condition {:field-id (->field-id "Total")
                                              :operation :number-greater-than
                                              :value 50}}]})))))))

;;; ======================= Expression Tests =======================

(deftest ^:parallel query-datasource-with-expressions-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Math expression - divide"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :expressions [[:/ {:lib/expression-name "Discount Rate"}
                                                                      [:field {} (mt/id :orders :discount)]
                                                                      [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Discount Rate"
                                 :operation "divide"
                                 :arguments [{:field-id (->field-id "Discount")}
                                             {:field-id (->field-id "Total")}]}]}))))

      (testing "Math expression - add with literal value"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :expressions [[:+ {:lib/expression-name "Total Plus Tax"}
                                                                      [:field {} (mt/id :orders :total)]
                                                                      10]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Total Plus Tax"
                                 :operation "add"
                                 :arguments [{:field-id (->field-id "Total")}
                                             {:value 10}]}]}))))

      (testing "String expression - upper"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       ;; The expression name should be present
                                                       :expressions vector?}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Upper User ID"
                                 :operation "upper"
                                 :arguments [{:field-id (->field-id "User ID")}]}]}))))

      (testing "Date extraction expression - get-year"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :expressions [[:get-year {:lib/expression-name "Order Year"}
                                                                      [:field {} (mt/id :orders :created_at)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Order Year"
                                 :operation "get-year"
                                 :arguments [{:field-id (->field-id "Created At")}]}]}))))

      (testing "Multiple expressions"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :expressions vector?}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Profit"
                                 :operation "subtract"
                                 :arguments [{:field-id (->field-id "Total")}
                                             {:field-id (->field-id "Subtotal")}]}
                                {:name "Tax Rate"
                                 :operation "divide"
                                 :arguments [{:field-id (->field-id "Tax")}
                                             {:field-id (->field-id "Total")}]}]}))))

      (testing "Nested inline expression (expression as argument)"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       ;; (Total - Subtotal) / Total
                                                       :expressions [[:/ {:lib/expression-name "Profit Margin"}
                                                                      [:- {}
                                                                       [:field {} (mt/id :orders :total)]
                                                                       [:field {} (mt/id :orders :subtotal)]]
                                                                      [:field {} (mt/id :orders :total)]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Profit Margin"
                                 :operation "divide"
                                 :arguments [{:operation "subtract"
                                              :arguments [{:field-id (->field-id "Total")}
                                                          {:field-id (->field-id "Subtotal")}]}
                                             {:field-id (->field-id "Total")}]}]}))))

      (testing "Aggregation on expression via expression_ref"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :expressions [[:- {:lib/expression-name "Profit"}
                                                                      [:field {} (mt/id :orders :total)]
                                                                      [:field {} (mt/id :orders :subtotal)]]]
                                                       :aggregation [[:sum {}
                                                                      [:expression {} "Profit"]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :expressions [{:name "Profit"
                                 :operation "subtract"
                                 :arguments [{:field-id (->field-id "Total")}
                                             {:field-id (->field-id "Subtotal")}]}]
                  :aggregations [{:function :sum
                                  :expression-ref "Profit"}]})))))))

;;; ======================= Post-Aggregation Filter Tests =======================

(deftest ^:parallel query-datasource-with-post-filters-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Post-filter on aggregation (HAVING equivalent)"
        (let [result (metabot-v3.tools.filters/query-datasource
                      {:table-id table-id
                       :aggregations [{:field-id (->field-id "Total")
                                       :function :sum}]
                       :group-by [{:field-id (->field-id "Product ID")}]
                       :post-filters [{:aggregation-index 0
                                       :operation :greater-than
                                       :value 10000}]})
              stages (get-in result [:structured-output :query :stages])]
          (is (some? (:structured-output result)))
          ;; Post-filters create a second stage
          (is (= 2 (count stages)))
          ;; First stage has aggregation and breakout
          (is (some? (get-in stages [0 :aggregation])))
          (is (some? (get-in stages [0 :breakout])))
          ;; Second stage has the filter
          (is (some? (get-in stages [1 :filters])))))

      (testing "Multiple post-filters"
        (let [result (metabot-v3.tools.filters/query-datasource
                      {:table-id table-id
                       :aggregations [{:field-id (->field-id "Total")
                                       :function :sum}
                                      {:field-id (->field-id "Quantity")
                                       :function :count}]
                       :group-by [{:field-id (->field-id "Product ID")}]
                       :post-filters [{:aggregation-index 0
                                       :operation :greater-than
                                       :value 5000}
                                      {:aggregation-index 1
                                       :operation :greater-than-or-equal
                                       :value 10}]})
              stages (get-in result [:structured-output :query :stages])]
          (is (some? (:structured-output result)))
          (is (= 2 (count stages)))
          ;; Second stage has two filters
          (is (= 2 (count (get-in stages [1 :filters]))))))

      (testing "Post-filter operations"
        (doseq [[op-kw expected-op] [[:greater-than :>]
                                     [:less-than :<]
                                     [:equals :=]
                                     [:not-equals :!=]
                                     [:greater-than-or-equal :>=]
                                     [:less-than-or-equal :<=]]]
          (let [result (metabot-v3.tools.filters/query-datasource
                        {:table-id table-id
                         :aggregations [{:field-id (->field-id "Total")
                                         :function :count}]
                         :group-by [{:field-id (->field-id "Product ID")}]
                         :post-filters [{:aggregation-index 0
                                         :operation op-kw
                                         :value 100}]})
                filter-clause (get-in result [:structured-output :query :stages 1 :filters 0])]
            (is (= expected-op (first filter-clause)) (str "Expected " expected-op " for operation " op-kw))))))))

;;; ======================= Compound Post-Filter Tests =======================

(deftest ^:parallel query-datasource-with-compound-post-filters-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Compound OR post-filter combines aggregation conditions"
        (let [result (metabot-v3.tools.filters/query-datasource
                      {:table-id table-id
                       :aggregations [{:field-id (->field-id "Total")
                                       :function :sum}
                                      {:field-id (->field-id "Quantity")
                                       :function :sum}]
                       :group-by [{:field-id (->field-id "Product ID")}]
                       :post-filters [{:filter-kind :compound
                                       :operator :or
                                       :filters [{:aggregation-index 0
                                                  :operation :greater-than
                                                  :value 5000}
                                                 {:aggregation-index 1
                                                  :operation :greater-than
                                                  :value 50}]}]})
              stages (get-in result [:structured-output :query :stages])]
          (is (some? (:structured-output result)))
          (is (= 2 (count stages)))
          ;; Second stage should have one OR filter
          (let [filter-clause (get-in stages [1 :filters 0])]
            (is (= :or (first filter-clause))))))

      (testing "Compound AND post-filter combines aggregation conditions"
        (let [result (metabot-v3.tools.filters/query-datasource
                      {:table-id table-id
                       :aggregations [{:field-id (->field-id "Total")
                                       :function :sum}
                                      {:field-id (->field-id "Quantity")
                                       :function :count}]
                       :group-by [{:field-id (->field-id "Product ID")}]
                       :post-filters [{:filter-kind :compound
                                       :operator :and
                                       :filters [{:aggregation-index 0
                                                  :operation :greater-than
                                                  :value 1000}
                                                 {:aggregation-index 1
                                                  :operation :less-than
                                                  :value 100}]}]})
              stages (get-in result [:structured-output :query :stages])]
          (is (some? (:structured-output result)))
          (is (= 2 (count stages)))
          ;; Second stage should have one AND filter
          (let [filter-clause (get-in stages [1 :filters 0])]
            (is (= :and (first filter-clause)))))))))

;;; ======================= Post-Filter Column Index Regression Test =======================
;;; Regression test: post-filters should reference aggregation columns, not breakout columns.
;;; aggregation_index 0 should reference the first aggregation, not the first breakout.

(deftest ^:parallel query-datasource-post-filter-indexes-aggregations-not-breakouts-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Post-filter aggregation_index 0 should filter on the aggregation, not the breakout"
        ;; This is a regression test for a bug where aggregation_index was used as an index
        ;; into the returned columns (breakouts + aggregations), rather than just aggregations.
        ;; With 1 breakout (Product ID) and 1 aggregation (sum of Total),
        ;; aggregation_index 0 should filter on the sum, not on Product ID.
        (let [result (metabot-v3.tools.filters/query-datasource
                      {:table-id table-id
                       :aggregations [{:field-id (->field-id "Total")
                                       :function :sum}]
                       :group-by [{:field-id (->field-id "Product ID")}]
                       :post-filters [{:aggregation-index 0
                                       :operation :greater-than
                                       :value 10000}]})
              stages (get-in result [:structured-output :query :stages])
              ;; The second stage should have a filter on the aggregation column
              filter-clause (get-in stages [1 :filters 0])]
          (is (some? (:structured-output result)))
          (is (= 2 (count stages)))
          ;; The filter should be [:> {} <column-ref> 10000]
          ;; The column-ref should NOT be PRODUCT_ID (the breakout), it should be the sum aggregation
          ;; We check that the filter is comparing against a numeric aggregation, not a field
          (is (= :> (first filter-clause)))
          ;; The column being filtered should be "sum" not "PRODUCT_ID"
          ;; In the second stage, columns from stage 1 are referenced, so we check the column name
          (let [filtered-col (second (rest filter-clause))]
            ;; The filtered column should NOT be the product_id field
            (is (not= (mt/id :orders :product_id)
                      (nth filtered-col 2 nil)) ; field id in [:field {} id] form
                "Post-filter should NOT be on the breakout column (Product ID)")))))))

;;; ======================= Compound Filter with LLM Operations Tests =======================
;;; Regression test: compound filters with LLM-style operations (greater-than, less-than, etc.)
;;; These use the same operation names the LLM sends via construct_notebook_query

(deftest ^:parallel query-datasource-with-compound-filter-llm-operations-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          table-id (mt/id :orders)
          table-details (#'metabot-v3.tools.entity-details/table-details table-id {:metadata-provider mp})
          ->field-id #(u/prog1 (-> table-details :fields (by-name %) :field_id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))]
      (testing "Compound OR filter with :greater-than operations (LLM-style)"
        (is (=? {:structured-output {:type :query
                                     :query-id string?
                                     :query {:database (mt/id)
                                             :lib/type :mbql/query
                                             :stages [{:lib/type :mbql.stage/mbql
                                                       :source-table table-id
                                                       :filters [[:or {}
                                                                  [:> {} [:field {} (mt/id :orders :total)] 5000]
                                                                  [:> {} [:field {} (mt/id :orders :quantity)] 50]]]}]}}}
                (metabot-v3.tools.filters/query-datasource
                 {:table-id table-id
                  :filters [{:filter-kind :compound
                             :operator :or
                             :filters [{:field-id (->field-id "Total")
                                        :operation :greater-than
                                        :value 5000}
                                       {:field-id (->field-id "Quantity")
                                        :operation :greater-than
                                        :value 50}]}]})))))))
