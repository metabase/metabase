(ns metabase.lib.drill-thru.column-filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel returns-column-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/column-filter, :initial-op nil}}))

(deftest ^:parallel returns-column-filter-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-8
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}}))

(deftest ^:parallel returns-column-filter-test-9
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/column-filter, :initial-op nil}}))

(deftest ^:parallel returns-column-filter-test-10
  (testing "column-filter should be available for aggregated query metric column (#34223)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "count"
      :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}})))

(deftest ^:parallel returns-column-filter-test-11
  (testing "column-filter should be available for aggregated query metric column (#34223)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type :drill-thru/column-filter, :initial-op {:short :=}}})))

(deftest ^:parallel aggregation-adds-extra-stage-test
  (testing "filtering an aggregation column adds an extra stage"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :products :category)))
          [_category
           count-col] (lib/returned-columns query)
          new-stage   (lib/append-stage query)]
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        new-stage
               :stage-number -1
               :column       (->> new-stage
                                  lib/filterable-columns
                                  (m/find-first #(= (:name %) "count")))}
              (->> {:column     count-col
                    :column-ref (lib/ref count-col)
                    :value      nil}
                   (lib/available-drill-thrus query -1)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel aggregation-existing-extra-stage-test
  (testing "filtering an aggregation column uses an existing later stage"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/breakout (meta/field-metadata :products :category))
                          (lib/append-stage))
          [_category
           count-col] (lib/returned-columns query 0 (-> query :stages first))] ;; NOTE: columns of the first stage
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        query
               :stage-number 1
               :column       (-> query lib/returned-columns second)}
              (->> {:column     count-col
                    :column-ref (lib/ref count-col)
                    :value      nil}
                   (lib/available-drill-thrus query 0)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel no-aggregation-no-extra-stage-test
  (testing "filtering a non-aggregation column does not add another stage"
    (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
          subtotal   (m/find-first #(= (:name %) "SUBTOTAL")
                                   (lib/returned-columns query))]
      (is (=? {:lib/type     :metabase.lib.drill-thru/drill-thru
               :type         :drill-thru/column-filter
               :query        query
               :stage-number -1
               ;; The filterable-columns counterpart is returned, not the plain column.
               :column       {:lib/type  :metadata/column
                              :name      "SUBTOTAL"
                              :id        (meta/id :orders :subtotal)
                              :operators (fn [ops]
                                           (every? (every-pred map? #(= (:lib/type %) :operator/filter)) ops))}}
              (->> {:column     subtotal
                    :column-ref (lib/ref subtotal)
                    :value      nil}
                   (lib/available-drill-thrus query -1)
                   (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel native-models-with-renamed-columns-test
  (testing "Generate sane queries for native query models with renamed columns (#22715 #36583)"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:cards [{:name                   "Card 5"
                                       :result-metadata        [{:description        "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens."
                                                                 :semantic_type      :type/PK
                                                                 :name               "ID"
                                                                 :settings           nil
                                                                 :fk_target_field_id nil
                                                                 :field_ref          [:field "ID" {:base-type :type/Integer}]
                                                                 :effective_type     :type/Integer
                                                                 :id                 (meta/id :orders :id)
                                                                 :visibility_type    :normal
                                                                 :display_name       "ID"
                                                                 :fingerprint        nil
                                                                 :base_type          :type/Integer}
                                                                {:description        "The date and time an order was submitted."
                                                                 :semantic_type      :type/CreationTimestamp
                                                                 :name               "ALIAS_CREATED_AT"
                                                                 :settings           nil
                                                                 :fk_target_field_id nil
                                                                 :field_ref          [:field "ALIAS_CREATED_AT" {:base-type :type/DateTime}]
                                                                 :effective_type     :type/DateTime
                                                                 :id                 (meta/id :orders :created-at)
                                                                 :visibility_type    :normal
                                                                 :display_name       "Created At"
                                                                 :fingerprint        {:global {:distinct-count 1, :nil% 0.0}
                                                                                      :type   #:type{:DateTime {:earliest "2023-12-08T23:49:58.310952Z", :latest "2023-12-08T23:49:58.310952Z"}}}
                                                                 :base_type          :type/DateTime}]
                                       :database-id            (meta/id)
                                       :query-type             :native
                                       :dataset-query          {:database (meta/id)
                                                                :native   {:query "select 1 as \"ID\", current_timestamp::datetime as \"ALIAS_CREATED_AT\"", :template-tags {}}
                                                                :type     :native}
                                       :id                     5
                                       :parameter-mappings     []
                                       :display                :table
                                       :visualization-settings {:table.pivot_column "ID", :table.cell_column "ALIAS_CREATED_AT"}
                                       :parameters             []
                                       :dataset                true}]})
          query             (lib/query metadata-provider (lib.metadata/card metadata-provider 5))
          _                 (is (=? {:stages [{:lib/type :mbql.stage/mbql, :source-card 5}]}
                                    query))
          col-created-at    (m/find-first #(= (:name %) "ALIAS_CREATED_AT")
                                          (lib/returned-columns query))
          _                 (is (some? col-created-at))
          context           {:column     col-created-at
                             :column-ref (lib/ref col-created-at)
                             :value      nil}
          drill             (m/find-first #(= (:type %) :drill-thru/column-filter)
                                          (lib/available-drill-thrus query context))]
      (is (=? {:lib/type :metabase.lib.drill-thru/drill-thru
               :type     :drill-thru/column-filter
               :column   {:name      "ALIAS_CREATED_AT"
                          :operators [{:short :!=}
                                      {:short :=}
                                      {:short :<}
                                      {:short :>}
                                      {:short :between}
                                      {:short :is-null}
                                      {:short :not-null}]}}
              drill))
      (testing "VERY IMPORTANT! UPDATED QUERY NEEDS TO USE A NOMINAL FIELD LITERAL REF, SINCE COLUMN NAME IS DIFFERENT!"
        (is (=? {:stages [{:source-card 5
                           :filters     [[:=
                                          {}
                                          [:field {} "ALIAS_CREATED_AT"]
                                          [:relative-datetime {} :current :day]]]}]}
                (lib/drill-thru query -1 drill "=" (lib/relative-datetime :current :day))))))))
