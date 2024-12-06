(ns metabase.lib.drill-thru.test-util
  "Adapted from frontend/src/metabase-lib/drills.unit.spec.ts"
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

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

(def ^:private native-card-id 12)

(defn ->native
  "Wraps a given MBQL query into a dummy SQL query, backed by a card. Returns the native query."
  [mbql-query]
  (let [cols        (try
                      (->> (lib/returned-columns mbql-query)
                           (map #(assoc % :lib/source :source/native)))
                      (catch #?(:clj clojure.lang.ExceptionInfo :cljs js/Error) e
                        ;; Not all the input queries passed to this are real. Some of them are skeletons used
                        ;; as test expectations. If we fail to generate the returned columns, just return nil.
                        ;; We don't care about retrieving the columns from a test expectation.
                        (if (-> e ex-data :type #{:metabase.util.malli.fn/invalid-input})
                          nil ; Return a blank column list if we failed to validate.
                          (throw e))))
        original-mp (lib.metadata/->metadata-provider mbql-query)
        base        (lib/native-query original-mp "dummy SQL query")
        new-mp      (lib.tu/metadata-provider-with-card-from-query
                     original-mp native-card-id base
                     {:result-metadata cols})]
    (lib/native-query new-mp "dummy SQL query")))

(defn ->native-wrapped
  "Wraps a given MBQL query into a dummy SQL query, backed by a card. Returns an MBQL query using that card
  as its source."
  [mbql-query]
  (let [native (->native mbql-query)
        mp     (lib.metadata/->metadata-provider native)
        card   (lib.metadata/card mp native-card-id)]
    (lib/query mp card)))

(defn field-key=
  "Given some possible field keys (column names or IDs), returns a function that tries to match its input against
  each of them, returning the one that matched.

  This is intended to be used in `=?` expectations as a matcher function."
  [& exps]
  (fn [x]
    (some #(= x %) exps)))

(def ^:private unsupported-on-native
  #{:drill-thru/automatic-insights
    :drill-thru/pivot
    :drill-thru/underlying-records
    :drill-thru/zoom-in.binning
    :drill-thru/zoom-in.geographic
    :drill-thru/zoom-in.timeseries})

(mu/defn query-and-row-for-test-case :- [:map
                                         [:mbql   ::lib.schema/query]
                                         [:native [:maybe ::lib.schema/query]]
                                         [:row    Row]]
  [{:keys [query-table query-type custom-query custom-native custom-row]
    :or   {query-table "ORDERS"}
    :as   test-case} :- TestCase]
  (let [queries (if custom-query
                  {:mbql   custom-query
                   :native (or custom-native (->native custom-query))}
                  (when-let [mbql (get-in test-queries [query-table query-type :query])]
                    {:mbql   mbql
                     :native (->native mbql)}))
        row     (or custom-row (get-in test-queries [query-table query-type :row]))]
    (when-not (and queries row)
      (throw (ex-info "Invalid query-table/query-:type no matching test query" {:test-case test-case})))
    (assoc queries :row row)))

(mu/defn test-case-context :- ::lib.schema.drill-thru/context
  [{:keys [mbql row]} :- [:map] ;; TODO: Better type? Does one exist?
   query-kind         :- [:enum :mbql :native]
   {:keys [column-name click-type query-type], :as _test-case} :- TestCase]
  (let [cols       (cond->> (lib/returned-columns mbql -1 (lib.util/query-stage mbql -1))
                     true                   (map #(assoc % :lib/original-source (:lib/source %)))
                     (= query-kind :native) (map #(assoc % :lib/source :source/native)))
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
                           :when (and (= (:lib/original-source col) :source/breakouts)
                                      (not= (:name col) column-name))]
                       {:column     col
                        :column-ref (get refs (:name col))
                        :value      (get row (:name col))}))]
    (merge
     {:column     col
      :column-ref (get refs column-name)
      :value      nil}
     (when (= query-kind :native)
       {:card-id native-card-id})
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
    [:expected [:or [:-> [:sequential [:map
                                       [:type ::lib.schema.drill-thru/drill-thru.type]]]
                     :boolean]
                [:sequential [:map
                              [:type ::lib.schema.drill-thru/drill-thru.type]]]]]]])

(mu/defn test-available-drill-thrus
  [{:keys [column-name click-type query-type query-table query-kinds expected native-drills]
    :or   {query-table     "ORDERS"
           query-kinds     [:mbql :native]
           ;; By default, skip these drills for native queries - these drills never work for native.
           native-drills   (complement unsupported-on-native)}
    :as   test-case} :- AvailableDrillsTestCase]
  (doseq [query-kind query-kinds]
    (testing (lib.util/format "should return correct drills for %s.%s %s in %s %s query"
                              query-table column-name (name click-type) (name query-type) (name query-kind))
      (let [selected (query-and-row-for-test-case test-case)
            query    (get selected query-kind)
            context  (test-case-context selected query-kind test-case)]
        (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                      "\nContext =\n" (u/pprint-to-str context))
          (is (=? (cond->> expected
                    (and (sequential? expected)
                         (= query-kind :native)) (filterv (comp native-drills :type)))
                  (lib/available-drill-thrus query -1 context))))))))

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

(defn- drop-uuids-and-idents [form]
  (walk/postwalk #(cond-> % (map? %) (dissoc :lib/uuid :ident))
                 form))

(defn- clean-expected-query [form]
  (-> form
      drop-uuids-and-idents
      (dissoc :lib/metadata)))

(defn- clean-expected-query-on-drill [form query-kind]
  (cond-> form
    (and (:lib/metadata form)
         (= query-kind :native)) ->native-wrapped
    true                         clean-expected-query))

(mu/defn test-returns-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Test that a certain drill gets returned. Returns the drill."
  [{:keys [drill-type query-table column-name click-type query-type query-kinds expected drill-query-native]
    :or   {query-table "ORDERS"}
    :as   test-case} :- ReturnsDrillTestCase]
  (last
   (for [query-kind (or query-kinds
                        (cond-> [:mbql]
                          (not (unsupported-on-native drill-type)) (conj :native)))]
     (let [selected (query-and-row-for-test-case test-case)
           query    (get selected query-kind)
           context  (test-case-context selected query-kind test-case)]
       (testing (str (lib.util/format "should return %s drill for %s.%s %s in %s %s query"
                                      drill-type
                                      query-table
                                      column-name
                                      (name click-type)
                                      (name query-type)
                                      (name query-kind))
                     "\nQuery =\n"   (u/pprint-to-str query)
                     "\nContext =\n" (u/pprint-to-str context))
         (let [drills (lib/available-drill-thrus query -1 context)]
           (testing (str "\nAvailable Drills =\n" (u/pprint-to-str (into #{} (map :type) drills)))
             (let [drill (m/find-first (fn [drill]
                                         (= (:type drill) drill-type))
                                       drills)]
               (is (=? (or (and (= query-kind :native)
                                (:query expected)
                                drill-query-native
                                (assoc expected :query (clean-expected-query drill-query-native)))
                           (m/update-existing expected :query clean-expected-query-on-drill query-kind))
                       drill))
               drill))))))))

(mu/defn test-drill-not-returned
  "Test that a drill is NOT returned in a certain situation."
  [{:keys [drill-type query-table column-name click-type query-type query-kinds]
    :or   {query-table "ORDERS"
           query-kinds [:mbql :native]}
    :as   test-case} :- TestCaseWithDrillType]
  (doseq [query-kind query-kinds]
    (let [selected (query-and-row-for-test-case test-case)
          query    (get selected query-kind)
          context  (test-case-context selected query-kind test-case)]
      (testing (str (lib.util/format "should NOT return %s drill for %s.%s %s in %s %s query"
                                     drill-type
                                     query-table
                                     column-name
                                     (name click-type)
                                     (name query-type)
                                     (name query-kind))
                    "\nQuery = \n"  (u/pprint-to-str query)
                    "\nRow = \n"    (u/pprint-to-str (:row selected))
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drills (into #{}
                           (map :type)
                           (lib/available-drill-thrus query context))]
          (testing (str "\nAvailable drills =\n" (u/pprint-to-str drills))
            (is (not (contains? drills drill-type)))))))))

(def ^:private DrillApplicationTestCase
  [:merge
   ReturnsDrillTestCase
   [:map
    [:expected-query :map]
    [:drill-args {:optional true} [:maybe [:sequential :any]]]]])

(mu/defn test-drill-application
  "Test that a certain drill gets returned, AND when applied to a query returns the expected query."
  [{:keys [drill-type expected-query expected-native drill-args query-kinds]
    :as test-case} :- DrillApplicationTestCase]
  (let [selected (query-and-row-for-test-case test-case)]
    (doseq [query-kind (or query-kinds
                           (cond-> [:mbql]
                             (not (unsupported-on-native drill-type)) (conj :native)))
            :let [query (get selected query-kind)]]
      (when-let [drill (test-returns-drill (assoc test-case :query-kinds [query-kind]))]
        (testing (str "Should return expected " (name query-kind) " query when applying the drill"
                      "\nQuery = \n" (u/pprint-to-str query)
                      "\nDrill = \n" (u/pprint-to-str drill))
          (let [query' (apply lib/drill-thru query -1
                              (when (= query-kind :native)
                                native-card-id)
                              drill drill-args)]
            (is (=? (or (when (= query-kind :native)
                          expected-native)
                        (clean-expected-query expected-query))
                    query'))))))))
