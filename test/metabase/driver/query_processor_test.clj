(ns metabase.driver.query-processor-test
  "Query processing tests that can be ran between any of the available drivers, and should give the same results."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.set :as set]
            [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets :refer [*data-loader* *engine*]]
                                [interface :refer [create-database-definition], :as i])
            [metabase.test.data :refer :all]
            [metabase.test.util.q :refer [Q]]
            [metabase.util :as u]))


;; ## Dataset-Independent QP Tests

;; ### Helper Fns + Macros

(defn- engines-that-support [feature]
  (set (filter (fn [engine]
                 (contains? (driver/features (driver/engine->driver engine)) feature))
               datasets/all-valid-engines)))

(defn- engines-that-dont-support [feature]
  (set/difference datasets/all-valid-engines (engines-that-support feature)))

(defmacro ^:private qp-expect-with-all-engines [data q-form & post-process-fns]
  `(datasets/expect-with-all-engines
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
   :preview_display true
   :schema_name     (default-schema)})

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
            :display_name "Id"}
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
                  :display_name "Id"}
     :name       {:special_type :category
                  :base_type    (expected-base-type->actual :TextField)
                  :name         (format-name "name")
                  :display_name "Name"}
     :last_login {:special_type :category
                  :base_type    (expected-base-type->actual :DateTimeField)
                  :name         (format-name "last_login")
                  :display_name "Last Login"
                  :unit         :day})))

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
                   :display_name "Id"}
     :category_id {:extra_info   (if (fks-supported?) {:target_table_id (id :categories)}
                                     {})
                   :target       (if (fks-supported?) (-> (categories-col :id)
                                                          (dissoc :target :extra_info :schema_name))
                                     nil)
                   :special_type (if (fks-supported?) :fk
                                     :category)
                   :base_type    (expected-base-type->actual :IntegerField)
                   :name         (format-name "category_id")
                   :display_name "Category Id"}
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
                :display_name "Id"}
     :venue_id {:extra_info   (if (fks-supported?) {:target_table_id (id :venues)}
                                  {})
                :target       (if (fks-supported?) (-> (venues-col :id)
                                                       (dissoc :target :extra_info :schema_name))
                                  nil)
                :special_type (when (fks-supported?)
                                :fk)
                :base_type    (expected-base-type->actual :IntegerField)
                :name         (format-name "venue_id")
                :display_name "Venue Id"}
     :user_id  {:extra_info   (if (fks-supported?) {:target_table_id (id :users)}
                                  {})
                :target       (if (fks-supported?) (-> (users-col :id)
                                                       (dissoc :target :extra_info :schema_name))
                                  nil)
                :special_type (if (fks-supported?) :fk
                                  :category)
                :base_type    (expected-base-type->actual :IntegerField)
                :name         (format-name "user_id")
                :display_name "User Id"})))


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
              :extra_info   {}
              :target       nil}))
  ([ag-col-kw {:keys [base_type special_type]}]
   {:pre [base_type special_type]}
   {:base_type    base_type
    :special_type special_type
    :id           nil
    :table_id     nil
    :description  nil
    :extra_info   {}
    :target       nil
    :name         (case ag-col-kw
                    :avg    "avg"
                    :stddev "stddev"
                    :sum    "sum")
    :display_name (case ag-col-kw
                    :avg    "avg"
                    :stddev "stddev"
                    :sum    "sum")}))

(defn- format-rows-by
  "Format the values in result ROWS with the fns at the corresponding indecies in FORMAT-FNS.
   ROWS can be a sequence or any of the common map formats we expect in QP tests.

     (format-rows-by [int str double] [[1 1 1]]) -> [[1 \"1\" 1.0]]

   By default, does't call fns on `nil` values; pass a truthy value as optional param FORMAT-NIL-VALUES? to override this behavior."
  ([format-fns rows]
   (format-rows-by format-fns (not :format-nil-values?) rows))
  ([format-fns format-nil-values? rows]
   (cond
     (:data rows) (update-in rows [:data :rows] (partial format-rows-by format-fns))
     (:rows rows) (update    rows :rows         (partial format-rows-by format-fns))
     :else        (vec (for [row rows]
                         (vec (for [[f v] (partition 2 (interleave format-fns row))]
                                (when (or v format-nil-values?)
                                  (f v)))))))))

(def ^:private formatted-venues-rows (partial format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]))


;; # THE TESTS THEMSELVES (!)

;; structured-query?
(expect false (structured-query? {}))
(expect false (structured-query? {:type "native"}))
(expect true  (structured-query? {:type "query"}))

;; rows-query-without-limits?
(expect false (rows-query-without-limits? {:query {:aggregation {:aggregation-type :count}}}))
(expect true  (rows-query-without-limits? {:query {:aggregation {:aggregation-type :rows}}}))
(expect false (rows-query-without-limits? {:query {:aggregation {:aggregation-type :count}
                                                   :limit       10}}))
(expect false (rows-query-without-limits? {:query {:aggregation {:aggregation-type :count}
                                                   :page        1}}))

;; ### "COUNT" AGGREGATION

(qp-expect-with-all-engines
    {:rows    [[100]]
     :columns ["count"]
     :cols    [(aggregate-col :count)]}
  (Q aggregate count of venues
     return (format-rows-by [int])))


;; ### "SUM" AGGREGATION
(qp-expect-with-all-engines
    {:rows    [[203]]
     :columns ["sum"]
     :cols    [(aggregate-col :sum (venues-col :price))]}
  (Q aggregate sum price of venues
     return (format-rows-by [int])))


;; ## "AVG" AGGREGATION
(qp-expect-with-all-engines
    {:rows    [[35.5059]]
     :columns ["avg"]
     :cols    [(aggregate-col :avg (venues-col :latitude))]}
  (Q aggregate avg latitude of venues
     return (format-rows-by [(partial u/round-to-decimals 4)])))


;; ### "DISTINCT COUNT" AGGREGATION
(qp-expect-with-all-engines
    {:rows    [[15]]
     :columns ["count"]
     :cols    [(aggregate-col :count)]}
  (Q aggregate distinct user_id of checkins
     return (format-rows-by [int])))


;; ## "ROWS" AGGREGATION
;; Test that a rows aggregation just returns rows as-is.
(qp-expect-with-all-engines
    {:rows    [[ 1 "Red Medicine"                  4 10.0646 -165.374 3]
               [ 2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
               [ 3 "The Apple Pan"                11 34.0406 -118.428 2]
               [ 4 "Wurstküche"                   29 33.9997 -118.465 2]
               [ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
               [ 6 "The 101 Coffee Shop"          20 34.1054 -118.324 2]
               [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
               [ 8 "25°"                          11 34.1015 -118.342 2]
               [ 9 "Krua Siri"                    71 34.1018 -118.301 1]
               [10 "Fred 62"                      20 34.1046 -118.292 2]]
     :columns (venues-columns)
     :cols    (venues-cols)}
  (Q aggregate rows of venues
     limit 10
     order id+
     return formatted-venues-rows))


;; ## "PAGE" CLAUSE
;; Test that we can get "pages" of results.

;; ### PAGE - Get the first page
(datasets/expect-with-all-engines
    [[1 "African"]
     [2 "American"]
     [3 "Artisan"]
     [4 "Asian"]
     [5 "BBQ"]]
    (Q aggregate rows of categories
       return rows (format-rows-by [int str])
       page 1 items 5
       order id+))

;; ### PAGE - Get the second page
(datasets/expect-with-all-engines
    [[ 6 "Bakery"]
     [ 7 "Bar"]
     [ 8 "Beer Garden"]
     [ 9 "Breakfast / Brunch"]
     [10 "Brewery"]]
    (Q aggregate rows of categories
       page 2 items 5
       order id+
       return rows (format-rows-by [int str])))


;; ## "ORDER_BY" CLAUSE
;; Test that we can tell the Query Processor to return results ordered by multiple fields
(datasets/expect-with-all-engines
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
  (Q aggregate rows of checkins
     fields venue_id user_id id
     order venue_id+ user_id- id+
     limit 10
     return rows (format-rows-by [int int int])))


;; ## "FILTER" CLAUSE

;; ### FILTER -- "AND", ">", ">="
(datasets/expect-with-all-engines
  [[55 "Dal Rae Restaurant"       67 33.983  -118.096 4]
   [61 "Lawry's The Prime Rib"    67 34.0677 -118.376 4]
   [77 "Sushi Nakazawa"           40 40.7318 -74.0045 4]
   [79 "Sushi Yasuda"             40 40.7514 -73.9736 4]
   [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  (Q aggregate rows of venues
     filter and > id 50, >= price 4
     order id+
     return rows formatted-venues-rows))

(defmacro compaare [a b]
  `(compare-expr ~a ~b '~a '~b))

;; ### FILTER -- "AND", "<", ">", "!="
(datasets/expect-with-all-engines
  [[21 "PizzaHacker"          58 37.7441 -122.421 2]
   [23 "Taqueria Los Coyotes" 50 37.765  -122.42  2]]
  (Q aggregate rows of venues
     filter and < id 24, > id 20, != id 22
     order id+
     return rows formatted-venues-rows))

;; ### FILTER WITH A FALSE VALUE
;; Check that we're checking for non-nil values, not just logically true ones.
;; There's only one place (out of 3) that I don't like
(datasets/expect-with-all-engines
  [[1]]
 (Q dataset places-cam-likes
    return rows (format-rows-by [int])
    aggregate count of places
    filter = liked false))

(defn- ->bool [x] ; SQLite returns 0/1 for false/true;
  (condp = x      ; Redshift returns nil/true.
    0   false     ; convert to false/true and restore sanity.
    1   true
    nil false
    x))

;;; filter = true
(datasets/expect-with-all-engines
  [[1 true "Tempest"]
   [2 true "Bullit"]]
  (Q dataset places-cam-likes
     aggregate rows of places
     filter = liked true, order id+
     return rows (format-rows-by [int ->bool str] :format-nil-values)))

;;; filter != false
(datasets/expect-with-all-engines
  [[1 true "Tempest"]
   [2 true "Bullit"]]
  (Q dataset places-cam-likes
     aggregate rows of places
     filter != liked false, order id+
     return rows (format-rows-by [int ->bool str] :format-nil-values)))

;;; filter != true
(datasets/expect-with-all-engines
  [[3 false "The Dentist"]]
  (Q dataset places-cam-likes
     aggregate rows of places
     filter != liked true, order id+
     return rows (format-rows-by [int ->bool str] :format-nil-values)))


;; ### FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(datasets/expect-with-all-engines
  [[21 "PizzaHacker"    58 37.7441 -122.421 2]
   [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
  (Q aggregate rows of venues
     return rows formatted-venues-rows
     filter between id 21 22
     order id+))

;; ### FILTER -- "BETWEEN" with dates
(qp-expect-with-all-engines
    {:rows    [[29]]
     :columns ["count"]
     :cols    [(aggregate-col :count)]}
  (Q aggregate count of checkins
     filter and between date "2015-04-01" "2015-05-01"
     return (format-rows-by [int])))

;; ### FILTER -- "OR", "<=", "="
(datasets/expect-with-all-engines
  [[1 "Red Medicine"                  4 10.0646 -165.374 3]
   [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
   [3 "The Apple Pan"                11 34.0406 -118.428 2]
   [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  (Q aggregate rows of venues
     filter or <= id 3 = id 5
     order id+
     return rows formatted-venues-rows))

;; ### FILTER -- "INSIDE"
(datasets/expect-with-all-engines
  [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  (Q aggregate rows of venues
     filter inside {:lat {:field latitude,  :min 10.0641,  :max 10.0649}
                    :lon {:field longitude, :min -165.379, :max -165.371}}
     return rows formatted-venues-rows))


;; ## "FIELDS" CLAUSE
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
               (venues-col :id)]}
  (Q aggregate rows of venues
     return (format-rows-by [str int])
     fields name id
     limit 10
     order id+))


;; ## "BREAKOUT"
;; ### "BREAKOUT" - SINGLE COLUMN
(qp-expect-with-all-engines
    {:rows    [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
     :columns [(format-name "user_id")
               "count"]
     :cols    [(checkins-col :user_id)
               (aggregate-col :count)]}
  (Q aggregate count of checkins
     return (format-rows-by [int int])
     breakout user_id
     order user_id+))

;; ### BREAKOUT w/o AGGREGATION
;; This should act as a "distinct values" query and return ordered results
(qp-expect-with-all-engines
    {:cols    [(checkins-col :user_id)]
     :columns [(format-name "user_id")]
     :rows    [[1] [2] [3] [4] [5] [6] [7] [8] [9] [10]]}
  (Q breakout user_id of checkins
     return (format-rows-by [int])
     limit 10))


;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(qp-expect-with-all-engines
    {:rows    [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]]
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols    [(checkins-col :user_id)
               (checkins-col :venue_id)
               (aggregate-col :count)]}
  (Q aggregate count of checkins
     return (format-rows-by [int int int])
     breakout user_id venue_id
     limit 10))

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(qp-expect-with-all-engines
    {:rows    [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]],
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols    [(checkins-col :user_id)
               (checkins-col :venue_id)
               (aggregate-col :count)]}
  (Q aggregate count of checkins
     return (format-rows-by [int int int])
     breakout user_id venue_id
     order user_id- venue_id+
     limit 10))




;; # POST PROCESSING TESTS

;; ## LIMIT-MAX-RESULT-ROWS
;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `absolute-max-results`
(expect absolute-max-results
  (->> ((@(resolve 'metabase.driver.query-processor/limit) identity) {:rows (repeat [:ok])})
       :rows
       count))

;; Apply an arbitrary max-results on the query and ensure our results size is appropriately constrained
(expect 1234
  (->> (((resolve 'metabase.driver.query-processor/limit) identity) {:constraints {:max-results 1234}
                                                                     :query       {:aggregation {:aggregation-type :count}}
                                                                     :rows        (repeat [:ok])})
       :rows
       count))

;; Apply a max-results-bare-rows limit specifically on :rows type query
(expect [46 46]
  (let [res (((resolve 'metabase.driver.query-processor/limit) identity) {:constraints {:max-results 46}
                                                                          :query       {:aggregation {:aggregation-type :rows}}
                                                                          :rows        (repeat [:ok])})]
    [(->> res :rows count)
     (->> res :query :limit)]))


;; ## CUMULATIVE SUM

;; ### cum_sum w/o breakout should be treated the same as sum
(qp-expect-with-all-engines
    {:rows    [[120]]
     :columns ["sum"]
     :cols    [(aggregate-col :sum (users-col :id))]}
  (Q aggregate cum-sum id of users
     return (format-rows-by [int])))


;; ### Simple cumulative sum where breakout field is same as cum_sum field
(qp-expect-with-all-engines
    {:rows    [[1] [3] [6] [10] [15] [21] [28] [36] [45] [55] [66] [78] [91] [105] [120]]
     :columns (->columns "id")
     :cols    [(users-col :id)]}
  (Q aggregate cum-sum id of users
     breakout id
     return (format-rows-by [int])))


;; ### Cumulative sum w/ a different breakout field
(qp-expect-with-all-engines
    {:rows    [["Broen Olujimi"        14]
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
     :columns [(format-name "name")
               "sum"]
     :cols    [(users-col :name)
               (aggregate-col :sum (users-col :id))]}
  (Q aggregate cum-sum id of users
     breakout name
     return (format-rows-by [str int])))


;; ### Cumulative sum w/ a different breakout field that requires grouping
(qp-expect-with-all-engines
    {:columns [(format-name "price")
               "sum"]
     :cols    [(venues-col :price)
               (aggregate-col :sum (venues-col :id))]
     :rows    [[1 1211]
               [2 4066]
               [3 4681]
               [4 5050]]}
  (Q aggregate cum-sum id of venues
     breakout price
     return (format-rows-by [int int])))


;;; ## STDDEV AGGREGATION
;;; SQL-Only for the time being

;; ## "STDDEV" AGGREGATION
(qp-expect-with-engines (engines-that-support :standard-deviation-aggregations)
  {:columns ["stddev"]
   :cols    [(aggregate-col :stddev (venues-col :latitude))]
   :rows    [[3.4]]}
  (-> (Q aggregate stddev latitude of venues)
      (update-in [:data :rows] (fn [[[v]]]
                                 [[(u/round-to-decimals 1 v)]]))))

;; Make sure standard deviation fails for the Mongo driver since its not supported
(datasets/expect-with-engines (engines-that-dont-support :standard-deviation-aggregations)
  {:status :failed
   :error  "standard-deviation-aggregations is not supported by this driver."}
  (select-keys (Q aggregate stddev latitude of venues) [:status :error]))


;;; ## order_by aggregate fields (SQL-only for the time being)

;;; ### order_by aggregate ["count"]
(qp-expect-with-all-engines
  {:columns [(format-name "price")
             "count"]
   :rows    [[4  6]
             [3 13]
             [1 22]
             [2 59]]
   :cols    [(venues-col :price)
             (aggregate-col :count)]}
  (Q aggregate count of venues
     breakout price
     order ag.0+
     return (format-rows-by [int int])))


;;; ### order_by aggregate ["sum" field-id]
(qp-expect-with-all-engines
  {:columns [(format-name "price")
             "sum"]
   :rows    [[2 2855]
             [1 1211]
             [3  615]
             [4  369]]
   :cols    [(venues-col :price)
             (aggregate-col :sum (venues-col :id))]}
  (Q aggregate sum id of venues
     breakout price
     order ag.0-
     return (format-rows-by [int int])))


;;; ### order_by aggregate ["distinct" field-id]
(qp-expect-with-all-engines
  {:columns [(format-name "price")

             "count"]
   :rows    [[4  6]
             [3 13]
             [1 22]
             [2 59]]
   :cols    [(venues-col :price)
             (aggregate-col :count)]}
  (Q aggregate distinct id of venues
     breakout price
     order ag.0+
     return (format-rows-by [int int])))


;;; ### order_by aggregate ["avg" field-id]
(datasets/expect-with-all-engines
  {:columns [(format-name "price")
             "avg"]
   :rows    [[3 22]
             [2 28]
             [1 32]
             [4 53]]
   :cols    [(venues-col :price)
             (aggregate-col :avg (venues-col :category_id))]}
  (Q aggregate avg category_id of venues
     breakout price
     order ag.0+
     return :data (format-rows-by [int int])))

;;; ### order_by aggregate ["stddev" field-id]
;; MySQL has a nasty tendency to return different results on different systems so just round everything to the nearest int.
;; It also seems to give slightly different results than less-sucky DBs as evidenced below
(datasets/expect-with-engines (engines-that-support :standard-deviation-aggregations)
  {:columns [(format-name "price")
             "stddev"]
   :rows    [[3 (if (= *engine* :mysql) 25 26)]
             [1 24]
             [2 21]
             [4 (if (= *engine* :mysql) 14 15)]]
   :cols    [(venues-col :price)
             (aggregate-col :stddev (venues-col :category_id))]}
  (-> (Q aggregate stddev category_id of venues
         breakout price
         order ag.0-
         return :data (format-rows-by [int (comp int math/round)]))))

;;; ### make sure that rows where preview_display = false are included and properly marked up
(datasets/expect-with-all-engines
 [(set (venues-cols))
  #{(venues-col :category_id)
    (venues-col :name)
    (venues-col :latitude)
    (venues-col :id)
    (venues-col :longitude)
    (-> (venues-col :price)
        (assoc :preview_display false))}
  (set (venues-cols))]
 (let [get-col-names (fn [] (Q aggregate rows of venues
                               order id+
                               limit 1
                               return :data :cols set))]
   [(get-col-names)
    (do (upd Field (id :venues :price) :preview_display false)
        (get-col-names))
    (do (upd Field (id :venues :price) :preview_display true)
        (get-col-names))]))


;;; ## :sensitive fields
;;; Make sure :sensitive information fields are never returned by the QP
(qp-expect-with-all-engines
    {:columns (->columns "id" "last_login" "name")
     :cols    [(users-col :id)
               (users-col :last_login)
               (users-col :name)],
     :rows    [[ 1 "Plato Yeshua"]
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
               [15 "Rüstem Hebel"]]}
  ;; Filter out the timestamps from the results since they're hard to test :/
  (-> (Q aggregate rows of users
         order id+)
      (update-in [:data :rows] (partial mapv (fn [[id last-login name]]
                                               [(int id) name])))))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                           UNIX TIMESTAMP SPECIAL_TYPE FIELDS                                           |
;; +------------------------------------------------------------------------------------------------------------------------+

;; There were 9 "sad toucan incidents" on 2015-06-02
(datasets/expect-with-all-engines
  (if (i/has-questionable-timezone-support? *data-loader*)
    10
    9)
  (Q dataset sad-toucan-incidents
     of incidents
     filter and > timestamp "2015-06-01"
                < timestamp "2015-06-03"
     order timestamp+
     return rows count))

(datasets/expect-with-all-engines
  (cond
    (= *engine* :sqlite)
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
    (i/has-questionable-timezone-support? *data-loader*)
    [[#inst "2015-06-01T07"  6]
     [#inst "2015-06-02T07" 10]
     [#inst "2015-06-03T07"  4]
     [#inst "2015-06-04T07"  9]
     [#inst "2015-06-05T07"  9]
     [#inst "2015-06-06T07"  8]
     [#inst "2015-06-07T07"  8]
     [#inst "2015-06-08T07"  9]
     [#inst "2015-06-09T07"  7]
     [#inst "2015-06-10T07"  9]]

    ;; Postgres, MySQL, and H2 -- grouped by DB timezone, US/Pacific in this case
    :else
    [[#inst "2015-06-01T07"  8]
     [#inst "2015-06-02T07"  9]
     [#inst "2015-06-03T07"  9]
     [#inst "2015-06-04T07"  4]
     [#inst "2015-06-05T07" 11]
     [#inst "2015-06-06T07"  8]
     [#inst "2015-06-07T07"  6]
     [#inst "2015-06-08T07" 10]
     [#inst "2015-06-09T07"  6]
     [#inst "2015-06-10T07" 10]])
  (Q dataset sad-toucan-incidents
     aggregate count of incidents
     breakout timestamp
     limit 10
     return rows (format-rows-by [identity int])))


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
  (Q dataset tupac-sightings
     aggregate count of sightings
     breakout city_id->cities.name
     order ag.0-
     limit 10
     return rows (format-rows-by [str int])))


;; Number of Tupac sightings in the Expa office
;; (he was spotted here 60 times)
;; Test that we can filter on an FK field
(datasets/expect-with-engines (engines-that-support :foreign-keys)
  [[60]]
  (Q dataset tupac-sightings
     return rows (format-rows-by [int])
     aggregate count of sightings
     filter = category_id->categories.id 8))


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
  (Q dataset tupac-sightings of sightings
     return rows (format-rows-by [int str])
     fields id category_id->categories.name
     order timestamp-
     limit 10))


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
  (Q dataset tupac-sightings
     return rows (map butlast) (map reverse) (format-rows-by [int int int]) ; drop timestamps. reverse ordering to make the results columns order match order_by
     of sightings
     order city_id->cities.name+ category_id->categories.name- id+
     limit 10))


;; Check that trying to use a Foreign Key fails for Mongo
(datasets/expect-with-engines (engines-that-dont-support :foreign-keys)
  {:status :failed
   :error "foreign-keys is not supported by this driver."}
  (select-keys (Q dataset tupac-sightings
                  of sightings
                  order city_id->cities.name+ category_id->categories.name- id+
                  limit 10)
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
  (Q dataset geographical-tips
     return rows (map (fn [[id _ _ _ {venue-name :name}]] [id venue-name]))
     aggregate rows of tips
     filter = venue...name "Kyle's Low-Carb Grill"
     order id
     limit 10))

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
  (Q dataset geographical-tips
     return rows
     aggregate rows of tips
     filter and = source...service "twitter"
                = source...username "kyle"
     order venue...name))

;; Nested Field in AGGREGATION
;; Let's see how many *distinct* venue names are mentioned
(datasets/expect-with-engines (engines-that-support :nested-fields)
  99
  (Q dataset geographical-tips
     return first-row first
     aggregate distinct venue...name of tips))

;; Now let's just get the regular count
(datasets/expect-with-engines (engines-that-support :nested-fields)
  500
  (Q dataset geographical-tips
     return first-row first
     aggregate count venue...name of tips))

;;; Nested Field in BREAKOUT
;; Let's see how many tips we have by source.service
(datasets/expect-with-engines (engines-that-support :nested-fields)
  {:rows    [["facebook"   107]
             ["flare"      105]
             ["foursquare" 100]
             ["twitter"     98]
             ["yelp"        90]]
   :columns ["source.service" "count"]}
  (Q dataset geographical-tips
     return :data (#(dissoc % :cols)) (format-rows-by [str int])
     aggregate count of tips
     breakout source...service))

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
  (select-keys (Q dataset geographical-tips
                  return :data
                  aggregate rows of tips
                  order id
                  fields venue...name
                  limit 10)
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
  (Q dataset geographical-tips
     aggregate count of tips
     breakout source...mayor
     order ag.0
     return rows (format-rows-by [identity int])))


;;; # New Filter Types - CONTAINS, STARTS_WITH, ENDS_WITH

;;; ## STARTS_WITH
(datasets/expect-with-all-engines
 [[41 "Cheese Steak Shop" 18 37.7855 -122.44  1]
  [74 "Chez Jay"           2 34.0104 -118.493 2]]
 (Q aggregate rows of venues
    filter starts-with name "Che"
    order id
    return rows formatted-venues-rows))


;;; ## ENDS_WITH
(datasets/expect-with-all-engines
 [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
  [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
  [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
  [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
  [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
 (Q aggregate rows of venues
    filter ends-with name "Restaurant"
    order id
    return rows formatted-venues-rows))

;;; ## CONTAINS
(datasets/expect-with-all-engines
  [[31 "Bludso's BBQ"             5 33.8894 -118.207 2]
   [34 "Beachwood BBQ & Brewing" 10 33.7701 -118.191 2]
   [39 "Baby Blues BBQ"           5 34.0003 -118.465 2]]
  (Q aggregate rows of venues
     filter contains name "BBQ"
     order id
     return rows formatted-venues-rows))

;;; ## Nested AND / OR

(datasets/expect-with-all-engines
  [[81]]
  (Q aggregate count of venues
     filter and != price 3
                or = price 1
                or = price 2
     return rows (format-rows-by [int])))


;;; ## = / != with multiple values

(datasets/expect-with-all-engines
  [[81]]
  (Q aggregate count of venues
     filter = price 1 2
     return rows (format-rows-by [int])))

(datasets/expect-with-all-engines
  [[19]]
  (Q aggregate count of venues
     filter != price 1 2
     return rows (format-rows-by [int])))


;; +-------------------------------------------------------------------------------------------------------------+
;; |                                                NEW DATE STUFF                                               |
;; +-------------------------------------------------------------------------------------------------------------+


;; ## BUCKETING

(defn- sad-toucan-incidents-with-bucketing [unit]
  (vec (Q dataset sad-toucan-incidents
          aggregate count of incidents
          breakout ["datetime_field" (id :incidents :timestamp) "as" unit]
          limit 10
          return rows (format-rows-by [(fn [x] (if (number? x) (int x) x))
                                       int]))))

(datasets/expect-with-all-engines
  (cond
    (contains? #{:redshift :sqlserver} *engine*)
    [[#inst "2015-06-01T17:31" 1]
     [#inst "2015-06-01T23:06" 1]
     [#inst "2015-06-02T00:23" 1]
     [#inst "2015-06-02T01:55" 1]
     [#inst "2015-06-02T04:04" 1]
     [#inst "2015-06-02T04:19" 1]
     [#inst "2015-06-02T09:13" 1]
     [#inst "2015-06-02T12:37" 1]
     [#inst "2015-06-02T15:20" 1]
     [#inst "2015-06-02T18:11" 1]]

    (= *engine* :sqlite)
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

    :else
    [[#inst "2015-06-01T10:31" 1]
     [#inst "2015-06-01T16:06" 1]
     [#inst "2015-06-01T17:23" 1]
     [#inst "2015-06-01T18:55" 1]
     [#inst "2015-06-01T21:04" 1]
     [#inst "2015-06-01T21:19" 1]
     [#inst "2015-06-02T02:13" 1]
     [#inst "2015-06-02T05:37" 1]
     [#inst "2015-06-02T08:20" 1]
     [#inst "2015-06-02T11:11" 1]])
  (sad-toucan-incidents-with-bucketing :default))

(datasets/expect-with-all-engines
  (cond
    (= *engine* :sqlite)
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

    (i/has-questionable-timezone-support? *data-loader*)
    [[#inst "2015-06-01T17:31" 1]
     [#inst "2015-06-01T23:06" 1]
     [#inst "2015-06-02T00:23" 1]
     [#inst "2015-06-02T01:55" 1]
     [#inst "2015-06-02T04:04" 1]
     [#inst "2015-06-02T04:19" 1]
     [#inst "2015-06-02T09:13" 1]
     [#inst "2015-06-02T12:37" 1]
     [#inst "2015-06-02T15:20" 1]
     [#inst "2015-06-02T18:11" 1]]

    :else
    [[#inst "2015-06-01T10:31" 1]
     [#inst "2015-06-01T16:06" 1]
     [#inst "2015-06-01T17:23" 1]
     [#inst "2015-06-01T18:55" 1]
     [#inst "2015-06-01T21:04" 1]
     [#inst "2015-06-01T21:19" 1]
     [#inst "2015-06-02T02:13" 1]
     [#inst "2015-06-02T05:37" 1]
     [#inst "2015-06-02T08:20" 1]
     [#inst "2015-06-02T11:11" 1]])
  (sad-toucan-incidents-with-bucketing :minute))

(datasets/expect-with-all-engines
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

(datasets/expect-with-all-engines
  (cond
    (= *engine* :sqlite)
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

    (i/has-questionable-timezone-support? *data-loader*)
    [[#inst "2015-06-01T17" 1]
     [#inst "2015-06-01T23" 1]
     [#inst "2015-06-02T00" 1]
     [#inst "2015-06-02T01" 1]
     [#inst "2015-06-02T04" 2]
     [#inst "2015-06-02T09" 1]
     [#inst "2015-06-02T12" 1]
     [#inst "2015-06-02T15" 1]
     [#inst "2015-06-02T18" 1]
     [#inst "2015-06-02T20" 1]]

    :else
    [[#inst "2015-06-01T10" 1]
     [#inst "2015-06-01T16" 1]
     [#inst "2015-06-01T17" 1]
     [#inst "2015-06-01T18" 1]
     [#inst "2015-06-01T21" 2]
     [#inst "2015-06-02T02" 1]
     [#inst "2015-06-02T05" 1]
     [#inst "2015-06-02T08" 1]
     [#inst "2015-06-02T11" 1]
     [#inst "2015-06-02T13" 1]])
  (sad-toucan-incidents-with-bucketing :hour))

(datasets/expect-with-all-engines
  (if (i/has-questionable-timezone-support? *data-loader*)
   [[0 13] [1 8] [2 4] [3  7] [4  5] [5 13] [6 10] [7 8] [8 9] [9 7]]
   [[0  8] [1 9] [2 7] [3 10] [4 10] [5  9] [6  6] [7 5] [8 7] [9 7]])
  (sad-toucan-incidents-with-bucketing :hour-of-day))

(datasets/expect-with-all-engines
  (cond
    (= *engine* :sqlite)
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

    (i/has-questionable-timezone-support? *data-loader*)
    [[#inst "2015-06-01T07"  6]
     [#inst "2015-06-02T07" 10]
     [#inst "2015-06-03T07"  4]
     [#inst "2015-06-04T07"  9]
     [#inst "2015-06-05T07"  9]
     [#inst "2015-06-06T07"  8]
     [#inst "2015-06-07T07"  8]
     [#inst "2015-06-08T07"  9]
     [#inst "2015-06-09T07"  7]
     [#inst "2015-06-10T07"  9]]

    :else
    [[#inst "2015-06-01T07"  8]
     [#inst "2015-06-02T07"  9]
     [#inst "2015-06-03T07"  9]
     [#inst "2015-06-04T07"  4]
     [#inst "2015-06-05T07" 11]
     [#inst "2015-06-06T07"  8]
     [#inst "2015-06-07T07"  6]
     [#inst "2015-06-08T07" 10]
     [#inst "2015-06-09T07"  6]
     [#inst "2015-06-10T07" 10]])
  (sad-toucan-incidents-with-bucketing :day))

(datasets/expect-with-all-engines
  (if (i/has-questionable-timezone-support? *data-loader*)
   [[1 28] [2 38] [3 29] [4 27] [5 24] [6 30] [7 24]]
   [[1 29] [2 36] [3 33] [4 29] [5 13] [6 38] [7 22]])
  (sad-toucan-incidents-with-bucketing :day-of-week))

(datasets/expect-with-all-engines
  (if (i/has-questionable-timezone-support? *data-loader*)
   [[1  6] [2 10] [3  4] [4  9] [5  9] [6  8] [7  8] [8  9] [9  7] [10  9]]
   [[1  8] [2  9] [3  9] [4  4] [5 11] [6  8] [7  6] [8 10] [9  6] [10 10]])
  (sad-toucan-incidents-with-bucketing :day-of-month))

(datasets/expect-with-all-engines
  (if (i/has-questionable-timezone-support? *data-loader*)
   [[152  6] [153 10] [154  4] [155  9] [156  9] [157  8] [158  8] [159  9] [160  7] [161  9]]
   [[152  8] [153  9] [154  9] [155  4] [156 11] [157  8] [158  6] [159 10] [160  6] [161 10]])
  (sad-toucan-incidents-with-bucketing :day-of-year))

(datasets/expect-with-all-engines
  (cond
    (= *engine* :sqlite)
    [["2015-05-31" 46]
     ["2015-06-07" 47]
     ["2015-06-14" 40]
     ["2015-06-21" 60]
     ["2015-06-28" 7]]

    (i/has-questionable-timezone-support? *data-loader*)
    [[#inst "2015-05-31T07" 46]
     [#inst "2015-06-07T07" 47]
     [#inst "2015-06-14T07" 40]
     [#inst "2015-06-21T07" 60]
     [#inst "2015-06-28T07" 7]]

    :else
    [[#inst "2015-05-31T07" 49]
     [#inst "2015-06-07T07" 47]
     [#inst "2015-06-14T07" 39]
     [#inst "2015-06-21T07" 58]
     [#inst "2015-06-28T07" 7]])
  (sad-toucan-incidents-with-bucketing :week))

(datasets/expect-with-all-engines
  (cond
    (contains? #{:sqlserver :sqlite} *engine*)
    [[23 54] [24 46] [25 39] [26 61]]

    (contains? #{:mongo :redshift} *engine*)
    [[23 46] [24 47] [25 40] [26 60] [27 7]]

    :else
    [[23 49] [24 47] [25 39] [26 58] [27 7]])
  (sad-toucan-incidents-with-bucketing :week-of-year))

(datasets/expect-with-all-engines
  [[(if (= *engine* :sqlite) "2015-06-01", #inst "2015-06-01T07") 200]]
  (sad-toucan-incidents-with-bucketing :month))

(datasets/expect-with-all-engines
  [[6 200]]
  (sad-toucan-incidents-with-bucketing :month-of-year))

(datasets/expect-with-all-engines
  [[(if (= *engine* :sqlite) "2015-04-01", #inst "2015-04-01T07") 200]]
  (sad-toucan-incidents-with-bucketing :quarter))

(datasets/expect-with-all-engines
  [[2 200]]
  (sad-toucan-incidents-with-bucketing :quarter-of-year))

(datasets/expect-with-all-engines
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
            [(driver/date-interval *data-loader* :second (* i interval-seconds))]))]))

(def ^:private checkins:4-per-minute (partial database-def-with-timestamps 15))
(def ^:private checkins:4-per-hour   (partial database-def-with-timestamps (* 60 15)))
(def ^:private checkins:1-per-day    (partial database-def-with-timestamps (* 60 60 24)))

(defn- count-of-grouping [db field-grouping & relative-datetime-args]
  (with-temp-db [_ db]
    (Q aggregate count of checkins
       filter = ["datetime_field" (id :checkins :timestamp) "as" (name field-grouping)] (apply vector "relative_datetime" relative-datetime-args)
       return first-row first int)))

(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-minute) :minute "current"))
(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-minute) :minute -1 "minute"))
(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-minute) :minute  1 "minute"))

(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-hour) :hour "current"))
(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-hour) :hour -1 "hour"))
(datasets/expect-with-all-engines 4 (count-of-grouping (checkins:4-per-hour) :hour  1 "hour"))

(datasets/expect-with-all-engines 1 (count-of-grouping (checkins:1-per-day) :day "current"))
(datasets/expect-with-all-engines 1 (count-of-grouping (checkins:1-per-day) :day -1 "day"))
(datasets/expect-with-all-engines 1 (count-of-grouping (checkins:1-per-day) :day  1 "day"))

(datasets/expect-with-all-engines 7 (count-of-grouping (checkins:1-per-day) :week "current"))

;; SYNTACTIC SUGAR
(datasets/expect-with-all-engines
  1
  (with-temp-db [_ (checkins:1-per-day)]
    (-> (driver/process-query
         {:database (id)
          :type     :query
          :query    {:source_table (id :checkins)
                     :aggregation  ["count"]
                     :filter       ["TIME_INTERVAL" (id :checkins :timestamp) "current" "day"]}})
        :data :rows first first int)))

(datasets/expect-with-all-engines
  7
  (with-temp-db [_ (checkins:1-per-day)]
    (-> (driver/process-query
         {:database (id)
          :type     :query
          :query    {:source_table (id :checkins)
                     :aggregation  ["count"]
                     :filter       ["TIME_INTERVAL" (id :checkins :timestamp) "last" "week"]}})
        :data :rows first first int)))

;; Make sure that when referencing the same field multiple times with different units we return the one
;; that actually reflects the units the results are in.
;; eg when we breakout by one unit and filter by another, make sure the results and the col info
;; use the unit used by breakout
(defn- date-bucketing-unit-when-you [& {:keys [breakout-by filter-by]}]
  (with-temp-db [_ (checkins:1-per-day)]
    (let [results (driver/process-query
                   {:database (id)
                    :type     :query
                    :query     {:source_table (id :checkins)
                                :aggregation  ["count"]
                                :breakout     [["datetime_field" (id :checkins :timestamp) "as" breakout-by]]
                                :filter       ["TIME_INTERVAL" (id :checkins :timestamp) "current" filter-by]}})]
      {:rows (-> results :row_count)
       :unit (-> results :data :cols first :unit)})))

(datasets/expect-with-all-engines
  {:rows 1, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "day"))

(datasets/expect-with-all-engines
  {:rows 7, :unit :day}
  (date-bucketing-unit-when-you :breakout-by "day", :filter-by "week"))

(datasets/expect-with-all-engines
  {:rows 1, :unit :week}
  (date-bucketing-unit-when-you :breakout-by "week", :filter-by "day"))

(datasets/expect-with-all-engines
  {:rows 1, :unit :quarter}
  (date-bucketing-unit-when-you :breakout-by "quarter", :filter-by "day"))

(datasets/expect-with-all-engines
  {:rows 1, :unit :hour}
  (date-bucketing-unit-when-you :breakout-by "hour", :filter-by "day"))
