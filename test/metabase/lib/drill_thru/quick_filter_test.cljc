(ns metabase.lib.drill-thru.quick-filter-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/quick-filter-on-bucketed-date-test]]"
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.isa :as lib.types.isa]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel quick-filter-availability-test
  (testing "quick-filter is avaiable for cell clicks on non-PK/FK columns"
    (canned/canned-test
     :drill-thru/quick-filter
     (fn [test-case {:keys [column dimensions] :as _context} {:keys [click column-kind column-type]}]
       (and (= click :cell)
            (not (:native? test-case))
            (not (#{:pk :fk} column-type))
            (not (lib.types.isa/structured? column))
            (or (not= column-kind :aggregation)
                (seq dimensions)))))))

(deftest ^:parallel returns-quick-filter-test-1
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "quick-filter on unaggregated numeric column"
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "SUBTOTAL"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}

   "quick-filter on unaggregated numeric column for multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "SUBTOTAL")}))

(deftest ^:parallel returns-quick-filter-test-2
  (testing "if the value is NULL, only = and ≠ are allowed"
    (lib.drill-thru.tu/test-drill-variants-with-merged-args
     lib.drill-thru.tu/test-returns-drill
     "single-stage query"
     {:drill-type  :drill-thru/quick-filter
      :click-type  :cell
      :query-type  :unaggregated
      :column-name "DISCOUNT"
      :expected    {:type      :drill-thru/quick-filter
                    :value     :null
                    :operators [{:name "="}
                                {:name "≠"}]}}

     "multi-stage query"
     {:custom-query #(lib.drill-thru.tu/append-filter-stage % "DISCOUNT")})))

(deftest ^:parallel returns-quick-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "CREATED_AT"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "QUANTITY"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-5
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "quick-filter on a datetime breakout column"
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "CREATED_AT"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}

   "quick-filter on a datetime breakout column for multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "count")}))

(deftest ^:parallel returns-quick-filter-test-6
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "quick-filter on an aggregated count column"
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "count"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}

   "quick-filter on an aggregated count column for multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "count")}))

(deftest ^:parallel returns-quick-filter-test-7
  (lib.drill-thru.tu/test-drill-variants-with-merged-args
   lib.drill-thru.tu/test-returns-drill
   "quick-filter on an aggregated sum column"
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "sum"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}

   "quick-filter on an aggregated sum column for multi-stage query"
   {:custom-query #(lib.drill-thru.tu/append-filter-stage % "sum")}))

(deftest ^:parallel returns-quick-filter-test-8
  (testing "quick-filter should not return < or > for cell with no value (#34445)"
    (lib.drill-thru.tu/test-drill-variants-with-merged-args
     lib.drill-thru.tu/test-returns-drill
     "single-stage query"
     {:drill-type  :drill-thru/quick-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type      :drill-thru/quick-filter
                    :value     :null
                    :operators [{:name "="}
                                {:name "≠"}]}}

     "multi-stage query"
     {:custom-query #(lib.drill-thru.tu/append-filter-stage % "max")})))

(deftest ^:parallel returns-quick-filter-test-9
  (testing "quick-filter should return = and ≠ only for other field types (eg. generic strings)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/quick-filter
      :click-type  :cell
      :query-type  :unaggregated
      :query-table "PRODUCTS"
      :column-name "TITLE"
      :expected    {:type      :drill-thru/quick-filter
                    :value     (get-in lib.drill-thru.tu/test-queries ["PRODUCTS" :unaggregated :row "TITLE"])
                    :operators [{:name "="}
                                {:name "≠"}]}})))

(deftest ^:parallel returns-quick-filter-test-10
  (testing "quick-filter should use is-empty and not-empty operators for string columns (#41783)"
    (let [field-key (lib.drill-thru.tu/field-key= "TITLE" (meta/id :products :title))]
      (lib.drill-thru.tu/test-returns-drill
       {:drill-type  :drill-thru/quick-filter
        :click-type  :cell
        :query-type  :unaggregated
        :query-table "PRODUCTS"
        :column-name "TITLE"
        :custom-row  (assoc (get-in lib.drill-thru.tu/test-queries ["PRODUCTS" :unaggregated :row])
                            "TITLE" nil)
        :expected    {:type      :drill-thru/quick-filter
                      :value     :null
                      :operators [{:name "=", :filter [:is-empty {} [:field {} field-key]]}
                                  {:name "≠", :filter [:not-empty {} [:field {} field-key]]}]}}))))

(deftest ^:parallel apply-quick-filter-on-correct-level-test
  (testing "quick-filter on an aggregation should introduce an new stage (#34346)"
    (testing "native query"
      (lib.drill-thru.tu/test-drill-variants-with-merged-args
       lib.drill-thru.tu/test-drill-application
       "single-stage query"
       {:click-type     :cell
        :query-type     :aggregated
        :query-kinds    [:mbql]
        :column-name    "sum"
        :drill-type     :drill-thru/quick-filter
        :expected       {:type         :drill-thru/quick-filter
                         :operators    [{:name "<"}
                                        {:name ">"}
                                        {:name "="}
                                        {:name "≠"}]
                         :query        {:stages [{} {}]}
                         :stage-number -1
                         :value        1}
        :drill-args     ["="]
        :expected-query {:stages [{}
                                  {:filters [[:= {}
                                              [:field {} "sum"]
                                              (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "sum"])]]}]}}

       "multi-stage query"
       (fn [base-case]
         {:custom-query #(lib.drill-thru.tu/append-filter-stage % "sum")
          :expected-query (lib.drill-thru.tu/prepend-filter-to-stage
                           (:expected-query base-case)
                           -1
                           [:> {} [:field {} "sum"] -1])})))))

(deftest ^:parallel apply-quick-filter-on-correct-level-test-2
  (testing "quick-filter on a breakout should not introduce a new stage"
    (lib.drill-thru.tu/test-drill-variants-with-merged-args
     lib.drill-thru.tu/test-drill-application
     "single-stage query"
     {:click-type     :cell
      :query-type     :aggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type         :drill-thru/quick-filter
                       :operators    [{:name "<"}
                                      {:name ">"}
                                      {:name "="}
                                      {:name "≠"}]
                       :query        {:stages [{}]}
                       :stage-number -1
                       :value        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])}
      :drill-args     ["<"]
      :expected-query {:stages [{:filters [[:< {}
                                            [:field {} (lib.drill-thru.tu/field-key= (meta/id :orders :created-at)
                                                                                     "CREATED_AT")]
                                            (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])]]}]}}

     "multi-stage query"
     (fn [base-case]
       {:query-kinds    [:mbql]
        :custom-query   #(lib.drill-thru.tu/append-filter-stage % "sum")
        ;; the extra stage is added by append-filter-stage, not by the quick-filter
        :expected       (update-in (:expected base-case) [:query :stages] conj {})
        :expected-query (lib.drill-thru.tu/prepend-filter-to-stage
                         (update (:expected-query base-case) :stages #(into [{}] %))
                         -1
                         [:> {} [:field {} "sum"] -1])}))))

(deftest ^:parallel apply-quick-filter-on-correct-level-test-3
  (testing "quick-filter on an aggregation should introduce an new stage (#34346)"
    (lib.drill-thru.tu/test-drill-variants-with-merged-args
     lib.drill-thru.tu/test-drill-application
     "single-stage query: new stage is added"
     {:click-type     :cell
      :query-type     :aggregated
      :query-kinds    [:mbql]
      :column-name    "max"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type         :drill-thru/quick-filter
                       :operators    [{:name "=", :filter [:is-null {} [:field {} "max"]]}
                                      {:name "≠", :filter [:not-null {} [:field {} "max"]]}]
                       :query        {:stages [{} {}]}
                       :stage-number -1
                       :value        :null}
      :drill-args     ["≠"]
      :expected-query {:stages [{}
                                {:filters [[:not-null {} [:field {} "max"]]]}]}}

     "multi-stage query: no new stage added"
     (fn [base-case]
       {:custom-query   #(lib.drill-thru.tu/append-filter-stage % "max")
        :expected-query (lib.drill-thru.tu/prepend-filter-to-stage
                         (:expected-query base-case)
                         -1
                         [:> {} [:field {} "max"] -1])}))))

(deftest ^:parallel contains-does-not-contain-test
  (testing "Should return :contains/:does-not-contain for text columns (#33560)"
    (let [query   (lib/query meta/metadata-provider (meta/table-metadata :reviews))
          context {:column     (meta/field-metadata :reviews :body)
                   :column-ref (lib/ref (meta/field-metadata :reviews :body))
                   :value      "text"
                   :row        [{:column     (meta/field-metadata :reviews :body),
                                 :column-ref (lib/ref (meta/field-metadata :reviews :body))
                                 :value      "text"}]}
          drill   (m/find-first #(= (:type %) :drill-thru/quick-filter)
                                (lib/available-drill-thrus query -1 context))]
      (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru
               :type      :drill-thru/quick-filter
               :operators [{:name "contains"}
                           {:name "does-not-contain"}]
               :value     "text"
               :column    {:name "BODY"}}
              drill))
      (testing "Should include :value in the display info (#33560)"
        (is (=? {:type      :drill-thru/quick-filter
                 :operators ["contains" "does-not-contain"]
                 :value     "text"}
                (lib/display-info query drill))))
      (testing "apply drills"
        (testing :contains
          (is (=? {:stages [{:filters [[:contains {} [:field {} (meta/id :reviews :body)] "text"]]}]}
                  (lib/drill-thru query -1 nil drill "contains"))))
        (testing :does-not-contain
          (is (=? {:stages [{:filters [[:does-not-contain {} [:field {} (meta/id :reviews :body)] "text"]]}]}
                  (lib/drill-thru query -1 nil drill "does-not-contain"))))))))
