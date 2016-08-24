(ns metabase.query-processor-test
  "Query processing tests that can be ran between any of the available non-event-based DB drivers, and should give the same results.
   Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.set :as set]
            [expectations :refer :all]
            (metabase [db :as db]
                      [driver :as driver])
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.query-processor :refer :all]
            (metabase.query-processor [expand :as ql]
                                      [interface :as qpi])
            [metabase.test.data :refer :all]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets :refer [*driver* *engine*]]
                                [interface :refer [create-database-definition], :as i])
            [metabase.test.util :as tu]
            [metabase.query-processor :as qp]
            [metabase.util :as u]))

;;; ------------------------------------------------------------ Helper Fns + Macros ------------------------------------------------------------

;; Event-Based DBs aren't tested here, but in `event-query-processor-test` instead.
(def ^:private ^:const timeseries-engines #{:druid})

;; TODO - Since this is used in other test namespaces it might make sense to move it somewhere more general
(def ^:const non-timeseries-engines
  "Set of engines for non-timeseries DBs (i.e., every driver except `:druid`)."
  (set/difference datasets/all-valid-engines timeseries-engines))

;; TODO - this should be moved somewhere more general as well
(defn engines-that-support
  "Set of engines that support a given FEATURE."
  [feature]
  (set (for [engine non-timeseries-engines
             :when  (contains? (driver/features (driver/engine->driver engine)) feature)]
         engine)))

(defn- engines-that-dont-support [feature]
  (set/difference non-timeseries-engines (engines-that-support feature)))

(defmacro ^:private expect-with-non-timeseries-dbs
  {:style/indent 0}
  [expected actual]
  `(datasets/expect-with-engines non-timeseries-engines
     ~expected
     ~actual))

(defmacro ^:private expect-with-non-timeseries-dbs-except
  {:style/indent 1}
  [excluded-engines expected actual]
  `(datasets/expect-with-engines (set/difference non-timeseries-engines (set ~excluded-engines))
     ~expected
     ~actual))

(defmacro ^:private qp-expect-with-all-engines
  {:style/indent 0}
  [data q-form & post-process-fns]
  `(expect-with-non-timeseries-dbs
     {:status    :completed
      :row_count ~(count (:rows data))
      :data      ~data}
     (-> ~q-form
         ~@post-process-fns)))

(defmacro ^:private qp-expect-with-engines [datasets data q-form]
  `(datasets/expect-with-engines ~datasets
     {:status    :completed
      :row_count ~(count (:rows data))
      :data      ~data}
     ~q-form))


(defn- ->columns
  "Generate the vector that should go in the `columns` part of a QP result; done by calling `format-name` against each column name."
  [& names]
  (mapv (partial format-name)
        names))


;; ### Predefinied Column Fns
;; These are meant for inclusion in the expected output of the QP tests, to save us from writing the same results several times

;; #### categories

(defn- col-defaults []
  {:extra_info      {}
   :target          nil
   :description     nil
   :visibility_type :normal
   :schema_name     (default-schema)
   :source          :fields
   :fk_field_id     nil})

(defn- target-field [field]
  (when (fks-supported?)
    (dissoc field :target :extra_info :schema_name :source :fk_field_id)))

(defn- categories-col
  "Return column information for the `categories` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (id :categories)
    :id       (id :categories col)}
   (case col
     :id   {:special_type :id
            :base_type    (id-field-type)
            :name         (format-name "id")
            :display_name "ID"}
     :name {:special_type :name
            :base_type    (expected-base-type->actual :TextField)
            :name         (format-name "name")
            :display_name "Name"})))

;; #### users
(defn- users-col
  "Return column information for the `users` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (id :users)
    :id       (id :users col)}
   (case col
     :id         {:special_type :id
                  :base_type    (id-field-type)
                  :name         (format-name "id")
                  :display_name "ID"}
     :name       {:special_type :name
                  :base_type    (expected-base-type->actual :TextField)
                  :name         (format-name "name")
                  :display_name "Name"}
     :last_login {:special_type nil
                  :base_type    (expected-base-type->actual :DateTimeField)
                  :name         (format-name "last_login")
                  :display_name "Last Login"
                  :unit         :default})))

;; #### venues
(defn- venues-columns
  "Names of all columns for the `venues` table."
  []
  (->columns "id" "name" "category_id" "latitude" "longitude" "price"))

(defn- venues-col
  "Return column information for the `venues` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (id :venues)
    :id       (id :venues col)}
   (case col
     :id          {:special_type :id
                   :base_type    (id-field-type)
                   :name         (format-name "id")
                   :display_name "ID"}
     :category_id {:extra_info   (if (fks-supported?)
                                   {:target_table_id (id :categories)}
                                   {})
                   :target       (target-field (categories-col :id))
                   :special_type (if (fks-supported?)
                                   :fk
                                   :category)
                   :base_type    (expected-base-type->actual :IntegerField)
                   :name         (format-name "category_id")
                   :display_name "Category ID"}
     :price       {:special_type :category
                   :base_type    (expected-base-type->actual :IntegerField)
                   :name         (format-name "price")
                   :display_name "Price"}
     :longitude   {:special_type :longitude,
                   :base_type    (expected-base-type->actual :FloatField)
                   :name         (format-name "longitude")
                   :display_name "Longitude"}
     :latitude    {:special_type :latitude
                   :base_type    (expected-base-type->actual :FloatField)
                   :name         (format-name "latitude")
                   :display_name "Latitude"}
     :name        {:special_type :name
                   :base_type    (expected-base-type->actual :TextField)
                   :name         (format-name "name")
                   :display_name "Name"})))

(defn- venues-cols
  "`cols` information for all the columns in `venues`."
  []
  (mapv venues-col [:id :name :category_id :latitude :longitude :price]))

;; #### checkins
(defn- checkins-col
  "Return column information for the `checkins` column named by keyword COL."
  [col]
  (merge
   (col-defaults)
   {:table_id (id :checkins)
    :id       (id :checkins col)}
   (case col
     :id       {:special_type :id
                :base_type    (id-field-type)
                :name         (format-name "id")
                :display_name "ID"}
     :venue_id {:extra_info   (if (fks-supported?) {:target_table_id (id :venues)}
                                  {})
                :target       (target-field (venues-col :id))
                :special_type (when (fks-supported?)
                                :fk)
                :base_type    (expected-base-type->actual :IntegerField)
                :name         (format-name "venue_id")
                :display_name "Venue ID"}
     :user_id  {:extra_info   (if (fks-supported?) {:target_table_id (id :users)}
                                  {})
                :target       (target-field (users-col :id))
                :special_type (if (fks-supported?) :fk
                                  :category)
                :base_type    (expected-base-type->actual :IntegerField)
                :name         (format-name "user_id")
                :display_name "User ID"})))


;;; #### aggregate columns

(defn- aggregate-col
  "Return the column information we'd expect for an aggregate column. For all columns besides `:count`, you'll need to pass the `Field` in question as well.

    (aggregate-col :count)
    (aggregate-col :avg (venues-col :id))"
  {:arglists '([ag-col-kw] [ag-col-kw field])}
  ([ag-col-kw]
   (case ag-col-kw
     :count  {:base_type    :IntegerField
              :special_type :number
              :name         "count"
              :display_name "count"
              :id           nil
              :table_id     nil
              :description  nil
              :source       :aggregation
              :extra_info   {}
              :target       nil}))
  ([ag-col-kw {:keys [base_type special_type]}]
   {:pre [base_type special_type]}
   {:base_type    base_type
    :special_type special_type
    :id           nil
    :table_id     nil
    :description  nil
    :source       :aggregation
    :extra_info   {}
    :target       nil
    :name         (name ag-col-kw)
    :display_name (name ag-col-kw)}))

(defn- breakout-col [column]
  (assoc column :source :breakout))

(defn- booleanize-native-form
  "Convert `:native_form` attribute to a boolean to make test results comparisons easier."
  [m]
  (update-in m [:data :native_form] boolean))

(defn format-rows-by
  "Format the values in result ROWS with the fns at the corresponding indecies in FORMAT-FNS.
   ROWS can be a sequence or any of the common map formats we expect in QP tests.

     (format-rows-by [int str double] [[1 1 1]]) -> [[1 \"1\" 1.0]]

   By default, does't call fns on `nil` values; pass a truthy value as optional param FORMAT-NIL-VALUES? to override this behavior."
  {:style/indent 1}
  ([format-fns rows]
   (format-rows-by format-fns (not :format-nil-values?) rows))
  ([format-fns format-nil-values? rows]
   (cond
     (= (:status rows) :failed) (throw (ex-info (:error rows) rows))

     (:data rows) (update-in rows [:data :rows] (partial format-rows-by format-fns))
     (:rows rows) (update    rows :rows         (partial format-rows-by format-fns))
     :else        (vec (for [row rows]
                         (vec (for [[f v] (partition 2 (interleave format-fns row))]
                                (when (or v format-nil-values?)
                                  (f v)))))))))

(def ^:private formatted-venues-rows (partial format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]))


(defn rows
  "Return the result rows from query results, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (vec (or (-> results :data :rows)
           (println (u/pprint-to-str 'red results))
           (throw (Exception. "Error!")))))

(defn first-row
  "Return the first row in the results of a query, or throw an Exception if they're missing."
  {:style/indent 0}
  [results]
  (first (rows results)))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                               THE TESTS THEMSELVES (!)                                               |
;;; +----------------------------------------------------------------------------------------------------------------------+

;; mbql-query?
(expect false (mbql-query? {}))
(expect false (mbql-query? {:type "native"}))
(expect true  (mbql-query? {:type "query"}))

(tu/resolve-private-fns metabase.query-processor query-without-aggregations-or-limits?)

;; query-without-aggregations-or-limits?
(expect false (query-without-aggregations-or-limits? {:query {:aggregation {:aggregation-type :count}}}))
(expect true  (query-without-aggregations-or-limits? {:query {:aggregation {:aggregation-type :rows}}}))
(expect false (query-without-aggregations-or-limits? {:query {:aggregation {:aggregation-type :count}
                                                              :limit       10}}))
(expect false (query-without-aggregations-or-limits? {:query {:aggregation {:aggregation-type :count}
                                                              :page        1}}))


;;; ------------------------------------------------------------ "COUNT" AGGREGATION ------------------------------------------------------------

(qp-expect-with-all-engines
    {:rows        [[100]]
     :columns     ["count"]
     :cols        [(aggregate-col :count)]
     :native_form true}
    (->> (run-query venues
           (ql/aggregation (ql/count)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ------------------------------------------------------------ "SUM" AGGREGATION ------------------------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[203]]
     :columns     ["sum"]
     :cols        [(aggregate-col :sum (venues-col :price))]
     :native_form true}
    (->> (run-query venues
           (ql/aggregation (ql/sum $price)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ------------------------------------------------------------ "AVG" AGGREGATION ------------------------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[35.5059]]
     :columns     ["avg"]
     :cols        [(aggregate-col :avg (venues-col :latitude))]
     :native_form true}
    (->> (run-query venues
           (ql/aggregation (ql/avg $latitude)))
         booleanize-native-form
         (format-rows-by [(partial u/round-to-decimals 4)])))


;;; ------------------------------------------------------------ "DISTINCT COUNT" AGGREGATION ------------------------------------------------------------
(qp-expect-with-all-engines
    {:rows        [[15]]
     :columns     ["count"]
     :cols        [(aggregate-col :count)]
     :native_form true}
    (->> (run-query checkins
           (ql/aggregation (ql/distinct $user_id)))
         booleanize-native-form
         (format-rows-by [int])))


;;; ------------------------------------------------------------ "ROWS" AGGREGATION ------------------------------------------------------------
;; Test that a rows aggregation just returns rows as-is.
(qp-expect-with-all-engines
    {:rows        [[ 1 "Red Medicine"                  4 10.0646 -165.374 3]
                   [ 2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
                   [ 3 "The Apple Pan"                11 34.0406 -118.428 2]
                   [ 4 "Wurstküche"                   29 33.9997 -118.465 2]
                   [ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
                   [ 6 "The 101 Coffee Shop"          20 34.1054 -118.324 2]
                   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
                   [ 8 "25°"                          11 34.1015 -118.342 2]
                   [ 9 "Krua Siri"                    71 34.1018 -118.301 1]
                   [10 "Fred 62"                      20 34.1046 -118.292 2]]
     :columns     (venues-columns)
     :cols        (venues-cols)
     :native_form true}
    (->> (run-query venues
           (ql/limit 10)
           (ql/order-by (ql/asc $id)))
         booleanize-native-form
         formatted-venues-rows))


;;; ------------------------------------------------------------ "PAGE" CLAUSE ------------------------------------------------------------
;; Test that we can get "pages" of results.

;; get the first page
(expect-with-non-timeseries-dbs
  [[1 "African"]
   [2 "American"]
   [3 "Artisan"]
   [4 "Asian"]
   [5 "BBQ"]]
  (->> (run-query categories
         (ql/page {:page 1, :items 5})
         (ql/order-by (ql/asc $id)))
       rows (format-rows-by [int str])))

;; get the second page
(expect-with-non-timeseries-dbs
  [[ 6 "Bakery"]
   [ 7 "Bar"]
   [ 8 "Beer Garden"]
   [ 9 "Breakfast / Brunch"]
   [10 "Brewery"]]
  (->> (run-query categories
         (ql/page {:page 2, :items 5})
         (ql/order-by (ql/asc $id)))
       rows (format-rows-by [int str])))


;;; ------------------------------------------------------------ "ORDER_BY" CLAUSE ------------------------------------------------------------
;; Test that we can tell the Query Processor to return results ordered by multiple fields
(expect-with-non-timeseries-dbs
  [[1 12 375]
   [1  9 139]
   [1  1  72]
   [2 15 129]
   [2 12 471]
   [2 11 325]
   [2  9 590]
   [2  9 833]
   [2  8 380]
   [2  5 719]]
  (->> (run-query checkins
         (ql/fields $venue_id $user_id $id)
         (ql/order-by (ql/asc $venue_id)
                      (ql/desc $user_id)
                      (ql/asc $id))
         (ql/limit 10))
       rows (format-rows-by [int int int])))


;;; ------------------------------------------------------------ "FILTER" CLAUSE ------------------------------------------------------------

;;; FILTER -- "AND", ">", ">="
(expect-with-non-timeseries-dbs
  [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
   [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
   [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
   [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
   [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  (-> (run-query venues
        (ql/filter (ql/and (ql/>  $id    50)
                           (ql/>= $price  4)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "AND", "<", ">", "!="
(expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"          58 37.7441 -122.421 2]
   [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
  (-> (run-query venues
        (ql/filter (ql/and (ql/<  $id 24)
                           (ql/>  $id 20)
                           (ql/!= $id 22)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER WITH A FALSE VALUE
;; Check that we're checking for non-nil values, not just logically true ones.
;; There's only one place (out of 3) that I don't like
(expect-with-non-timeseries-dbs
  [[1]]
  (->> (dataset places-cam-likes
         (run-query places
           (ql/aggregation (ql/count))
           (ql/filter (ql/= $liked false))))
       rows (format-rows-by [int])))

(defn- ->bool [x] ; SQLite returns 0/1 for false/true;
  (condp = x      ; Redshift returns nil/true.
    0   false     ; convert to false/true and restore sanity.
    0M  false
    1   true
    1M  true
    nil false
        x))

;;; filter = true
(expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (dataset places-cam-likes
         (run-query places
           (ql/filter (ql/= $liked true))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != false
(expect-with-non-timeseries-dbs
  [[1 "Tempest" true]
   [2 "Bullit"  true]]
  (->> (dataset places-cam-likes
         (run-query places
           (ql/filter (ql/!= $liked false))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))

;;; filter != true
(expect-with-non-timeseries-dbs
  [[3 "The Dentist" false]]
  (->> (dataset places-cam-likes
         (run-query places
           (ql/filter (ql/!= $liked true))
           (ql/order-by (ql/asc $id))))
       rows (format-rows-by [int str ->bool] :format-nil-values)))


;;; FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(expect-with-non-timeseries-dbs
  [[21 "PizzaHacker"    58 37.7441 -122.421 2]
   [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
  (-> (run-query venues
        (ql/filter (ql/between $id 21 22))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "BETWEEN" with dates
(qp-expect-with-all-engines
  {:rows        [[29]]
   :columns     ["count"]
   :cols        [(aggregate-col :count)]
   :native_form true}
  (->> (run-query checkins
         (ql/aggregation (ql/count))
         (ql/filter (ql/between $date "2015-04-01" "2015-05-01")))
       booleanize-native-form
       (format-rows-by [int])))

;;; FILTER -- "OR", "<=", "="
(expect-with-non-timeseries-dbs
  [[1 "Red Medicine"                  4 10.0646 -165.374 3]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [3 "The Apple Pan"                11 34.0406 -118.428 2]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  (-> (run-query venues
        (ql/filter (ql/or (ql/<= $id 3)
                          (ql/= $id 5)))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; FILTER -- "INSIDE"
(expect-with-non-timeseries-dbs
  [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  (-> (run-query venues
        (ql/filter (ql/inside $latitude $longitude 10.0649 -165.379 10.0641 -165.371)))
      rows formatted-venues-rows))

;;; FILTER - `is-null` & `not-null` on datetime columns
(expect-with-non-timeseries-dbs
  [1000]
  (first-row
    (format-rows-by [int]
      (run-query checkins
        (ql/aggregation (ql/count))
        (ql/filter (ql/not-null $date))))))

(expect-with-non-timeseries-dbs
  true
  (let [result (first-row (run-query checkins
                            (ql/aggregation (ql/count))
                            (ql/filter (ql/is-null $date))))]
    ;; Some DBs like Mongo don't return any results at all in this case, and there's no easy workaround
    (or (= result [0])
        (= result [0M])
        (nil? result))))


;;; ------------------------------------------------------------ "FIELDS" CLAUSE ------------------------------------------------------------
;; Test that we can restrict the Fields that get returned to the ones specified, and that results come back in the order of the IDs in the `fields` clause
(qp-expect-with-all-engines
    {:rows    [["Red Medicine" 1]
               ["Stout Burgers & Beers" 2]
               ["The Apple Pan" 3]
               ["Wurstküche" 4]
               ["Brite Spot Family Restaurant" 5]
               ["The 101 Coffee Shop" 6]
               ["Don Day Korean Restaurant" 7]
               ["25°" 8]
               ["Krua Siri" 9]
               ["Fred 62" 10]],
     :columns (->columns "name" "id")
     :cols    [(venues-col :name)
               (venues-col :id)]
     :native_form true}
  (->> (run-query venues
                  (ql/fields $name $id)
                  (ql/limit 10)
                  (ql/order-by (ql/asc $id)))
       booleanize-native-form
       (format-rows-by [str int])))


;;; ------------------------------------------------------------ "BREAKOUT" ------------------------------------------------------------
;;; single column
(qp-expect-with-all-engines
    {:rows    [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
     :columns [(format-name "user_id")
               "count"]
     :cols    [(breakout-col (checkins-col :user_id))
               (aggregate-col :count)]
     :native_form true}
  (->> (run-query checkins
                  (ql/aggregation (ql/count))
                  (ql/breakout $user_id)
                  (ql/order-by (ql/asc $user_id)))
       booleanize-native-form
       (format-rows-by [int int])))

;;; BREAKOUT w/o AGGREGATION
;; This should act as a "distinct values" query and return ordered results
(qp-expect-with-all-engines
    {:cols    [(breakout-col (checkins-col :user_id))]
     :columns [(format-name "user_id")]
     :rows    [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]
     :native_form true}
  (->> (run-query checkins
                  (ql/breakout $user_id)
                  (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int])))


;;; "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(qp-expect-with-all-engines
    {:rows    [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols    [(breakout-col (checkins-col :user_id))
               (breakout-col (checkins-col :venue_id))
               (aggregate-col :count)]
     :native_form true}
  (->> (run-query checkins
                  (ql/aggregation (ql/count))
                  (ql/breakout $user_id $venue_id)
                  (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int int int])))

;;; "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(qp-expect-with-all-engines
    {:rows    [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]],
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols    [(breakout-col (checkins-col :user_id))
               (breakout-col (checkins-col :venue_id))
               (aggregate-col :count)]
     :native_form true}
  (->> (run-query checkins
                  (ql/aggregation (ql/count))
                  (ql/breakout $user_id $venue_id)
                  (ql/order-by (ql/desc $user_id))
                  (ql/limit 10))
       booleanize-native-form
       (format-rows-by [int int int])))



;;; ------------------------------------------------------------ LIMIT-MAX-RESULT-ROWS ------------------------------------------------------------
;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `absolute-max-results`
(expect absolute-max-results
  (->> (((resolve 'metabase.query-processor/limit) identity) {:rows (repeat [:ok])})
       :rows
       count))

;; Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained
(expect 1234
  (->> (((resolve 'metabase.query-processor/limit) identity) {:constraints {:max-results 1234}
                                                              :query       {:aggregation {:aggregation-type :count}}
                                                              :rows        (repeat [:ok])})
       :rows
       count))

;; Apply a max-results-bare-rows limit specifically on :rows type query
(expect [46 46]
  (let [res (((resolve 'metabase.query-processor/limit) identity) {:constraints {:max-results 46}
                                                                   :query       {:aggregation {:aggregation-type :rows}}
                                                                   :rows        (repeat [:ok])})]
    [(->> res :rows count)
     (->> res :query :limit)]))


;;; ------------------------------------------------------------ CUMULATIVE SUM ------------------------------------------------------------

;;; cum_sum w/o breakout should be treated the same as sum
(qp-expect-with-all-engines
    {:rows    [[120]]
     :columns ["sum"]
     :cols    [(aggregate-col :sum (users-col :id))]
     :native_form true}
  (->> (run-query users
         (ql/aggregation (ql/cum-sum $id)))
       booleanize-native-form
       (format-rows-by [int])))


;;; Simple cumulative sum where breakout field is same as cum_sum field
(qp-expect-with-all-engines
    {:rows    [[1] [3] [6] [10] [15] [21] [28] [36] [45] [55] [66] [78] [91] [105] [120]]
     :columns (->columns "id")
     :cols    [(users-col :id)]
     :native_form true}
    (->> (run-query users
           (ql/aggregation (ql/cum-sum $id))
           (ql/breakout $id))
         booleanize-native-form
         (format-rows-by [int])))


;;; Cumulative sum w/ a different breakout field
(qp-expect-with-all-engines
  {:rows        [["Broen Olujimi"        14]
                 ["Conchúr Tihomir"      21]
                 ["Dwight Gresham"       34]
                 ["Felipinho Asklepios"  36]
                 ["Frans Hevel"          46]
                 ["Kaneonuskatew Eiran"  49]
                 ["Kfir Caj"             61]
                 ["Nils Gotam"           70]
                 ["Plato Yeshua"         71]
                 ["Quentin Sören"        76]
                 ["Rüstem Hebel"         91]
                 ["Shad Ferdynand"       97]
                 ["Simcha Yan"          101]
                 ["Spiros Teofil"       112]
                 ["Szymon Theutrich"    120]]
   :columns     [(format-name "name")
                 "sum"]
   :cols        [(breakout-col (users-col :name))
                 (aggregate-col :sum (users-col :id))]
   :native_form true}
  (->> (run-query users
         (ql/aggregation (ql/cum-sum $id))
         (ql/breakout $name))
       booleanize-native-form
       (format-rows-by [str int])))


;;; Cumulative sum w/ a different breakout field that requires grouping
(qp-expect-with-all-engines
  {:columns     [(format-name "price")
                 "sum"]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :sum (venues-col :id))]
   :rows        [[1 1211]
                 [2 4066]
                 [3 4681]
                 [4 5050]]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/cum-sum $id))
         (ql/breakout $price))
       booleanize-native-form
       (format-rows-by [int int])))


;;; ------------------------------------------------------------ CUMULATIVE COUNT ------------------------------------------------------------

(defn- cumulative-count-col [col-fn col-name]
  (assoc (aggregate-col :count (col-fn col-name))
         :base_type    :IntegerField
         :special_type :number))

;;; cum_count w/o breakout should be treated the same as count
(qp-expect-with-all-engines
    {:rows    [[15]]
     :columns ["count"]
     :cols    [(cumulative-count-col users-col :id)]
     :native_form true}
  (->> (run-query users
                  (ql/aggregation (ql/cum-count)))
       booleanize-native-form
       (format-rows-by [int])))

;;; Cumulative count w/ a different breakout field
(qp-expect-with-all-engines
  {:rows        [["Broen Olujimi"        1]
                 ["Conchúr Tihomir"      2]
                 ["Dwight Gresham"       3]
                 ["Felipinho Asklepios"  4]
                 ["Frans Hevel"          5]
                 ["Kaneonuskatew Eiran"  6]
                 ["Kfir Caj"             7]
                 ["Nils Gotam"           8]
                 ["Plato Yeshua"         9]
                 ["Quentin Sören"       10]
                 ["Rüstem Hebel"        11]
                 ["Shad Ferdynand"      12]
                 ["Simcha Yan"          13]
                 ["Spiros Teofil"       14]
                 ["Szymon Theutrich"    15]]
   :columns     [(format-name "name")
                 "count"]
   :cols        [(breakout-col (users-col :name))
                 (cumulative-count-col users-col :id)]
   :native_form true}
  (->> (run-query users
         (ql/aggregation (ql/cum-count))
         (ql/breakout $name))
       booleanize-native-form
       (format-rows-by [str int])))


;;; Cumulative count w/ a different breakout field that requires grouping
(qp-expect-with-all-engines
  {:columns     [(format-name "price")
                 "count"]
   :cols        [(breakout-col (venues-col :price))
                 (cumulative-count-col venues-col :id)]
   :rows        [[1 22]
                 [2 81]
                 [3 94]
                 [4 100]]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/cum-count))
         (ql/breakout $price))
       booleanize-native-form
       (format-rows-by [int int])))


;;; ------------------------------------------------------------ STDDEV AGGREGATION ------------------------------------------------------------

(qp-expect-with-engines (engines-that-support :standard-deviation-aggregations)
  {:columns     ["stddev"]
   :cols        [(aggregate-col :stddev (venues-col :latitude))]
   :rows        [[3.4]]
   :native_form true}
  (-> (run-query venues
        (ql/aggregation (ql/stddev $latitude)))
      booleanize-native-form
      (update-in [:data :rows] (fn [[[v]]]
                                 [[(u/round-to-decimals 1 v)]]))))

;; Make sure standard deviation fails for the Mongo driver since its not supported
(datasets/expect-with-engines (engines-that-dont-support :standard-deviation-aggregations)
  {:status :failed
   :error  "standard-deviation-aggregations is not supported by this driver."}
  (select-keys (run-query venues
                 (ql/aggregation (ql/stddev $latitude)))
               [:status :error]))


;;; ------------------------------------------------------------ order_by aggregate fields ------------------------------------------------------------

;;; order_by aggregate ["count"]
(qp-expect-with-all-engines
  {:columns     [(format-name "price")
                 "count"]
   :rows        [[4  6]
                 [3 13]
                 [1 22]
                 [2 59]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :count)]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/count))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["sum" field-id]
(qp-expect-with-all-engines
  {:columns     [(format-name "price")
                 "sum"]
   :rows        [[2 2855]
                 [1 1211]
                 [3  615]
                 [4  369]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :sum (venues-col :id))]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/sum $id))
         (ql/breakout $price)
         (ql/order-by (ql/desc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["distinct" field-id]
(qp-expect-with-all-engines
  {:columns     [(format-name "price")
                 "count"]
   :rows        [[4  6]
                 [3 13]
                 [1 22]
                 [2 59]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :count)]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/distinct $id))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["avg" field-id]
(expect-with-non-timeseries-dbs
  {:columns     [(format-name "price")
                 "avg"]
   :rows        [[3 22]
                 [2 28]
                 [1 32]
                 [4 53]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :avg (venues-col :category_id))]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/avg $category_id))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       :data (format-rows-by [int int])))

;;; ### order_by aggregate ["stddev" field-id]
;; SQRT calculations are always NOT EXACT (normal behavior) so round everything to the nearest int.
;; Databases might use different versions of SQRT implementations
(datasets/expect-with-engines (engines-that-support :standard-deviation-aggregations)
  {:columns     [(format-name "price")
                 "stddev"]
   :rows        [[3 (if (contains? #{:mysql :crate} *engine*) 25 26)]
                 [1 24]
                 [2 21]
                 [4 (if (contains? #{:mysql :crate} *engine*) 14 15)]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :stddev (venues-col :category_id))]
   :native_form true}
  (->> (run-query venues
         (ql/aggregation (ql/stddev $category_id))
         (ql/breakout $price)
         (ql/order-by (ql/desc (ql/aggregate-field 0))))
       booleanize-native-form
       :data (format-rows-by [int (comp int math/round)])))


;;; ------------------------------------------------------------ :details-only fields  ------------------------------------------------------------
;; make sure that rows where visibility_type = details-only are included and properly marked up
(expect-with-non-timeseries-dbs
  [(set (venues-cols))
   #{(venues-col :category_id)
     (venues-col :name)
     (venues-col :latitude)
     (venues-col :id)
     (venues-col :longitude)
     (assoc (venues-col :price) :visibility_type :details-only)}
   (set (venues-cols))]
  (let [get-col-names (fn [] (-> (run-query venues
                                   (ql/order-by (ql/asc $id))
                                   (ql/limit 1))
                                 :data :cols set))]
    [(get-col-names)
     (do (db/update! Field (id :venues :price), :visibility_type :details-only)
         (get-col-names))
     (do (db/update! Field (id :venues :price), :visibility_type :normal)
         (get-col-names))]))


;;; ------------------------------------------------------------ :sensitive fields ------------------------------------------------------------
;;; Make sure :sensitive information fields are never returned by the QP
(qp-expect-with-all-engines
  {:columns     (->columns "id" "name" "last_login")
   :cols        [(users-col :id)
                 (users-col :name)
                 (users-col :last_login)],
   :rows        [[ 1 "Plato Yeshua"]
                 [ 2 "Felipinho Asklepios"]
                 [ 3 "Kaneonuskatew Eiran"]
                 [ 4 "Simcha Yan"]
                 [ 5 "Quentin Sören"]
                 [ 6 "Shad Ferdynand"]
                 [ 7 "Conchúr Tihomir"]
                 [ 8 "Szymon Theutrich"]
                 [ 9 "Nils Gotam"]
                 [10 "Frans Hevel"]
                 [11 "Spiros Teofil"]
                 [12 "Kfir Caj"]
                 [13 "Dwight Gresham"]
                 [14 "Broen Olujimi"]
                 [15 "Rüstem Hebel"]]
   :native_form true}
  ;; Filter out the timestamps from the results since they're hard to test :/
  (-> (run-query users
        (ql/order-by (ql/asc $id)))
      booleanize-native-form
      (update-in [:data :rows] (partial mapv (fn [[id name last-login]]
                                               [(int id) name])))))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                                     PARAMETERS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------------+


(expect-with-non-timeseries-dbs
  [[9 "Nils Gotam"]]
  (format-rows-by [int str]
    (let [inner-query (query users
                             (ql/aggregation (ql/rows)))
          outer-query (wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "id", :type "id", :target ["field-id" (id :users :id)], :value 9}])]
      (rows (qp/process-query outer-query)))))


(expect-with-non-timeseries-dbs
  [[6]]
  (format-rows-by [int]
    (let [inner-query (query venues
                             (ql/aggregation (ql/count)))
          outer-query (wrap-inner-query inner-query)
          outer-query (assoc outer-query :parameters [{:name "price", :type "category", :target ["field-id" (id :venues :price)], :value 4}])]
      (rows (qp/process-query outer-query)))))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                           UNIX TIMESTAMP SPECIAL_TYPE FIELDS                                           |
;; +------------------------------------------------------------------------------------------------------------------------+

;; There were 9 "sad toucan incidents" on 2015-06-02
(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    10
    9)
  (count (rows (dataset sad-toucan-incidents
                 (run-query incidents
                   (ql/filter (ql/and (ql/> $timestamp "2015-06-01")
                                      (ql/< $timestamp "2015-06-03")))
                   (ql/order-by (ql/asc $timestamp)))))))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01"  6]
     ["2015-06-02" 10]
     ["2015-06-03"  4]
     ["2015-06-04"  9]
     ["2015-06-05"  9]
     ["2015-06-06"  8]
     ["2015-06-07"  8]
     ["2015-06-08"  9]
     ["2015-06-09"  7]
     ["2015-06-10"  9]]

    ;; SQL Server, Mongo, and Redshift don't have a concept of timezone so results are all grouped by UTC
    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T00:00:00.000Z"  6]
     ["2015-06-02T00:00:00.000Z" 10]
     ["2015-06-03T00:00:00.000Z"  4]
     ["2015-06-04T00:00:00.000Z"  9]
     ["2015-06-05T00:00:00.000Z"  9]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  8]
     ["2015-06-08T00:00:00.000Z"  9]
     ["2015-06-09T00:00:00.000Z"  7]
     ["2015-06-10T00:00:00.000Z"  9]]

    ;; Postgres, MySQL, and H2 -- grouped by DB timezone, US/Pacific in this case
    :else
    [["2015-06-01T00:00:00.000Z"  8]
     ["2015-06-02T00:00:00.000Z"  9]
     ["2015-06-03T00:00:00.000Z"  9]
     ["2015-06-04T00:00:00.000Z"  4]
     ["2015-06-05T00:00:00.000Z" 11]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  6]
     ["2015-06-08T00:00:00.000Z" 10]
     ["2015-06-09T00:00:00.000Z"  6]
     ["2015-06-10T00:00:00.000Z" 10]])
  (->> (dataset sad-toucan-incidents
         (run-query incidents
           (ql/aggregation (ql/count))
           (ql/breakout $timestamp)
           (ql/limit 10)))
       rows (format-rows-by [identity int])))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                                         JOINS                                                          |
;; +------------------------------------------------------------------------------------------------------------------------+

;; The top 10 cities by number of Tupac sightings
;; Test that we can breakout on an FK field (Note how the FK Field is returned in the results)
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  [["Arlington"    16]
   ["Albany"       15]
   ["Portland"     14]
   ["Louisville"   13]
   ["Philadelphia" 13]
   ["Anchorage"    12]
   ["Lincoln"      12]
   ["Houston"      11]
   ["Irvine"       11]
   ["Lakeland"     11]]
  (->> (dataset tupac-sightings
         (run-query sightings
           (ql/aggregation (ql/count))
           (ql/breakout $city_id->cities.name)
           (ql/order-by (ql/desc (ql/aggregate-field 0)))
           (ql/limit 10)))
       rows (format-rows-by [str int])))


;; Number of Tupac sightings in the Expa office
;; (he was spotted here 60 times)
;; Test that we can filter on an FK field
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  [[60]]
  (->> (dataset tupac-sightings
         (run-query sightings
           (ql/aggregation (ql/count))
           (ql/filter (ql/= $category_id->categories.id 8))))
       rows (format-rows-by [int])))


;; THE 10 MOST RECENT TUPAC SIGHTINGS (!)
;; (What he was doing when we saw him, sighting ID)
;; Check that we can include an FK field in the :fields clause
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  [[772 "In the Park"]
   [894 "Working at a Pet Store"]
   [684 "At the Airport"]
   [199 "At a Restaurant"]
   [33 "Working as a Limo Driver"]
   [902 "At Starbucks"]
   [927 "On TV"]
   [996 "At a Restaurant"]
   [897 "Wearing a Biggie Shirt"]
   [499 "In the Expa Office"]]
  (->> (dataset tupac-sightings
         (run-query sightings
           (ql/fields $id $category_id->categories.name)
           (ql/order-by (ql/desc $timestamp))
           (ql/limit 10)))
       rows (format-rows-by [int str])))


;; 1. Check that we can order by Foreign Keys
;;    (this query targets sightings and orders by cities.name and categories.name)
;; 2. Check that we can join MULTIPLE tables in a single query
;;    (this query joins both cities and categories)
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  ;; CITY_ID, CATEGORY_ID, ID
  ;; Cities are already alphabetized in the source data which is why CITY_ID is sorted
  [[1 12   6]
   [1 11 355]
   [1 11 596]
   [1 13 379]
   [1  5 413]
   [1  1 426]
   [2 11  67]
   [2 11 524]
   [2 13  77]
   [2 13 202]]
  (->> (dataset tupac-sightings
         (run-query sightings
           (ql/order-by (ql/asc $city_id->cities.name)
                        (ql/desc $category_id->categories.name)
                        (ql/asc $id))
           (ql/limit 10)))
       rows (map butlast) (map reverse) (format-rows-by [int int int]))) ; drop timestamps. reverse ordering to make the results columns order match order_by


;; Check that trying to use a Foreign Key fails for Mongo
(datasets/expect-with-engines (engines-that-dont-support :foreign-keys)
  {:status :failed
   :error "foreign-keys is not supported by this driver."}
  (select-keys (dataset tupac-sightings
                 (run-query sightings
                   (ql/order-by (ql/asc $city_id->cities.name)
                                (ql/desc $category_id->categories.name)
                                (ql/asc $id))
                   (ql/limit 10)))
               [:status :error]))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                                MONGO NESTED-FIELD ACCESS                                               |
;; +------------------------------------------------------------------------------------------------------------------------+

;;; Nested Field in FILTER
;; Get the first 10 tips where tip.venue.name == "Kyle's Low-Carb Grill"
(datasets/expect-with-engines (engines-that-support :nested-fields)
  [[8   "Kyle's Low-Carb Grill"]
   [67  "Kyle's Low-Carb Grill"]
   [80  "Kyle's Low-Carb Grill"]
   [83  "Kyle's Low-Carb Grill"]
   [295 "Kyle's Low-Carb Grill"]
   [342 "Kyle's Low-Carb Grill"]
   [417 "Kyle's Low-Carb Grill"]
   [426 "Kyle's Low-Carb Grill"]
   [470 "Kyle's Low-Carb Grill"]]
  (->> (dataset geographical-tips
         (run-query tips
           (ql/filter (ql/= $tips.venue.name "Kyle's Low-Carb Grill"))
           (ql/order-by (ql/asc $id))
           (ql/limit 10)))
       rows (mapv (fn [[id _ _ _ {venue-name :name}]] [id venue-name]))))

;;; Nested Field in ORDER
;; Let's get all the tips Kyle posted on Twitter sorted by tip.venue.name
(datasets/expect-with-engines (engines-that-support :nested-fields)
  [[446
    {:mentions ["@cams_mexican_gastro_pub"], :tags ["#mexican" "#gastro" "#pub"], :service "twitter", :username "kyle"}
    "Cam's Mexican Gastro Pub is a historical and underappreciated place to conduct a business meeting with friends."
    {:large  "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/large.jpg",
     :medium "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/med.jpg",
     :small  "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/small.jpg"}
    {:phone "415-320-9123", :name "Cam's Mexican Gastro Pub", :categories ["Mexican" "Gastro Pub"], :id "bb958ac5-758e-4f42-b984-6b0e13f25194"}]
   [230
    {:mentions ["@haight_european_grill"], :tags ["#european" "#grill"], :service "twitter", :username "kyle"}
    "Haight European Grill is a horrible and amazing place to have a birthday party during winter."
    {:large  "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/large.jpg",
     :medium "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/med.jpg",
     :small  "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/small.jpg"}
    {:phone "415-191-2778", :name "Haight European Grill", :categories ["European" "Grill"], :id "7e6281f7-5b17-4056-ada0-85453247bc8f"}]
   [319
    {:mentions ["@haight_soul_food_pop_up_food_stand"], :tags ["#soul" "#food" "#pop-up" "#food" "#stand"], :service "twitter", :username "kyle"}
    "Haight Soul Food Pop-Up Food Stand is a underground and modern place to have breakfast on a Tuesday afternoon."
    {:large  "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/large.jpg",
     :medium "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/med.jpg",
     :small  "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/small.jpg"}
    {:phone "415-741-8726", :name "Haight Soul Food Pop-Up Food Stand", :categories ["Soul Food" "Pop-Up Food Stand"], :id "9735184b-1299-410f-a98e-10d9c548af42"}]
   [224
    {:mentions ["@pacific_heights_free_range_eatery"], :tags ["#free-range" "#eatery"], :service "twitter", :username "kyle"}
    "Pacific Heights Free-Range Eatery is a wonderful and modern place to take visiting friends and relatives Friday nights."
    {:large  "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/large.jpg",
     :medium "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/med.jpg",
     :small  "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/small.jpg"}
    {:phone "415-901-6541", :name "Pacific Heights Free-Range Eatery", :categories ["Free-Range" "Eatery"], :id "88b361c8-ce69-4b2e-b0f2-9deedd574af6"}]]
  (rows (dataset geographical-tips
          (run-query tips
            (ql/filter (ql/and (ql/= $tips.source.service "twitter")
                               (ql/= $tips.source.username "kyle")))
            (ql/order-by (ql/asc $tips.venue.name))))))

;; Nested Field in AGGREGATION
;; Let's see how many *distinct* venue names are mentioned
(datasets/expect-with-engines (engines-that-support :nested-fields)
  [99]
  (first-row (dataset geographical-tips
               (run-query tips
                 (ql/aggregation (ql/distinct $tips.venue.name))))))

;; Now let's just get the regular count
(datasets/expect-with-engines (engines-that-support :nested-fields)
  [500]
  (first-row (dataset geographical-tips
               (run-query tips
                 (ql/aggregation (ql/count $tips.venue.name))))))

;;; Nested Field in BREAKOUT
;; Let's see how many tips we have by source.service
(datasets/expect-with-engines (engines-that-support :nested-fields)
  {:rows        [["facebook"   107]
                 ["flare"      105]
                 ["foursquare" 100]
                 ["twitter"     98]
                 ["yelp"        90]]
   :columns     ["source.service" "count"]
   :native_form true}
  (->> (dataset geographical-tips
         (run-query tips
           (ql/aggregation (ql/count))
           (ql/breakout $tips.source.service)))
       booleanize-native-form
       :data (#(dissoc % :cols)) (format-rows-by [str int])))

;;; Nested Field in FIELDS
;; Return the first 10 tips with just tip.venue.name
(datasets/expect-with-engines (engines-that-support :nested-fields)
  {:columns ["venue.name"]
   :rows    [["Lucky's Gluten-Free Café"]
             ["Joe's Homestyle Eatery"]
             ["Lower Pac Heights Cage-Free Coffee House"]
             ["Oakland European Liquor Store"]
             ["Tenderloin Gormet Restaurant"]
             ["Marina Modern Sushi"]
             ["Sunset Homestyle Grill"]
             ["Kyle's Low-Carb Grill"]
             ["Mission Homestyle Churros"]
             ["Sameer's Pizza Liquor Store"]]}
  (select-keys (:data (dataset geographical-tips
                        (run-query tips
                          (ql/fields $tips.venue.name)
                          (ql/order-by (ql/asc $id))
                          (ql/limit 10))))
               [:columns :rows]))


;;; Nested Field w/ ordering by aggregation
(datasets/expect-with-engines (engines-that-support :nested-fields)
  [["jane"           4]
   ["kyle"           5]
   ["tupac"          5]
   ["jessica"        6]
   ["bob"            7]
   ["lucky_pigeon"   7]
   ["joe"            8]
   ["mandy"          8]
   ["amy"            9]
   ["biggie"         9]
   ["sameer"         9]
   ["cam_saul"      10]
   ["rasta_toucan"  13]
   [nil            400]]
  (->> (dataset geographical-tips
         (run-query tips
           (ql/aggregation (ql/count))
           (ql/breakout $tips.source.mayor)
           (ql/order-by (ql/asc (ql/aggregate-field 0)))))
       rows (format-rows-by [identity int])))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                  NEW FILTER TYPES - CONTAINS, STARTS_WITH, ENDS_WITH                                 |
;;; +----------------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------------ STARTS_WITH ------------------------------------------------------------
(expect-with-non-timeseries-dbs
  [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
   [74 "Chez Jay"           2 34.0104 -118.493 2]]
  (-> (run-query venues
        (ql/filter (ql/starts-with $name "Che"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))


;;; ------------------------------------------------------------ ENDS_WITH ------------------------------------------------------------
(expect-with-non-timeseries-dbs
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  (-> (run-query venues
        (ql/filter (ql/ends-with $name "Restaurant"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; ------------------------------------------------------------ CONTAINS ------------------------------------------------------------
(expect-with-non-timeseries-dbs
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (-> (run-query venues
        (ql/filter (ql/contains $name "BBQ"))
        (ql/order-by (ql/asc $id)))
      rows formatted-venues-rows))

;;; ------------------------------------------------------------ Nested AND / OR ------------------------------------------------------------

(expect-with-non-timeseries-dbs
  [[81]]
  (->> (run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/and (ql/!= $price 3)
                            (ql/or (ql/= $price 1)
                                   (ql/= $price 2)))))
       rows (format-rows-by [int])))


;;; ------------------------------------------------------------ = / != with multiple values ------------------------------------------------------------

(expect-with-non-timeseries-dbs
  [[81]]
  (->> (run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/= $price 1 2)))
       rows (format-rows-by [int])))

(expect-with-non-timeseries-dbs
  [[19]]
  (->> (run-query venues
         (ql/aggregation (ql/count))
         (ql/filter (ql/!= $price 1 2)))
       rows (format-rows-by [int])))


;; +-------------------------------------------------------------------------------------------------------------+
;; |                                       DATE BUCKETING & RELATIVE DATES                                       |
;; +-------------------------------------------------------------------------------------------------------------+


;;; ------------------------------------------------------------ BUCKETING ------------------------------------------------------------

(defn- ->long-if-number [x]
  (if (number? x)
    (long x)
    x))

(defn- sad-toucan-incidents-with-bucketing [unit]
  (->> (with-db (get-or-create-database! defs/sad-toucan-incidents)
         (run-query incidents
           (ql/aggregation (ql/count))
           (ql/breakout (ql/datetime-field $timestamp unit))
           (ql/limit 10)))
       rows (format-rows-by [->long-if-number int])))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:31:00" 1]
     ["2015-06-01 16:06:00" 1]
     ["2015-06-01 17:23:00" 1]
     ["2015-06-01 18:55:00" 1]
     ["2015-06-01 21:04:00" 1]
     ["2015-06-01 21:19:00" 1]
     ["2015-06-02 02:13:00" 1]
     ["2015-06-02 05:37:00" 1]
     ["2015-06-02 08:20:00" 1]
     ["2015-06-02 11:11:00" 1]]

    (contains? #{:redshift :sqlserver :bigquery :mongo :postgres :h2 :oracle} *engine*)
    [["2015-06-01T10:31:00.000Z" 1]
     ["2015-06-01T16:06:00.000Z" 1]
     ["2015-06-01T17:23:00.000Z" 1]
     ["2015-06-01T18:55:00.000Z" 1]
     ["2015-06-01T21:04:00.000Z" 1]
     ["2015-06-01T21:19:00.000Z" 1]
     ["2015-06-02T02:13:00.000Z" 1]
     ["2015-06-02T05:37:00.000Z" 1]
     ["2015-06-02T08:20:00.000Z" 1]
     ["2015-06-02T11:11:00.000Z" 1]]

    :else
    [["2015-06-01T03:31:00.000Z" 1]
     ["2015-06-01T09:06:00.000Z" 1]
     ["2015-06-01T10:23:00.000Z" 1]
     ["2015-06-01T11:55:00.000Z" 1]
     ["2015-06-01T14:04:00.000Z" 1]
     ["2015-06-01T14:19:00.000Z" 1]
     ["2015-06-01T19:13:00.000Z" 1]
     ["2015-06-01T22:37:00.000Z" 1]
     ["2015-06-02T01:20:00.000Z" 1]
     ["2015-06-02T04:11:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :default))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:31:00" 1]
     ["2015-06-01 16:06:00" 1]
     ["2015-06-01 17:23:00" 1]
     ["2015-06-01 18:55:00" 1]
     ["2015-06-01 21:04:00" 1]
     ["2015-06-01 21:19:00" 1]
     ["2015-06-02 02:13:00" 1]
     ["2015-06-02 05:37:00" 1]
     ["2015-06-02 08:20:00" 1]
     ["2015-06-02 11:11:00" 1]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T10:31:00.000Z" 1]
     ["2015-06-01T16:06:00.000Z" 1]
     ["2015-06-01T17:23:00.000Z" 1]
     ["2015-06-01T18:55:00.000Z" 1]
     ["2015-06-01T21:04:00.000Z" 1]
     ["2015-06-01T21:19:00.000Z" 1]
     ["2015-06-02T02:13:00.000Z" 1]
     ["2015-06-02T05:37:00.000Z" 1]
     ["2015-06-02T08:20:00.000Z" 1]
     ["2015-06-02T11:11:00.000Z" 1]]

    :else
    [["2015-06-01T03:31:00.000Z" 1]
     ["2015-06-01T09:06:00.000Z" 1]
     ["2015-06-01T10:23:00.000Z" 1]
     ["2015-06-01T11:55:00.000Z" 1]
     ["2015-06-01T14:04:00.000Z" 1]
     ["2015-06-01T14:19:00.000Z" 1]
     ["2015-06-01T19:13:00.000Z" 1]
     ["2015-06-01T22:37:00.000Z" 1]
     ["2015-06-02T01:20:00.000Z" 1]
     ["2015-06-02T04:11:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :minute))

(expect-with-non-timeseries-dbs
  [[0 5]
   [1 4]
   [2 2]
   [3 4]
   [4 4]
   [5 3]
   [6 5]
   [7 1]
   [8 1]
   [9 1]]
  (sad-toucan-incidents-with-bucketing :minute-of-hour))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01 10:00:00" 1]
     ["2015-06-01 16:00:00" 1]
     ["2015-06-01 17:00:00" 1]
     ["2015-06-01 18:00:00" 1]
     ["2015-06-01 21:00:00" 2]
     ["2015-06-02 02:00:00" 1]
     ["2015-06-02 05:00:00" 1]
     ["2015-06-02 08:00:00" 1]
     ["2015-06-02 11:00:00" 1]
     ["2015-06-02 13:00:00" 1]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T10:00:00.000Z" 1]
     ["2015-06-01T16:00:00.000Z" 1]
     ["2015-06-01T17:00:00.000Z" 1]
     ["2015-06-01T18:00:00.000Z" 1]
     ["2015-06-01T21:00:00.000Z" 2]
     ["2015-06-02T02:00:00.000Z" 1]
     ["2015-06-02T05:00:00.000Z" 1]
     ["2015-06-02T08:00:00.000Z" 1]
     ["2015-06-02T11:00:00.000Z" 1]
     ["2015-06-02T13:00:00.000Z" 1]]

    :else
    [["2015-06-01T03:00:00.000Z" 1]
     ["2015-06-01T09:00:00.000Z" 1]
     ["2015-06-01T10:00:00.000Z" 1]
     ["2015-06-01T11:00:00.000Z" 1]
     ["2015-06-01T14:00:00.000Z" 2]
     ["2015-06-01T19:00:00.000Z" 1]
     ["2015-06-01T22:00:00.000Z" 1]
     ["2015-06-02T01:00:00.000Z" 1]
     ["2015-06-02T04:00:00.000Z" 1]
     ["2015-06-02T06:00:00.000Z" 1]])
  (sad-toucan-incidents-with-bucketing :hour))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[0 13] [1 8] [2 4] [3  7] [4  5] [5 13] [6 10] [7 8] [8 9] [9 7]]
    [[0  8] [1 9] [2 7] [3 10] [4 10] [5  9] [6  6] [7 5] [8 7] [9 7]])
  (sad-toucan-incidents-with-bucketing :hour-of-day))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-06-01"  6]
     ["2015-06-02" 10]
     ["2015-06-03"  4]
     ["2015-06-04"  9]
     ["2015-06-05"  9]
     ["2015-06-06"  8]
     ["2015-06-07"  8]
     ["2015-06-08"  9]
     ["2015-06-09"  7]
     ["2015-06-10"  9]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-06-01T00:00:00.000Z"  6]
     ["2015-06-02T00:00:00.000Z" 10]
     ["2015-06-03T00:00:00.000Z"  4]
     ["2015-06-04T00:00:00.000Z"  9]
     ["2015-06-05T00:00:00.000Z"  9]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  8]
     ["2015-06-08T00:00:00.000Z"  9]
     ["2015-06-09T00:00:00.000Z"  7]
     ["2015-06-10T00:00:00.000Z"  9]]

    :else
    [["2015-06-01T00:00:00.000Z"  8]
     ["2015-06-02T00:00:00.000Z"  9]
     ["2015-06-03T00:00:00.000Z"  9]
     ["2015-06-04T00:00:00.000Z"  4]
     ["2015-06-05T00:00:00.000Z" 11]
     ["2015-06-06T00:00:00.000Z"  8]
     ["2015-06-07T00:00:00.000Z"  6]
     ["2015-06-08T00:00:00.000Z" 10]
     ["2015-06-09T00:00:00.000Z"  6]
     ["2015-06-10T00:00:00.000Z" 10]])
  (sad-toucan-incidents-with-bucketing :day))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]]
    [[1 29] [2 36] [3 33] [4 29] [5 13] [6 38] [7 22]])
  (sad-toucan-incidents-with-bucketing :day-of-week))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[1  6] [2 10] [3  4] [4  9] [5  9] [6  8] [7  8] [8  9] [9  7] [10  9]]
    [[1  8] [2  9] [3  9] [4  4] [5 11] [6  8] [7  6] [8 10] [9  6] [10 10]])
  (sad-toucan-incidents-with-bucketing :day-of-month))

(expect-with-non-timeseries-dbs
  (if (i/has-questionable-timezone-support? *driver*)
    [[152  6] [153 10] [154  4] [155  9] [156  9] [157  8] [158  8] [159  9] [160  7] [161  9]]
    [[152  8] [153  9] [154  9] [155  4] [156 11] [157  8] [158  6] [159 10] [160  6] [161 10]])
  (sad-toucan-incidents-with-bucketing :day-of-year))

(expect-with-non-timeseries-dbs
  (cond
    (contains? #{:sqlite :crate} *engine*)
    [["2015-05-31" 46]
     ["2015-06-07" 47]
     ["2015-06-14" 40]
     ["2015-06-21" 60]
     ["2015-06-28" 7]]

    (i/has-questionable-timezone-support? *driver*)
    [["2015-05-31T00:00:00.000Z" 46]
     ["2015-06-07T00:00:00.000Z" 47]
     ["2015-06-14T00:00:00.000Z" 40]
     ["2015-06-21T00:00:00.000Z" 60]
     ["2015-06-28T00:00:00.000Z" 7]]

    :else
    [["2015-05-31T00:00:00.000Z" 49]
     ["2015-06-07T00:00:00.000Z" 47]
     ["2015-06-14T00:00:00.000Z" 39]
     ["2015-06-21T00:00:00.000Z" 58]
     ["2015-06-28T00:00:00.000Z" 7]])
  (sad-toucan-incidents-with-bucketing :week))

(expect-with-non-timeseries-dbs
  ;; Not really sure why different drivers have different opinions on these </3
  (cond
    (contains? #{:sqlserver :sqlite :crate :oracle} *engine*)
    [[23 54] [24 46] [25 39] [26 61]]

    (contains? #{:mongo :redshift :bigquery :postgres :h2} *engine*)
    [[23 46] [24 47] [25 40] [26 60] [27 7]]

    :else
    [[23 49] [24 47] [25 39] [26 58] [27 7]])
  (sad-toucan-incidents-with-bucketing :week-of-year))

(expect-with-non-timeseries-dbs
  [[(if (contains? #{:sqlite :crate} *engine*) "2015-06-01", "2015-06-01T00:00:00.000Z") 200]]
  (sad-toucan-incidents-with-bucketing :month))

(expect-with-non-timeseries-dbs
  [[6 200]]
  (sad-toucan-incidents-with-bucketing :month-of-year))

(expect-with-non-timeseries-dbs
  [[(if (contains? #{:sqlite :crate} *engine*) "2015-04-01", "2015-04-01T00:00:00.000Z") 200]]
  (sad-toucan-incidents-with-bucketing :quarter))

(expect-with-non-timeseries-dbs
  [[2 200]]
  (sad-toucan-incidents-with-bucketing :quarter-of-year))

(expect-with-non-timeseries-dbs
  [[2015 200]]
  (sad-toucan-incidents-with-bucketing :year))

;; RELATIVE DATES
(defn- database-def-with-timestamps [interval-seconds]
  (create-database-definition (str "a-checkin-every-" interval-seconds "-seconds")
    ["checkins"
     [{:field-name "timestamp"
       :base-type  :DateTimeField}]
     (vec (for [i (range -15 15)]
            ;; Create timestamps using relative dates (e.g. `DATEADD(second, -195, GETUTCDATE())` instead of generating `java.sql.Timestamps` here so
            ;; they'll be in the DB's native timezone. Some DBs refuse to use the same timezone we're running the tests from *cough* SQL Server *cough*
            [(u/prog1 (driver/date-interval *driver* :second (* i interval-seconds))
               (assert <>))]))]))

(def ^:private checkins:4-per-minute (partial database-def-with-timestamps 15))
(def ^:private checkins:4-per-hour   (partial database-def-with-timestamps (* 60 15)))
(def ^:private checkins:1-per-day    (partial database-def-with-timestamps (* 60 60 24)))

(defn- count-of-grouping [db field-grouping & relative-datetime-args]
  (-> (with-temp-db [_ db]
        (run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/= (ql/datetime-field $timestamp field-grouping)
                           (apply ql/relative-datetime relative-datetime-args)))))
      first-row first int))

;; HACK - Don't run these tests against BigQuery because the databases need to be loaded every time the tests are ran and loading data into BigQuery is mind-bogglingly slow.
;;        Don't worry, I promise these work though!

(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-minute) :minute "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-minute) :minute -1 "minute"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-minute) :minute  1 "minute"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour -1 "hour"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 4 (count-of-grouping (checkins:4-per-hour) :hour  1 "hour"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day "current"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day -1 "day"))
(expect-with-non-timeseries-dbs-except #{:bigquery} 1 (count-of-grouping (checkins:1-per-day) :day  1 "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery} 7 (count-of-grouping (checkins:1-per-day) :week "current"))

;; SYNTACTIC SUGAR
(expect-with-non-timeseries-dbs-except #{:bigquery}
  1
  (-> (with-temp-db [_ (checkins:1-per-day)]
        (run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/time-interval $timestamp :current :day))))
      first-row first int))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  7
  (-> (with-temp-db [_ (checkins:1-per-day)]
        (run-query checkins
          (ql/aggregation (ql/count))
          (ql/filter (ql/time-interval $timestamp :last :week))))
      first-row first int))

;; Make sure that when referencing the same field multiple times with different units we return the one
;; that actually reflects the units the results are in.
;; eg when we breakout by one unit and filter by another, make sure the results and the col info
;; use the unit used by breakout
(defn- date-bucketing-unit-when-you [& {:keys [breakout-by filter-by]}]
  (let [results (with-temp-db [_ (checkins:1-per-day)]
                  (run-query checkins
                    (ql/aggregation (ql/count))
                    (ql/breakout (ql/datetime-field $timestamp breakout-by))
                    (ql/filter (ql/time-interval $timestamp :current filter-by))))]
    {:rows (or (-> results :row_count)
               (throw (ex-info "Query failed!" results)))
     :unit (-> results :data :cols first :unit)}))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 7, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "week"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :week}
  (date-bucketing-unit-when-you :breakout-by "week", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :quarter}
  (date-bucketing-unit-when-you :breakout-by "quarter", :filter-by "day"))

(expect-with-non-timeseries-dbs-except #{:bigquery}
  {:rows 1, :unit :hour}
  (date-bucketing-unit-when-you :breakout-by "hour", :filter-by "day"))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                                      NOT FILTER                                                      |
;;; +----------------------------------------------------------------------------------------------------------------------+

;; `not` filter -- Test that we can negate the various other filter clauses
;; The majority of these tests aren't necessary since `not` automatically translates them to simpler, logically equivalent expressions
;; but I already wrote them so in this case it doesn't hurt to have a little more test coverage than we need
;; TODO - maybe it makes sense to have a separate namespace to test the Query eXpander so we don't need to run all these extra queries?

;;; =
(expect-with-non-timeseries-dbs [99] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/= $id 1)))))))

;;; !=
(expect-with-non-timeseries-dbs [1] (first-row
                                      (format-rows-by [int]
                                        (run-query venues
                                          (ql/aggregation (ql/count))
                                          (ql/filter (ql/not (ql/!= $id 1)))))))
;;; <
(expect-with-non-timeseries-dbs [61] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/< $id 40)))))))

;;; >
(expect-with-non-timeseries-dbs [40] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/> $id 40)))))))

;;; <=
(expect-with-non-timeseries-dbs [60] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/<= $id 40)))))))

;;; >=
(expect-with-non-timeseries-dbs [39] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/>= $id 40)))))))

;;; is-null
(expect-with-non-timeseries-dbs [100] (first-row
                                        (format-rows-by [int]
                                          (run-query venues
                                            (ql/aggregation (ql/count))
                                            (ql/filter (ql/not (ql/is-null $id)))))))

;;; between
(expect-with-non-timeseries-dbs [89] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/between $id 30 40)))))))

;;; inside
(expect-with-non-timeseries-dbs [39] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/inside $latitude $longitude 40 -120 30 -110)))))))

;;; starts-with
(expect-with-non-timeseries-dbs [80] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/starts-with $name "T")))))))

;;; contains
(expect-with-non-timeseries-dbs [97] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/contains $name "BBQ")))))))

;;; does-not-contain
;; This should literally be the exact same query as the one above by the time it leaves the Query eXpander, so this is more of a QX test than anything else
(expect-with-non-timeseries-dbs [97] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/does-not-contain $name "BBQ"))))))

;;; ends-with
(expect-with-non-timeseries-dbs [87] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/ends-with $name "a")))))))

;;; and
(expect-with-non-timeseries-dbs [98] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/and (ql/> $id 32)
                                                                      (ql/contains $name "BBQ"))))))))
;;; or
(expect-with-non-timeseries-dbs [31] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/or (ql/> $id 32)
                                                                     (ql/contains $name "BBQ"))))))))

;;; nested and/or
(expect-with-non-timeseries-dbs [96] (first-row
                                       (format-rows-by [int]
                                         (run-query venues
                                           (ql/aggregation (ql/count))
                                           (ql/filter (ql/not (ql/or (ql/and (ql/> $id 32)
                                                                             (ql/< $id 35))
                                                                     (ql/contains $name "BBQ"))))))))

;;; nested not
(expect-with-non-timeseries-dbs [3] (first-row
                                      (format-rows-by [int]
                                        (run-query venues
                                          (ql/aggregation (ql/count))
                                          (ql/filter (ql/not (ql/not (ql/contains $name "BBQ"))))))))

;;; not nested inside and/or
(expect-with-non-timeseries-dbs [1] (first-row
                                      (format-rows-by [int]
                                        (run-query venues
                                          (ql/aggregation (ql/count))
                                          (ql/filter (ql/and (ql/not (ql/> $id 32))
                                                             (ql/contains $name "BBQ")))))))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                                      MIN & MAX                                                       |
;;; +----------------------------------------------------------------------------------------------------------------------+

(expect-with-non-timeseries-dbs [1] (first-row
                                      (format-rows-by [int]
                                        (run-query venues
                                          (ql/aggregation (ql/min $price))))))

(expect-with-non-timeseries-dbs [4] (first-row
                                      (format-rows-by [int]
                                        (run-query venues
                                          (ql/aggregation (ql/max $price))))))

(expect-with-non-timeseries-dbs
  [[1 34.0071] [2 33.7701] [3 10.0646] [4 33.983]]
  (format-rows-by [int (partial u/round-to-decimals 4)]
    (rows (run-query venues
            (ql/aggregation (ql/min $latitude))
            (ql/breakout $price)))))

(expect-with-non-timeseries-dbs
  [[1 37.8078] [2 40.7794] [3 40.7262] [4 40.7677]]
  (format-rows-by [int (partial u/round-to-decimals 4)]
    (rows (run-query venues
            (ql/aggregation (ql/max $latitude))
            (ql/breakout $price)))))


;;; +----------------------------------------------------------------------------------------------------------------------+
;;; |                                                     EXPRESSIONS                                                      |
;;; +----------------------------------------------------------------------------------------------------------------------+

;; Test the expansion of the expressions clause
(expect
  {:expressions {:my-cool-new-field (qpi/map->Expression {:operator :*
                                                          :args [{:field-id 10, :fk-field-id nil, :datetime-unit nil}
                                                                 20.0]})}}                                            ; 20 should be converted to a FLOAT
  (ql/expressions {} {:my-cool-new-field (ql/* (ql/field-id 10) 20)}))


;; Do a basic query including an expression
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"                 4  10.0646 -165.374 3 5.0]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2 4.0]
   [3 "The Apple Pan"                11 34.0406 -118.428 2 4.0]
   [4 "Wurstküche"                   29 33.9997 -118.465 2 4.0]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2 4.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (run-query venues
            (ql/expressions {:my-cool-new-field (ql/+ $price 2)})
            (ql/limit 5)
            (ql/order-by (ql/asc $id))))))

;; Make sure FLOATING POINT division is done
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 1.5]     ; 3 / 2 SHOULD BE 1.5, NOT 1 (!)
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (run-query venues
            (ql/expressions {:my-cool-new-field (ql// $price 2)})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we do NESTED EXPRESSIONS ?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 3.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 2.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (run-query venues
            (ql/expressions {:wow (ql/- (ql/* $price 2) (ql/+ $price 0))})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we have MULTIPLE EXPRESSIONS?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[1 "Red Medicine"           4 10.0646 -165.374 3 2.0 4.0]
   [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 1.0 3.0]
   [3 "The Apple Pan"         11 34.0406 -118.428 2 1.0 3.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float float]
    (rows (run-query venues
            (ql/expressions {:x (ql/- $price 1)
                             :y (ql/+ $price 1)})
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we refer to expressions inside a FIELDS clause?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[4] [4] [5]]
  (format-rows-by [int]
    (rows (run-query venues
            (ql/expressions {:x (ql/+ $price $id)})
            (ql/fields (ql/expression :x))
            (ql/limit 3)
            (ql/order-by (ql/asc $id))))))

;; Can we refer to expressions inside an ORDER BY clause?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[100 "Mohawk Bend"         46 34.0777 -118.265 2 102.0]
   [99  "Golden Road Brewing" 10 34.1505 -118.274 2 101.0]
   [98  "Lucky Baldwin's Pub"  7 34.1454 -118.149 2 100.0]]
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int float]
    (rows (run-query venues
            (ql/expressions {:x (ql/+ $price $id)})
            (ql/limit 3)
            (ql/order-by (ql/desc (ql/expression :x)))))))

;; Can we AGGREGATE + BREAKOUT by an EXPRESSION?
(datasets/expect-with-engines (engines-that-support :expressions)
  [[2 22] [4 59] [6 13] [8 6]]
  (format-rows-by [int int]
    (rows (run-query venues
            (ql/expressions {:x (ql/* $price 2.0)})
            (ql/aggregation (ql/count))
            (ql/breakout (ql/expression :x))))))


;;; CAN WE JOIN AGAINST THE SAME TABLE TWICE (MULTIPLE FKS TO A SINGLE TABLE!?)
;; Query should look something like:
;; SELECT USERS__via__SENDER_ID.NAME AS NAME, count(*) AS count
;; FROM PUBLIC.MESSAGES
;; LEFT JOIN PUBLIC.USERS USERS__via__RECIEVER_ID
;;   ON PUBLIC.MESSAGES.RECIEVER_ID = USERS__via__RECIEVER_ID.ID
;; LEFT JOIN PUBLIC.USERS USERS__via__SENDER_ID
;;   ON PUBLIC.MESSAGES.SENDER_ID = USERS__via__SENDER_ID.ID
;; WHERE USERS__via__RECIEVER_ID.NAME = 'Rasta Toucan'
;; GROUP BY USERS__via__SENDER_ID.NAME
;; ORDER BY USERS__via__SENDER_ID.NAME ASC
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  [["Bob the Sea Gull" 2]
   ["Brenda Blackbird" 2]
   ["Lucky Pigeon"     2]
   ["Peter Pelican"    5]
   ["Ronald Raven"     1]]
  (dataset avian-singles
    (format-rows-by [str int]
      (rows (run-query messages
              (ql/aggregation (ql/count))
              (ql/breakout $sender_id->users.name)
              (ql/filter (ql/= $reciever_id->users.name "Rasta Toucan")))))))
