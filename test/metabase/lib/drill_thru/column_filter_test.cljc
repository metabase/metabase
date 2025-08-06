(ns metabase.lib.drill-thru.column-filter-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel column-filter-availability-test
  (testing "column-filter is available for any header click, and nothing else"
    (canned/canned-test
     :drill-thru/column-filter
     (fn [test-case _context {:keys [click]}]
       (and (= click :header)
            (not (:native? test-case)))))))

(def ^:private key-ops
  [{:lib/type :operator/filter, :short :=,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :!=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :>,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :<,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :between,  :display-name-variant :default}
   {:lib/type :operator/filter, :short :>=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :<=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :is-null,  :display-name-variant :is-empty}
   {:lib/type :operator/filter, :short :not-null, :display-name-variant :not-empty}])

(def ^:private number-ops
  (-> key-ops
      (assoc-in [0 :display-name-variant] :equal-to)
      (assoc-in [1 :display-name-variant] :not-equal-to)))

(def ^:private temporal-ops
  [{:lib/type :operator/filter, :short :!=,       :display-name-variant :excludes}
   {:lib/type :operator/filter, :short :=,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :<,        :display-name-variant :before}
   {:lib/type :operator/filter, :short :>,        :display-name-variant :after}
   {:lib/type :operator/filter, :short :between,  :display-name-variant :default}
   {:lib/type :operator/filter, :short :is-null,  :display-name-variant :is-empty}
   {:lib/type :operator/filter, :short :not-null, :display-name-variant :not-empty}])

(def ^:private text-ops
  [{:lib/type :operator/filter, :short :=,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :!=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :>,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :<,        :display-name-variant :default}
   {:lib/type :operator/filter, :short :between,  :display-name-variant :default}
   {:lib/type :operator/filter, :short :>=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :<=,       :display-name-variant :default}
   {:lib/type :operator/filter, :short :is-null,  :display-name-variant :is-empty}
   {:lib/type :operator/filter, :short :not-null, :display-name-variant :not-empty}])

(deftest ^:parallel returns-column-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators key-ops}}}))

(deftest ^:parallel returns-column-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators key-ops}}}))

(deftest ^:parallel returns-column-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators number-ops}}}))

(deftest ^:parallel returns-column-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators number-ops}}}))

(deftest ^:parallel returns-column-filter-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op nil
                  :column     {:operators temporal-ops}}}))

(deftest ^:parallel returns-column-filter-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators number-ops}}}))

(deftest ^:parallel returns-column-filter-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators key-ops}}}))

(deftest ^:parallel returns-column-filter-test-8
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "PRODUCT_ID"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op {:short :=}
                  :column     {:operators key-ops}}}))

(deftest ^:parallel returns-column-filter-test-9
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/column-filter
    :click-type  :header
    :query-type  :aggregated
    :column-name "CREATED_AT"
    :expected    {:type       :drill-thru/column-filter
                  :initial-op nil
                  :column     {:operators temporal-ops}}}))

(deftest ^:parallel returns-column-filter-test-10
  (testing "column-filter should be available for aggregated query metric column (#34223)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "count"
      :expected    {:type       :drill-thru/column-filter
                    :initial-op {:short :=}
                    :column     {:operators number-ops}}})))

(deftest ^:parallel returns-column-filter-test-11
  (testing "column-filter should be available for aggregated query metric column (#34223)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/column-filter
      :click-type  :header
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type       :drill-thru/column-filter
                    :initial-op {:short :=}
                    :column     {:operators number-ops}}})))

(deftest ^:parallel column-filter-not-returned-for-nil-dimension-test
  (testing "column-filter should not be returned for nil dimension values (#49740, #51741)"
    (lib.drill-thru.tu/test-drill-not-returned
     {:drill-type  :drill-thru/column-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :custom-row  #(assoc % "CREATED_AT" nil)})))

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

(deftest ^:parallel column-filter-unavailable-for-broken-ref-test
  (testing "do not return column filter drill when the corresponding filterable column cannot be found"
    (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
          subtotal   (m/find-first #(= (:name %) "SUBTOTAL") (lib/returned-columns query))]
      (is (nil?
           (->> {:column     subtotal
                 :column-ref [:field {:lib/uuid (str (random-uuid))} 999]
                 :value      nil}
                (lib/available-drill-thrus query -1)
                (m/find-first #(= (:type %) :drill-thru/column-filter))))))))

(deftest ^:parallel native-models-with-renamed-columns-test
  (testing "Generate sane queries for native query models with renamed columns (#22715 #36583)"
    (let [metadata-provider (-> {:name                   "Card 5"
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
                                 :parameters             []}
                                lib.tu/as-model
                                lib.tu/metadata-provider-with-mock-card)
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
                (lib/drill-thru query -1 nil drill "=" (lib/relative-datetime :current :day))))))))

(deftest ^:parallel column-filter-join-alias-test
  (testing "an input column with `:source-alias` and no `:join-alias` should work properly (#36861)"
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/join (lib/join-clause (meta/table-metadata :products)
                                                   [(lib/= (meta/field-metadata :orders :product-id)
                                                           (meta/field-metadata :products :id))])))
          columns   (lib/returned-columns query)
          category  (-> (m/find-first #(= (:name %) "CATEGORY") columns)
                        (dissoc :join-alias :metabase.lib.join/join-alias :lib/source))
          context   {:column     category
                     :column-ref (lib/ref category)
                     :value      nil}
          drills    (lib/available-drill-thrus query -1 context)
          colfilter (m/find-first #(= (:type %) :drill-thru/column-filter) drills)]
      (is (= "Products" (:source-alias category)))
      (is (= "Products" (-> context :column-ref second :join-alias)))
      (is (some? (:column colfilter))))))

(deftest ^:parallel string-pk-filters-test
  (testing "string PKs and FKs should get the same filter options as a regular string column (#40665)"
    (let [provider  (lib.tu/merged-mock-metadata-provider
                     meta/metadata-provider
                     {:fields [{:id        (meta/id :orders :id)
                                :base-type :type/Text}
                               {:id        (meta/id :orders :product-id)
                                :base-type :type/Text}]})
          query     (lib/query provider (lib.metadata/table provider (meta/id :orders)))
          columns   (lib/returned-columns query)
          pk        (m/find-first #(= (:name %) "ID") columns)
          fk        (m/find-first #(= (:name %) "PRODUCT_ID") columns)
          colfilter (fn [column]
                      (let [context {:column     column
                                     :column-ref (lib/ref column)
                                     :value      nil}
                            drills  (lib/available-drill-thrus query -1 context)]
                        (m/find-first #(= (:type %) :drill-thru/column-filter) drills)))]
      (is (=? {:type :drill-thru/column-filter
               :initial-op {:short :=}
               :column     {:operators text-ops}}
              (colfilter pk)))
      (is (=? {:type :drill-thru/column-filter
               :initial-op {:short :=}
               :column     {:operators text-ops}}
              (colfilter fk))))))

(deftest ^:parallel structured-column-operators-test
  (testing "different structured column types get appropriate operators"
    (let [provider (lib.tu/merged-mock-metadata-provider
                    meta/metadata-provider
                    {:fields [{:id            (meta/id :products :vendor)
                               :base-type     :type/Text
                               :semantic-type :type/SerializedJSON} ; text-based JSON (base type = text)
                              {:id             (meta/id :products :category)
                               :base-type      :type/JSON ; native JSON type
                               :effective-type :type/JSON
                               :semantic-type  nil}]})
          query (lib/query provider (meta/table-metadata :products))
          columns (lib/returned-columns query)

          serialized-json-col (m/find-first #(= (:name %) "VENDOR") columns)
          native-json-col (m/find-first #(= (:name %) "CATEGORY") columns)

          get-drill-operators (fn [column]
                                (let [context {:column     column
                                               :column-ref (lib/ref column)
                                               :value      nil}
                                      drill (->> (lib/available-drill-thrus query -1 context)
                                                 (m/find-first #(= (:type %) :drill-thru/column-filter)))]
                                  (when drill
                                    (->> (:column drill)
                                         :operators
                                         (mapv :short)))))]
      (testing "SerializedJSON (string-based) gets full text operators"
        (is (= #{:= :!= :contains :does-not-contain :is-empty :not-empty :starts-with :ends-with}
               (set (get-drill-operators serialized-json-col)))))

      (testing "native JSON gets only default operators"
        (is (= #{:is-null :not-null}
               (set (get-drill-operators native-json-col))))))))

(deftest ^:parallel applies-column-filter-test-structured
  (testing "applying column-filter to structured JSON columns"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :header
      :query-type     :unaggregated
      :query-table    "PRODUCTS"
      :column-name    "VENDOR"
      :drill-type     :drill-thru/column-filter
      :expected       {:type       :drill-thru/column-filter
                       :initial-op {:short :=}
                       :column     {:lib/type :metadata/column
                                    :name "VENDOR"}}
      :drill-args     ["contains" "Acme"]
      :custom-query   (-> (lib.tu/merged-mock-metadata-provider
                           meta/metadata-provider
                           {:fields [{:id (meta/id :products :vendor)
                                      :semantic-type :type/SerializedJSON}]})
                          (lib/query (meta/table-metadata :products)))
      :expected-query {:stages
                       [{:filters
                         [[:contains {}
                           [:field {}
                            (lib.drill-thru.tu/field-key= (meta/id :products :vendor) "VENDOR")]
                           "Acme"]]}]}})))

;; TODO: Bring back this test. It doesn't work in CLJ due to the inconsistencies noted in #38558.
#_(deftest ^:parallel leaky-model-ref-test
    (testing "input `:column-ref` must be used for the drill, in case a model leaks metadata like `:join-alias` (#38034)"
      (let [query      (lib/query lib.tu/metadata-provider-with-mock-cards (:model/products-and-reviews (lib.tu/mock-cards)))
            retcols    (lib/returned-columns query)
            by-id      (m/index-by :id retcols)
            reviews-id (by-id (meta/id :reviews :id))
            _ (is (some? reviews-id))
            context    {:column reviews-id
                        :value  nil
                        :column-ref (-> reviews-id
                                        lib/ref
                                        ((fn [r] (prn r) r))
                                        (lib.options/update-options select-keys [:lib/uuid :base-type]))}
            drills     (lib/available-drill-thrus query -1 context)]
        (lib.drill-thru.tu/test-returns-drill
         {:drill-type   :drill-thru/column-filter
          :click-type   :header
          :query-type   :unaggregated
          :column-name  "ID_2"
          :custom-query query
          :expected     {:type       :drill-thru/column-filter
                         :initial-op {:short :=}
                         :column     {:lib/type :metadata/column}}}))))
