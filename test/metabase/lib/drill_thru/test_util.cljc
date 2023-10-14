(ns metabase.lib.drill-thru.test-util
  "Adapted from frontend/src/metabase-lib/drills.unit.spec.ts"
  (:require
   [clojure.test :refer [is testing]]
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
             "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}}}})

(def ^:private TestCase
  [:map
   [:click-type      [:enum :cell :header]]
   [:query-type      [:enum :aggregated :unaggregated]]
   [:column-name     :string]
   ;; defaults to "ORDERS"
   [:query-table  {:optional true} [:enum "ORDERS" #_"PRODUCTS"]]
   [:custom-query {:optional true} ::lib.schema/query]])

(def ^:private Row
  [:map-of :string :any])

(mu/defn ^:private query-and-row-for-test-case :- [:map
                                                   [:query ::lib.schema/query]
                                                   [:row   Row]]
  [{:keys [query-table query-type]
    :or   {query-table "ORDERS"}
    :as   test-case} :- TestCase]
  (or (get-in test-queries [query-table query-type])
      (throw (ex-info "Invalid query-table/query-:type no matching test query" {:test-case test-case}))))

(mu/defn ^:private test-case-context :- ::lib.schema.drill-thru/context
  [query     :- ::lib.schema/query
   row       :- Row
   {:keys [column-name click-type query-type], :as _test-case} :- TestCase]
  (let [cols       (lib/returned-columns query -1 (lib.util/query-stage query -1))
        col        (m/find-first (fn [col]
                                   (= (:name col) column-name))
                                 cols)
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
                       {:column-name (:name col), :value (get row (:name col))}))]
    (merge
     {:column col
      :value  nil}
     (when (= click-type :cell)
       {:value      value
        :row        (for [[column-name value] row]
                      {:column-name column-name, :value value})
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

(def ^:private ReturnsDrillTestCase
  [:merge
   TestCase
   [:map
    [:drill-type ::lib.schema.drill-thru/drill-thru.type]
    [:expected   [:map
                  [:type ::lib.schema.drill-thru/drill-thru.type]]]]])

(mu/defn test-returns-drill
  "Test that a certain drill gets returned."
  [{:keys [drill-type query-table column-name click-type query-type custom-query expected]
    :or   {query-table "ORDERS"}
    :as   test-case} :- ReturnsDrillTestCase]
  (testing (lib.util/format "should return %s drill config for %s.%s %s in %s query"
                            drill-type
                            query-table
                            column-name
                            (name click-type)
                            (name query-type))
    (let [{:keys [query row]} (query-and-row-for-test-case test-case)
          query               (or custom-query query)
          context             (test-case-context query row test-case)]
      (testing (str "\nQuery =\n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drills (lib/available-drill-thrus query -1 context)]
          (testing (str "\nAvailable Drills =\n" (u/pprint-to-str (into #{} (map :type) drills)))
            (is (=? expected
                    (m/find-first (fn [drill]
                                    (= (:type drill) drill-type))
                                  drills)))))))))
