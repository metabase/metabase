(ns metabase.lib.drill-thru.test-util
  "Adapted from frontend/src/metabase-lib/drills.unit.spec.ts"
  (:require
   [clojure.test :refer [is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def test-queries
  {"ORDERS"
   {:unaggregated
    {:query (lib/query meta/metadata-provider (meta/table-metadata :orders))
     :row   {"ID"         "3"
             "USER_ID"    "1"
             "PRODUCT_ID" "105"
             "SUBTOTAL"   52.723521442619514
             "TAX"        2.9
             "TOTAL"      49.206842233769756
             "DISCOUNT"   nil
             "CREATED_AT" "2025-12-06T22:22:48.544+02:00"
             "QUANTITY"   2}}

    :aggregated
    {:query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                (lib/aggregate (lib/count))
                (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
                (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
                (lib/breakout (meta/field-metadata :orders :product-id))
                (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                  (lib/with-temporal-bucket :month))))
     :row   {"PRODUCT_ID" 3
             "CREATED_AT" "2022-12-01T00:00:00+02:00"
             "count"      77
             "sum"        1
             "max"        nil}}}

   "PRODUCTS"
   {:unaggregated
    {:query (lib/query meta/metadata-provider (meta/table-metadata :products))
     :row   {"ID"         "3"
             "EAN"        "4966277046676"
             "TITLE"      "Synergistic Granite Chair"
             "CATEGORY"   "Doohickey"
             "VENDOR"     "Murray, Watsica and Wunsch"
             "PRICE"      35.38
             "RATING"     4
             "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}}
    :aggregated
    {:query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                (lib/aggregate (lib/count)))
     :row   {"count" 200}}}})

(def ^:private Row
  [:map-of :string :any])

(def ^:private TestCase
  [:map
   [:click-type      [:enum :cell :header]]
   [:query-type      [:enum :aggregated :unaggregated]]
   [:column-name     :string]
   ;; defaults to "ORDERS"
   [:query-table  {:optional true} [:maybe [:enum "ORDERS" "PRODUCTS"]]]
   [:custom-query {:optional true} [:maybe ::lib.schema/query]]
   [:custom-row   {:optional true} [:maybe Row]]])

(mu/defn query-and-row-for-test-case :- [:map
                                         [:query ::lib.schema/query]
                                         [:row   Row]]
  [{:keys [query-table query-type custom-query custom-row]
    :or   {query-table "ORDERS"}
    :as   test-case} :- TestCase]
  {:query (or custom-query
              (get-in test-queries [query-table query-type :query])
              (throw (ex-info "Invalid query-table/query-:type no matching test query" {:test-case test-case})))
   :row   (or custom-row
              (get-in test-queries [query-table query-type :row])
              (throw (ex-info "Invalid query-table/query-:type no matching test query" {:test-case test-case})))})

(mu/defn test-case-context :- ::lib.schema.drill-thru/context
  [query     :- ::lib.schema/query
   row       :- Row
   {:keys [column-name click-type query-type], :as _test-case} :- TestCase]
  (let [cols       (lib/returned-columns query -1 (lib.util/query-stage query -1))
        by-name    (m/index-by :name cols)
        col        (get by-name column-name)
        refs       (update-vals by-name lib/ref)
        _          (assert col (lib.util/format "No column found named %s; found: %s"
                                                (pr-str column-name)
                                                (pr-str (map :name cols))))
        value      (let [v (get row column-name ::not-found)]
                     (when-not (= v ::not-found)
                       (if (some? v) v :null)))
        dimensions (when (= query-type :aggregated)
                     (for [col   cols
                           :when (and (= (:lib/source col) :source/breakouts)
                                      (not= (:name col) column-name))]
                       {:column     col
                        :column-ref (get refs (:name col))
                        :value      (get row (:name col))}))]
    (merge
     {:column     col
      :column-ref (get refs column-name)
      :value      nil}
     (when (= click-type :cell)
       {:value      value
        :row        (for [[column-name value] row
                          :let [column (or (by-name column-name)
                                           (throw (ex-info
                                                   (lib.util/format "Invalid row: no column named %s in query returned-columns"
                                                                    (pr-str column-name))
                                                   {:column-name column-name, :returned-columns (keys by-name)})))]]
                      {:column     column
                       :column-ref (get refs column-name)
                       :value      value})
        :dimensions dimensions}))))

(def ^:private AvailableDrillsTestCase
  [:merge
   TestCase
   [:map
    [:expected [:sequential [:map
                             [:type ::lib.schema.drill-thru/drill-thru.type]]]]]])

(mu/defn test-available-drill-thrus
  [{:keys [column-name click-type query-type query-table expected]
    :or   {query-table "ORDERS"}
    :as   test-case} :- AvailableDrillsTestCase]
  (testing (lib.util/format "should return correct drills for %s.%s %s in %s query"
                            query-table column-name (name click-type) (name query-type))
    (let [{:keys [query row]} (query-and-row-for-test-case test-case)
          context             (test-case-context query row test-case)]
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (is (=? expected
                (lib/available-drill-thrus query -1 context)))))))

(def ^:private TestCaseWithDrillType
  [:merge
   TestCase
   [:map
    [:drill-type ::lib.schema.drill-thru/drill-thru.type]]])

(def ^:private ReturnsDrillTestCase
  [:merge
   TestCaseWithDrillType
   [:map
    [:expected [:map
                [:type ::lib.schema.drill-thru/drill-thru.type]]]]])

(mu/defn test-returns-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Test that a certain drill gets returned. Returns the drill."
  [{:keys [drill-type query-table column-name click-type query-type expected]
    :or   {query-table "ORDERS"}
    :as   test-case} :- ReturnsDrillTestCase]
  (let [{:keys [query row]} (query-and-row-for-test-case test-case)
        context             (test-case-context query row test-case)]
    (testing (str (lib.util/format "should return %s drill for %s.%s %s in %s query"
                                   drill-type
                                   query-table
                                   column-name
                                   (name click-type)
                                   (name query-type))
                  "\nQuery =\n"   (u/pprint-to-str query)
                  "\nContext =\n" (u/pprint-to-str context))
      (let [drills (lib/available-drill-thrus query -1 context)]
        (testing (str "\nAvailable Drills =\n" (u/pprint-to-str (into #{} (map :type) drills)))
          (let [drill (m/find-first (fn [drill]
                                      (= (:type drill) drill-type))
                                    drills)]
            (is (=? expected
                    drill))
            drill))))))

(mu/defn test-drill-not-returned
  "Test that a drill is NOT returned in a certain situation."
  [{:keys [drill-type query-table column-name click-type query-type]
    :or   {query-table "ORDERS"}
    :as   test-case} :- TestCaseWithDrillType]
  (let [{:keys [query row]} (query-and-row-for-test-case test-case)
        context             (test-case-context query row test-case)]
    (testing (str (lib.util/format "should NOT return %s drill for %s.%s %s in %s query"
                                   drill-type
                                   query-table
                                   column-name
                                   (name click-type)
                                   (name query-type))
                  "\nQuery = \n"  (u/pprint-to-str query)
                  "\nRow = \n"    (u/pprint-to-str row)
                  "\nContext =\n" (u/pprint-to-str context))
      (let [drills (into #{}
                         (map :type)
                         (lib/available-drill-thrus query context))]
        (testing (str "\nAvailable drills =\n" (u/pprint-to-str drills))
          (is (not (contains? drills drill-type))))))))

(def ^:private DrillApplicationTestCase
  [:merge
   ReturnsDrillTestCase
   [:map
    [:expected-query :map]
    [:drill-args {:optional true} [:maybe [:sequential :any]]]]])

(defn- drop-uuids [form]
  (walk/postwalk #(cond-> % (map? %) (dissoc :lib/uuid))
                 form))

(mu/defn test-drill-application
  "Test that a certain drill gets returned, AND when applied to a query returns the expected query."
  [{:keys [expected-query drill-args], :as test-case} :- DrillApplicationTestCase]
  (let [{:keys [query]} (query-and-row-for-test-case test-case)]
    (when-let [drill (test-returns-drill test-case)]
      (testing (str "Should return expected query when applying the drill"
                    "\nQuery = \n" (u/pprint-to-str query)
                    "\nDrill = \n" (u/pprint-to-str drill))
        (let [query' (apply lib/drill-thru query -1 drill drill-args)]
          (is (=? (drop-uuids expected-query)
                  query')))))))
