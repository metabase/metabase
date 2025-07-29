(ns metabase.lib.drill-thru.test-util
  "Adapted from frontend/src/metabase-lib/drills.unit.spec.ts"
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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

(defn- schema-or-update-fn
  [schema]
  [:or schema [:-> schema schema]])

(def ^:private Row
  [:map-of :string :any])

(def ^:private TestCase
  [:map
   [:click-type    [:enum :cell :header]]
   [:query-type    [:enum :aggregated :unaggregated]]
   [:column-name   :string]
   ;; defaults to "ORDERS"
   [:query-table   {:optional true} [:maybe [:enum "ORDERS" "PRODUCTS"]]]
   [:custom-query  {:optional true} [:maybe (schema-or-update-fn ::lib.schema/query)]]
   [:custom-native {:optional true} [:maybe (schema-or-update-fn ::lib.schema/query)]]
   [:custom-row    {:optional true} [:maybe (schema-or-update-fn Row)]]])

(def ^:private native-card-id 12)

(defn ->native
  "Wraps a given MBQL query into a dummy SQL query, backed by a card. Returns the native query."
  [mbql-query]
  (let [cols        (try
                      (->> (lib/returned-columns mbql-query)
                           (map #(-> %
                                     (assoc :lib/source :source/native)
                                     (dissoc :lib/breakout? :lib/expression-name :metabase.lib.join/join-alias))))
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

(defmulti column-by-name
  "Return the first column with :name `column-name` in `query-or-columns`.

  If `query-or-columns` is a ::lib.schema/query, then search it's `lib/returned-columns`.
  Otherwise, `query-or-columns` should be the collection of columns to search."
  {:arglists '([query-or-columns column-name])}
  (fn [query-or-columns & _] (lib.dispatch/dispatch-value query-or-columns))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defmethod column-by-name :mbql/query :- ::lib.schema.metadata/column
  [query       :- ::lib.schema/query
   column-name :- :string]
  (column-by-name (lib/returned-columns query) column-name))

(mu/defmethod column-by-name :dispatch-type/sequential :- ::lib.schema.metadata/column
  [columns     :- [:sequential ::lib.schema.metadata/column]
   column-name :- :string]
  (m/find-first #(= (:name %) column-name) columns))

(mu/defn append-filter-stage :- ::lib.schema/query
  "Append a new stage to `query` and add a filter there targeting `column-name`.

  The two-arg arity adds a simple `col > -1` filter.

  The three-arg arity will pass the first column it finds with `column-name` to `column-filter-fn`, which should
  return a boolean expression that can be passed as the second arg to [[lib/filter]]."
  ([query       :- ::lib.schema/query
    column-name :- :string]
   (append-filter-stage query column-name #(lib/> % -1)))
  ([query            :- ::lib.schema/query
    column-name      :- :string
    column-filter-fn :- [:-> ::lib.schema.metadata/column :any]]
   (let [query'           (lib/append-stage query)
         column-to-filter (column-by-name query' column-name)]
     (assert (some? column-to-filter) (str "Failed to find " column-name " in " query))
     (lib/filter query' (column-filter-fn column-to-filter)))))

(def ^:private FieldMatcherOrFilterExpr
  [:or :string fn? vector?])

(mu/defn- field-matcher-or-filter-expr->filter-expr :- vector?
  [field-matcher-or-filter-expr :- FieldMatcherOrFilterExpr]
  (let [default-filter-fn (fn [field-matcher]
                            [:> {} [:field {} field-matcher] -1])]
    (cond-> field-matcher-or-filter-expr
      (not (vector? field-matcher-or-filter-expr))
      default-filter-fn)))

(mu/defn append-filter-stage-to-test-expectation :- :map
  "Like [[append-filter-stage]] but for test expectations rather than full queries.

  If you called [[append-filter-stage]] to modify the query under tests,
  then [[append-filter-stage-to-test-expectation]] might be useful to update the test expectation.

  `expected-query` is something you'd pass to ?= to match a query. It should have a `:stages` key.

  `field-matcher-or-filter-expr` is either a vector, in which case it will be used as the filter expression directly,
  or else something that should match in a filter clause like

    [:> {} [:field {} field-matcher] -1]

  The default filter here intentionally matches the one added by [[append-filter-stage]], so that

    (append-filter-stage query my-column-name)
    (append-filter-stage-to-test-expectation expected-query my-column-name)

  are matching pairs."
  ([expected-query               :- :map
    field-matcher-or-filter-expr :- FieldMatcherOrFilterExpr]
   (assert (vector? (:stages expected-query))
           "expected-query should have a :stages key mapped to a vector")
   (let [filter-expr (field-matcher-or-filter-expr->filter-expr field-matcher-or-filter-expr)]
     (update expected-query :stages conj {:filters [filter-expr]}))))

(mu/defn prepend-filter-to-test-expectation-stage :- :map
  "Prepend `filter-expr` to the filters in `expected-query`.

  Useful for updating the `:expected-query` for [[test-drill-application]] when the `:custom-query` was modified
  by [[append-filter-stage]]."
  ([expected-query :- :map
    field-matcher-or-filter-expr :- FieldMatcherOrFilterExpr]
   (prepend-filter-to-test-expectation-stage expected-query -1 field-matcher-or-filter-expr))
  ([expected-query :- :map
    stage-number   :- :int
    field-matcher-or-filter-expr :- FieldMatcherOrFilterExpr]
   (assert (vector? (:stages expected-query))
           "expected-query should have a :stages key mapped to a vector")
   (let [filter-expr (field-matcher-or-filter-expr->filter-expr field-matcher-or-filter-expr)]
     (update-in expected-query
                [:stages (lib.util/canonical-stage-index expected-query stage-number) :filters]
                #(into [filter-expr] %)))))

(mu/defn prepend-stage-to-test-expectation
  [expected-query :- :map]
  (assert (vector? (:stages expected-query))
          "expected-query should have a :stages key mapped to a vector")
  (update expected-query :stages #(into [{}] %)))

(def ^:private unsupported-on-native
  #{:drill-thru/automatic-insights
    :drill-thru/pivot
    :drill-thru/underlying-records
    :drill-thru/zoom-in.binning
    :drill-thru/zoom-in.geographic
    :drill-thru/zoom-in.timeseries})

(defn- custom-value [custom-value-or-fn default-value]
  (if (fn? custom-value-or-fn)
    (custom-value-or-fn default-value)
    (or custom-value-or-fn default-value)))

(mu/defn query-and-row-for-test-case :- [:map
                                         [:mbql   ::lib.schema/query]
                                         [:native [:maybe ::lib.schema/query]]
                                         [:row    Row]]
  [{:keys [query-table query-type custom-query custom-native custom-row]
    :or   {query-table "ORDERS"}
    :as   test-case} :- TestCase]
  (let [mbql   (custom-value custom-query  (get-in test-queries [query-table query-type :query]))
        row    (custom-value custom-row    (get-in test-queries [query-table query-type :row]))
        native (custom-value custom-native (->native mbql))]
    (doseq [[value value-name custom-name] [[mbql "query" "custom-query"]
                                            [native "native query" "custom-native"]
                                            [row "row" "custom-row"]]]
      (when-not value
        (throw (ex-info (str "Invalid " value-name ". You either provided an invalid " custom-name ", or else the "
                             value-name " could not be looked up for the given query-table and query-type")
                        {:test-case test-case}))))
    {:mbql mbql
     :native native
     :row row}))

(mu/defn test-case-context :- ::lib.schema.drill-thru/context
  [{:keys [mbql row]} :- [:map] ;; TODO: Better type? Does one exist?
   query-kind         :- [:enum :mbql :native]
   {:keys [column-name click-type query-type], :as _test-case} :- TestCase]
  (let [cols       (cond->> (lib/returned-columns mbql -1 (lib.util/query-stage mbql -1))
                     true                   (map #(assoc % ::was-breakout-in-original-query? (:lib/breakout? %)))
                     (= query-kind :native) (map #(-> %
                                                      (assoc :lib/source :source/native)
                                                      (dissoc :lib/breakout? :lib/expression-name :metabase.lib.join/join-alias))))
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
                           :when (and (::was-breakout-in-original-query? col)
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
                          :let                [column (or (by-name column-name)
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

(defn- drop-uuids [form]
  (walk/postwalk #(cond-> % (map? %) (dissoc :lib/uuid))
                 form))

(defn- clean-expected-query [form]
  (-> form
      drop-uuids
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

(mu/defn test-drill-variants-with-merged-args
  "Run `test-fn` first with `base-case` then with each of the specified `variants`.

  `test-fn` is probably one of these functions, but could be any func that can be called with a single map argument:

    - [[test-returns-drill]]
    - [[test-drill-not-returned]]
    - [[test-drill-application]]

  `base-desc` will be passed directly to [[clojure.test/testing]].
  `base-case` will be passed unmodified to `test-fn`. It is probably a TestCase derivative, but could be any map.
  `variants` is a flat sequence of `variant-desc` `variant-case` pairs indicating variations on the base-case.

  For each `variants` pair:
    - `variant-desc` will be passed directly to [[clojure.test/testing]].
    - `variant-case` will be `merge`d with the `base-case` and the result will be passed to `test-fn`.

  If any `base-desc` or `variant-desc` is the special string \"SKIP\", then the corresponding case will be
  skipped. Useful when you want to debug one of the `variants` in isolation.

  If any `variant-case` is a fn, it should be of type map -> map and will be passed the `base-case` and the returned
  map will be merged with `base-case` instead."
  [test-fn   :- [:-> :map :any]
   base-desc :- :string
   base-case :- :map
   & variants]
  (assert (even? (count variants)) "variants must come in variant-desc and variant-case pairs")

  (when-not (= "SKIP" base-desc)
    (testing base-desc
      (test-fn base-case)))

  (doseq [[variant-desc variant-case-or-fn] (partition 2 variants)]
    (when-not (= "SKIP" variant-desc)
      (testing variant-desc
        (test-fn (merge base-case
                        (cond (fn? variant-case-or-fn) (variant-case-or-fn base-case)
                              (map? variant-case-or-fn) variant-case-or-fn
                              :else (throw (ex-info "Invalid variant case. Must be a fn or map."
                                                    {:variant-case variant-case-or-fn})))))))))
