(ns metabase.query-processor-test
  "Helper functions for various query processor tests. The tests themselves can be found in various
  `metabase.query-processor-test.*` namespaces; there are so many that it is no longer feasible to keep them all in
  this one. Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models.field :refer [Field]]
            [metabase.test.data :as data]
            [metabase.test.data
             [datasets :as datasets]
             [env :as tx.env]
             [interface :as tx]]
            [toucan.db :as db]))

;;; ---------------------------------------------- Helper Fns + Macros -----------------------------------------------

;; TODO - now that we've added Google Analytics to this, `timeseries-drivers` doesn't really make sense anymore.
;; Perhaps we should rename it to `abnormal-drivers`

;; Event-Based DBs aren't tested here, but in `event-query-processor-test` instead.
(def ^:private timeseries-drivers #{:druid :googleanalytics})

(def non-timeseries-drivers
  "Set of engines for non-timeseries DBs (i.e., every driver except `:druid`)."
  (set/difference tx.env/test-drivers timeseries-drivers))

(defn non-timeseries-drivers-with-feature
  "Set of engines that support a given `feature`. If additional features are given, it will ensure all features are
  supported."
  [feature & more-features]
  (let [features (set (cons feature more-features))]
    (set (for [engine non-timeseries-drivers
               :when  (set/subset? features (driver.u/features engine))]
           engine))))

(defn non-timeseries-drivers-without-feature
  "Return a set of all non-timeseries engines (e.g., everything except Druid) that DO NOT support `feature`."
  [feature]
  (set/difference non-timeseries-drivers (non-timeseries-drivers-with-feature feature)))

;; TODO - should be renamed to `expect-with-non-timeseries-drivers`
(defmacro expect-with-non-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-drivers non-timeseries-drivers
     ~expected
     ~actual))

(defmacro expect-with-non-timeseries-dbs-except
  {:style/indent 1}
  [excluded-engines expected actual]
  `(datasets/expect-with-drivers (set/difference non-timeseries-drivers (set ~excluded-engines))
     ~expected
     ~actual))

(defmacro ^:deprecated qp-expect-with-all-drivers
  "Wraps `expected` form in the 'wrapped' query results (includes `:status` and `:row_count`.)

  DEPRECATED -- If you don't care about `:status` and `:row_count` (you usually don't) use `qp.test/rows` or
  `qp.test/rows-and-columns` instead."
  {:style/indent 0}
  [data query-form & post-process-fns]
  `(expect-with-non-timeseries-dbs
     {:status    :completed
      :row_count ~(count (:rows data))
      :data      ~data}
     (-> ~query-form
         ~@post-process-fns)))

;; Predefinied Column Fns: These are meant for inclusion in the expected output of the QP tests, to save us from
;; writing the same results several times

(defn- col-defaults []
  {:description     nil
   :visibility_type :normal
   :settings        nil
   :parent_id       nil
   :source          :fields})

(defn col
  "Get a Field as it would appear in the Query Processor results in `:cols`.

    (qp.test/col :venues :id)"
  [table-kw field-kw]
  (merge
   (col-defaults)
   (db/select-one [Field :id :table_id :special_type :base_type :name :display_name :fingerprint]
     :id (data/id table-kw field-kw))
   {:field_ref [:field-id (data/id table-kw field-kw)]}
   (when (#{:last_login :date} field-kw)
     {:unit      :default
      :field_ref [:datetime-field [:field-id (data/id table-kw field-kw)] :default]})))

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

(defn aggregate-col
  "Return the column information we'd expect for an aggregate column. For all columns besides `:count`, you'll need to
  pass the `Field` in question as well.

    (aggregate-col :count)
    (aggregate-col :avg (col :venues :id))
    (aggregate-col :avg :venues :id)"
  ([ag-type]
   (tx/aggregate-column-info (tx/driver) ag-type))

  ([ag-type field]
   (tx/aggregate-column-info (tx/driver) ag-type field))

  ([ag-type table-kw field-kw]
   (tx/aggregate-column-info (tx/driver) ag-type (col table-kw field-kw))))

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
  ([{field-name :name, base-type :base_type, unit :unit, :as col}]
   (-> col
       (assoc :field_ref [:field-literal field-name base-type]
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
        (assoc :field_ref   [:fk-> [:field-id (:id source-col)] [:field-id (:id dest-col)]]
               :fk_field_id (:id source-col)))))

(declare cols)

(def ^:private ^{:arglists '([db-id table-id field-id])} native-query-col*
  (memoize
   (fn [db-id table-id field-id]
     (first
      (cols
       (qp/process-query
         {:database db-id
          :type     :native
          :native   (qp/query->native
                      {:database db-id
                       :type     :query
                       :query    {:source-table table-id
                                  :fields       [[:field_id field-id]]
                                  :limit        1}})}))))))

(defn native-query-col
  "Return expected `:cols` info for a Field from a native query or native source query."
  [table-kw field-kw]
  (native-query-col* (data/id) (data/id table-kw) (data/id table-kw field-kw)))

(defn ^:deprecated booleanize-native-form
  "Convert `:native_form` attribute to a boolean to make test results comparisons easier. Remove `data.results_metadata`
  as well since it just takes a lot of space and the checksum can vary based on whether encryption is enabled.

  DEPRECATED: Just use `qp.test/rows`, `qp.test/row-and-cols`, or `qp.test/rows+column-names` instead, combined with
  functions like `col` as needed."
  [m]
  (-> m
      (update-in [:data :native_form] boolean)
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

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
  [int identity])

(defmethod format-rows-fns :checkins
  [_]
  [int identity int int])

(defmethod format-rows-fns :users
  [_]
  [int identity identity])

(defmethod format-rows-fns :venues
  [_]
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
     (println "Error running query:" (u/pprint-to-str 'red response))
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
                    (when (or v format-nil-values?)
                      (try
                        (f v)
                        (catch Throwable e
                          (throw (ex-info (printf "format-rows-by failed (f = %s, value = %s %s): %s" f (.getName (class v)) v (.getMessage e))
                                   {:f f, :v v}
                                   e)))))))))

              :else
              (throw (ex-info "Unexpected response: rows are not sequential!" {:response response})))))))))

(defn data
  "Return the result `data` from a successful query run, or throw an Exception if processing failed."
  {:style/indent 0}
  [results]
  (when (= (:status results) :failed)
    (println "Error running query:" (u/pprint-to-str 'red results))
    (throw (ex-info (str (or (:error results) "Error running query"))
             (if (map? results) results {:results results}))))
  (:data results))

(defn rows
  "Return the result rows from query `results`, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (or (some-> (data results) :rows vec)
      (throw (ex-info "Query does not have any :rows in results." results))))

(defn formatted-rows
  "Combines `rows` and `format-rows-by`."
  {:style/indent 1}
  ([format-fns response]
   (format-rows-by format-fns (rows response)))

  ([format-fns format-nil-values? response]
   (format-rows-by format-fns format-nil-values? (rows response))))

(defn first-row
  "Return the first row in the `results` of a query, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (first (rows results)))

(defn supports-report-timezone?
  "Returns truthy if `driver` supports setting a timezone"
  [driver]
  (driver/supports? driver :set-timezone))

(defn cols
  "Return the result `:cols` from query `results`, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (or (some-> (data results) :cols vec)
      (throw (ex-info "Query does not have any :cols in results." results))))

(defn rows-and-cols
  "Return both `:rows` and `:cols` from the results. Equivalent to

    {:rows (rows results), :cols (cols results)}"
  {:style/indent 0}
  [results]
  {:rows (rows results), :cols (cols results)})

(defn rows+column-names
  "Return the result rows and column names from query `results`, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  {:rows (rows results), :columns (map :name (cols results))})

(defn tz-shifted-driver-bug?
  "Returns true if `driver` is affected by the bug originally observed in
  Oracle (https://github.com/metabase/metabase/issues/5789) but later found in Redshift and Snowflake. The timezone is
  applied correctly, but the date operations that we use aren't using that timezone. This function is used to
  differentiate Oracle from the other report-timezone databases until that bug can get fixed. Redshift and Snowflake
  also have this issue."
  [driver]
  (contains? #{:snowflake :oracle :redshift} driver))
