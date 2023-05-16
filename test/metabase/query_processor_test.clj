(ns metabase.query-processor-test
  "Helper functions for various query processor tests. The tests themselves can be found in various
  `metabase.query-processor-test.*` namespaces; there are so many that it is no longer feasible to keep them all in
  this one. Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hawk.init]
   [metabase.db.connection :as mdb.connection]
   [metabase.driver :as driver]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-joins
    :as qp.add-implicit-joins]
   [metabase.test.data :as data]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [schema.core :as s]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Helper Fns + Macros -----------------------------------------------

;; Non-"normal" drivers are tested in [[metabase.timeseries-query-processor-test]] and elsewhere
(def ^:private abnormal-drivers
  "Drivers that are so weird that we can't run the normal driver tests against them."
  #{:druid :googleanalytics})

(defn normal-drivers
  "Drivers that are reasonably normal in the sense that they can participate in the shared driver tests."
  []
  (set/difference (tx.env/test-drivers) abnormal-drivers))

(defn normal-drivers-with-feature
  "Set of drivers that support a given `feature`. If additional features are given, it will ensure all features are
  supported."
  [feature & more-features]
  {:pre [(every? keyword? (cons feature more-features))]}
  ;; Can't use [[normal-drivers-with-feature]] during test initialization, because it means we end up having to load
  ;; plugins and a bunch of other nonsense.
  (hawk.init/assert-tests-are-not-initializing (pr-str (list* 'normal-drivers-with-feature feature more-features)))
  (let [features (set (cons feature more-features))]
    (set (for [driver (normal-drivers)
               :let   [driver (tx/the-driver-with-test-extensions driver)]
               :when  (driver/with-driver driver
                        (let [db (data/db)]
                          (every? #(driver/database-supports? driver % db) features)))]
           driver))))

(alter-meta! #'normal-drivers-with-feature assoc :arglists (list (into ['&] (sort driver/driver-features))))

(defn normal-drivers-without-feature
  "Return a set of all non-timeseries engines (e.g., everything except Druid and Google Analytics) that DO NOT support
  `feature`."
  [feature]
  (set/difference (normal-drivers) (normal-drivers-with-feature feature)))

(alter-meta! #'normal-drivers-without-feature assoc :arglists (list (into ['&] (sort driver/driver-features))))

(defn normal-drivers-except
  "Return the set of all drivers except Druid, Google Analytics, and those in `excluded-drivers`."
  [excluded-drivers]
  (set/difference (normal-drivers) (set excluded-drivers)))

;; Predefinied Column Fns: These are meant for inclusion in the expected output of the QP tests, to save us from
;; writing the same results several times

(defn- col-defaults []
  {:description     nil
   :visibility_type :normal
   :settings        nil
   :nfc_path        nil
   :parent_id       nil
   :source          :fields})

(defn col
  "Get a Field as it would appear in the Query Processor results in `:cols`.

    (qp.test/col :venues :id)"
  [table-kw field-kw]
  (merge
   (col-defaults)
   (t2/select-one [Field :id :table_id :semantic_type :base_type :effective_type
                   :coercion_strategy :name :display_name :fingerprint]
     :id (data/id table-kw field-kw))
   {:field_ref [:field (data/id table-kw field-kw) nil]}
   (when (#{:last_login :date} field-kw)
     {:unit      :default
      :field_ref [:field (data/id table-kw field-kw) {:temporal-unit :default}]})))

(defn- expected-column-names
  "Get a sequence of keyword names of Fields belonging to a Table in the order they'd normally appear in QP results."
  [table-kw]
  (case table-kw
    :categories [:id :name]
    :checkins   [:id :date :user_id :venue_id]
    :users      [:id :name :last_login]
    :venues     [:id :name :category_id :latitude :longitude :price]
    (throw (IllegalArgumentException. (format "Sorry, we don't know the default columns for Table %s." table-kw)))))

(defn expected-cols
  "Get a sequence of Fields belonging to a Table as they would appear in the Query Processor results in `:cols`. The
  second arg, `cols`, is optional; if not supplied, this function will return all columns for that Table in the
  default order.

    ;; all columns in default order
    (qp.test/cols :users)

    ;; users.id, users.name, and users.last_login
    (qp.test/cols :users [:id :name :last_login])"
  ([table-kw]
   (expected-cols table-kw (expected-column-names table-kw)))

  ([table-kw cols]
   (mapv (partial col table-kw) cols)))

(defn- backfill-effective-type [{:keys [base_type effective_type] :as col}]
  (cond-> col
    (and (nil? effective_type) base_type) (assoc :effective_type base_type)))

(defn aggregate-col
  "Return the column information we'd expect for an aggregate column. For all columns besides `:count`, you'll need to
  pass the `Field` in question as well.

    (aggregate-col :count)
    (aggregate-col :avg (col :venues :id))
    (aggregate-col :avg :venues :id)"
  ([ag-type]
   (backfill-effective-type
    (tx/aggregate-column-info (tx/driver) ag-type)))

  ([ag-type field]
   (backfill-effective-type
    (tx/aggregate-column-info (tx/driver) ag-type field)))

  ([ag-type table-kw field-kw]
   (backfill-effective-type
    (tx/aggregate-column-info (tx/driver) ag-type (col table-kw field-kw)))))

(defn breakout-col
  "Return expected `:cols` info for a Field used as a breakout.

    (breakout-col :venues :price)"
  ([col]
   (assoc col :source :breakout))

  ([table-kw field-kw]
   (breakout-col (col table-kw field-kw))))

(defn field-literal-col
  "Return expected `:cols` info for a Field that was referred to as a `:field-literal`.

    (field-literal-col :venues :price)
    (field-literal-col (aggregate-col :count))"
  {:arglists '([col] [table-kw field-kw])}
  ([{field-name :name, base-type :base_type, :as col}]
   (-> col
       (assoc :field_ref [:field field-name {:base-type base-type}]
              :source    :fields)
       (dissoc :description :parent_id :visibility_type)))

  ([table-kw field-kw]
   (field-literal-col (col table-kw field-kw))))

(defn fk-col
  "Return expected `:cols` info for a Field that came in via an implicit join (i.e, via an `fk->` clause)."
  [source-table-kw source-field-kw, dest-table-kw dest-field-kw]
  (let [source-col (col source-table-kw source-field-kw)
        dest-col   (col dest-table-kw dest-field-kw)]
    (-> dest-col
        (update :display_name (partial format "%s → %s" (str/replace (:display_name source-col) #"(?i)\sid$" "")))
        (assoc :field_ref    [:field (:id dest-col) {:source-field (:id source-col)}]
               :fk_field_id  (:id source-col)
               :source_alias (#'qp.add-implicit-joins/join-alias (t2/select-one-fn :name Table :id (data/id dest-table-kw))
                                                                 (:name source-col))))))

(declare cols)

(def ^:private ^{:arglists '([db-id table-id field-id])} native-query-col*
  (mdb.connection/memoize-for-application-db
   (fn [db-id table-id field-id]
     (first
      (cols
       (qp/process-query
         {:database db-id
          :type     :native
          :native   (qp/compile
                      {:database db-id
                       :type     :query
                       :query    {:source-table table-id
                                  :fields       [[:field field-id nil]]
                                  :limit        1}})}))))))

(defn native-query-col
  "Return expected `:cols` info for a Field from a native query or native source query."
  [table-kw field-kw]
  (native-query-col* (data/id) (data/id table-kw) (data/id table-kw field-kw)))

(defmulti format-rows-fns
  "Return vector of functions (or floating-point numbers, for rounding; see `format-rows-by`) to use to format result
  rows with `format-rows-by` or `formatted-rows`. The first arg to these macros is converted to a sequence of
  functions by calling this function.

  Sequential args are assumed to already be a sequence of functions and are returned as-is. Keywords can be thought of
  as aliases and map to a pre-defined sequence of functions. The usual test data tables have predefined fn sequences;
  you can add addition ones for use locally by adding more implementations for this method.

    (format-rows-fns [int identity]) ;-> [int identity]
    (format-rows-fns :venues)        ;-> [int identity int 4.0 4.0 int]"
  {:arglists '([keyword-or-fns-seq])}
  (fn [x]
    (if (keyword? x) x (class x))))

(defmethod format-rows-fns clojure.lang.Sequential
  [this]
  this)

(defmethod format-rows-fns :categories
  [_]
  ;; ID NAME
  [int identity])

(defmethod format-rows-fns :checkins
  [_]
  ;; ID DATE USER_ID VENUE_ID
  [int identity int int])

(defmethod format-rows-fns :users
  [_]
  ;; ID NAME LAST_LOGIN
  [int identity identity])

(defmethod format-rows-fns :venues
  [_]
  ;; ID NAME CATEGORY_ID LATITUDE LONGITUDE PRICE
  [int identity int 4.0 4.0 int])

(defn- format-rows-fn
  "Handle a value formatting function passed to `format-rows-by`."
  [x]
  (if (float? x)
    (partial u/round-to-decimals (int x))
    x))

(defn format-rows-by
  "Format the values in result `rows` with the fns at the corresponding indecies in `format-fns`. `rows` can be a
  sequence or any of the common map formats we expect in QP tests.

    (format-rows-by [int str double] [[1 1 1]]) -> [[1 \"1\" 1.0]]

  `format-fns` can be a sequence of functions, or may be the name of one of the 'big four' test data Tables to use
  their defaults:

    (format-rows-by :venues (data/run-mbql-query :venues))

  Additionally, you may specify an floating-point number in the rounding functions vector as shorthand for formatting
  with `u/round-to-decimals`:

    (format-rows-by [identity 4.0] ...) ;-> (format-rows-by [identity (partial u/round-to-decimals 4)] ...)

  By default, does't call fns on `nil` values; pass a truthy value as optional param `format-nil-values`? to override
  this behavior."
  {:style/indent 1}
  ([format-fns response]
   (format-rows-by format-fns false response))

  ([format-fns format-nil-values? response]
   (when (= (:status response) :failed)
     (log/warnf "Error running query: %s" (u/pprint-to-str 'red response))
     (throw (ex-info (:error response) response)))

   (let [format-fns (map format-rows-fn (format-rows-fns format-fns))]
     (-> response
         ((fn format-rows [rows]
            (cond
              (:data rows)
              (update rows :data format-rows)

              (:rows rows)
              (update rows :rows format-rows)

              (sequential? rows)
              (vec
               (for [row rows]
                 (vec
                  (for [[f v] (partition 2 (interleave format-fns row))]
                    (when (or (some? v) format-nil-values?)
                      (try
                        (f v)
                        (catch Throwable e
                          (throw (ex-info (format "format-rows-by failed (f = %s, value = %s %s): %s"
                                                  (pr-str f)
                                                  (.getName (class v))
                                                  (pr-str v)
                                                  (.getMessage e))
                                   {:f f, :v v, :format-nil-values? format-nil-values?}
                                   e)))))))))

              :else
              (throw (ex-info "Unexpected response: rows are not sequential!" {:response response})))))))))

(defn data
  "Return the result `data` from a successful query run, or throw an Exception if processing failed."
  [results]
  (when (#{:failed "failed"} (:status results))
    (throw (ex-info (str (or (:error results) "Error running query"))
                    (if (map? results) results {:results results}))))
  (:data results))

(defn rows
  "Return the result rows from query `results`, or throw an Exception if they're missing."
  [results]
  (or (some-> (data results) :rows vec)
      (throw (ex-info "Query does not have any :rows in results."
                      (if (map? results) results {:result results})))))

(defn formatted-rows
  "Combines `rows` and `format-rows-by`."
  {:style/indent :defn}
  ([format-fns response]
   (format-rows-by format-fns (rows response)))

  ([format-fns format-nil-values? response]
   (format-rows-by format-fns format-nil-values? (rows response))))

(defn first-row
  "Return the first row in the `results` of a query, or throw an Exception if they're missing."
  [results]
  (first (rows results)))

(defn supports-report-timezone?
  "Returns truthy if `driver` supports setting a timezone"
  [driver]
  (driver/database-supports? driver :set-timezone (data/db)))

(defn cols
  "Return the result `:cols` from query `results`, or throw an Exception if they're missing."
  [results]
  (or (some->> (data results) :cols (mapv #(into {} %)))
      (throw (ex-info "Query does not have any :cols in results." results))))

(defn rows-and-cols
  "Return both `:rows` and `:cols` from the results. Equivalent to

    {:rows (rows results), :cols (cols results)}"
  [results]
  {:rows (rows results), :cols (cols results)})

(defn rows+column-names
  "Return the result rows and column names from query `results`, or throw an Exception if they're missing."
  [results]
  {:rows (rows results), :columns (map :name (cols results))})

(defn tz-shifted-driver-bug?
  "Returns true if `driver` is affected by the bug originally observed in
  Oracle (https://github.com/metabase/metabase/issues/5789) but later found in Redshift and Snowflake. The timezone is
  applied correctly, but the date operations that we use aren't using that timezone. This function is used to
  differentiate Oracle from the other report-timezone databases until that bug can get fixed. Redshift and Snowflake
  also have this issue."
  [driver]
  ;; TIMEZONE FIXME — remove this and fix the drivers
  (contains? #{:snowflake :oracle :redshift} driver))

(defn nest-query
  "Nest an MBQL/native query by `n-levels`. Useful for testing how nested queries behave."
  [outer-query n-levels]
  (if-not (pos? n-levels)
    outer-query
    (let [nested (case (:type outer-query)
                   :native
                   (-> outer-query
                       (dissoc :native :type)
                       (assoc :type :query
                              :query {:source-query (set/rename-keys (:native outer-query) {:query :native})}))

                   :query
                   (assoc outer-query :query {:source-query (:query outer-query)}))]
      (recur nested (dec n-levels)))))

(deftest nest-query-test
  (testing "MBQL"
    (is (= {:database 1, :type :query, :query {:source-table 2}}
           {:database 1, :type :query, :query {:source-table 2}}))
    (is (= {:database 1, :type :query, :query {:source-query {:source-table 2}}}
           (nest-query {:database 1, :type :query, :query {:source-table 2}} 1)))
    (is (= {:database 1, :type :query, :query {:source-query {:source-query {:source-table 2}}}}
           (nest-query {:database 1, :type :query, :query {:source-table 2}} 2)))
    (is (= {:database 1, :type :query, :query {:source-query {:source-query {:source-table 2}}}}
           (nest-query {:database 1, :type :query, :query {:source-query {:source-table 2}}} 1))))
  (testing "native"
    (is (= {:database 1, :type :native, :native {:query "wow"}}
           (nest-query {:database 1, :type :native, :native {:query "wow"}} 0)))
    (is (= {:database 1, :type :query, :query {:source-query {:native "wow"}}}
           (nest-query {:database 1, :type :native, :native {:query "wow"}} 1)))
    (is (= {:database 1, :type :query, :query {:source-query {:source-query {:native "wow"}}}}
           (nest-query {:database 1, :type :native, :native {:query "wow"}} 2)))))

(defn do-with-bigquery-fks [driver-or-drivers thunk]
  {:pre [((some-fn keyword? coll?) driver-or-drivers)]}
  (letfn [(add-fks? [driver]
            (if (coll? driver-or-drivers)
              (contains? (set driver-or-drivers) driver)
              (= driver driver-or-drivers)))]
    (if-not (add-fks? driver/*driver*)
      (thunk)
      (let [database-supports? driver/database-supports?]
        (with-redefs [driver/database-supports? (fn [driver feature db]
                                                  (if (and (add-fks? driver)
                                                           (= feature :foreign-keys))
                                                    true
                                                    (database-supports? driver feature db)))]
          (let [thunk (reduce
                       (fn [thunk [source dest]]
                         (fn []
                           (testing (format "With FK %s -> %s" source dest)
                             (tu/with-temp-vals-in-db Field (apply data/id source) {:fk_target_field_id (apply data/id dest)
                                                                                    :semantic_type      "type/FK"}
                               (thunk)))))
                       thunk
                       (if (str/includes? (:name (data/db)) "sample")
                         {[:orders :product_id]  [:products :id]
                          [:orders :user_id]     [:people :id]
                          [:reviews :product_id] [:products :id]}
                         {[:checkins :user_id]   [:users :id]
                          [:checkins :venue_id]  [:venues :id]
                          [:venues :category_id] [:categories :id]}))]
            (thunk)))))))

(defmacro with-bigquery-fks
  "Execute `body` with test-data `checkins.user_id`, `checkins.venue_id`, and `venues.category_id` (for `test-data`) or
  other relevant columns (for `sample-database`) marked as foreign keys and with `:foreign-keys` a supported feature
  when testing against BigQuery, for the BigQuery based driver `driver-or-drivers`. BigQuery does not support Foreign Key
  constraints, but we still let people mark them manually. The macro helps replicate the situation where somebody has
  manually marked FK relationships for BigQuery."
  [driver-or-drivers & body]
  `(do-with-bigquery-fks ~driver-or-drivers (fn [] ~@body)))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (data/with-temp-copy-of-db
      (tu/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (let [query            (assoc (data/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                      :cache-ttl 10)
              run-query        (fn []
                                 (let [results (qp/process-query query)]
                                   {:cached?  (boolean (:cached results))
                                    :num-rows (count (rows results))}))
              expected-results (qp/preprocess query)]
          (testing "Check preprocess before caching to make sure results make sense"
            (is (schema= {:database (s/eq (data/id))
                          s/Keyword s/Any}
                         expected-results)))
          (testing "Run the query a few of times so we know it's cached"
            (testing "first run"
              (is (= {:cached?  false
                      :num-rows 5}
                     (run-query))))
            ;; run a few more times to make sure stuff got a chance to be cached.
            (run-query)
            (run-query)
            (testing "should be cached now"
              (is (= {:cached?  true
                      :num-rows 5}
                     (run-query))))
            (testing "preprocess should return same results even when query was cached."
              (is (= expected-results
                     (qp/preprocess query))))))))))
