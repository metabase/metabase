(ns metabase.driver.query-processor-test
  "Query processing tests that can be ran between any of the available drivers, and should give the same results."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets :refer [*dataset*]])
            [metabase.util :as u]))


;; ## Dataset-Independent QP Tests

;; ### Helper Fns + Macros

(defmacro qp-expect-with-datasets
  "Slightly more succinct way of writing QP tests. Adds standard boilerplate to run QP tests against DATASETS."
  [datasets {:keys [rows] :as data} query]
  {:pre [(set? datasets)
         (map? data)
         (sequential? rows)
         (map? query)]}
  `(datasets/expect-with-datasets ~datasets
     {:status    :completed
      :row_count ~(count rows)
      :data      ~data}
     (driver/process-query
      {:type     :query
       :database (db-id)
       :query    ~query})))

(defmacro qp-expect-with-all-datasets
  "Like `qp-expect-with-datasets`, but tests against *all* datasets."
  [data query]
  `(datasets/expect-with-all-datasets
       {:status    :completed
        :row_count ~(count (:rows data))
        :data      ~data}
     (driver/process-query {:type     :query
                            :database (db-id)
                            :query    ~query})))


(defn ->columns
  "Generate the vector that should go in the `columns` part of a QP result; done by calling `format-name` against each column name."
  [& names]
  (mapv (partial format-name)
        names))


;; ### Predefinied Column Fns
;; These are meant for inclusion in the expected output of the QP tests, to save us from writing the same results several times

;; #### categories
(defn categories-col
  "Return column information for the `categories` column named by keyword COL."
  [col]
  (case col
    :id   {:extra_info {} :target nil :special_type :id, :base_type (id-field-type), :description nil, :name (format-name "id")
           :table_id (id :categories), :id (id :categories :id)}
    :name {:extra_info {} :target nil :special_type :name, :base_type :TextField, :description nil, :name (format-name "name")
           :table_id (id :categories), :id (id :categories :name)}))

;; #### users
(defn users-col
  "Return column information for the `users` column named by keyword COL."
  [col]
  (case col
    :id         {:extra_info   {}
                 :target       nil
                 :special_type :id
                 :base_type    (id-field-type)
                 :description  nil
                 :name         (format-name "id")
                 :table_id     (id :users)
                 :id           (id :users :id)}
    :name       {:extra_info   {}
                 :target       nil
                 :special_type :category
                 :base_type    :TextField
                 :description  nil
                 :name         (format-name "name")
                 :table_id     (id :users)
                 :id           (id :users :name)}
    :last_login {:extra_info   {}
                 :target       nil
                 :special_type :category
                 :base_type    (timestamp-field-type)
                 :description  nil
                 :name         (format-name "last_login")
                 :table_id     (id :users)
                 :id           (id :users :last_login)}))

;; #### venues
(defn venues-columns
  "Names of all columns for the `venues` table."
  []
  (->columns "id" "name" "category_id" "latitude" "longitude" "price"))

(defn venues-col
  "Return column information for the `venues` column named by keyword COL."
  [col]
  (case col
    :id          {:extra_info   {}
                  :target       nil
                  :special_type :id
                  :base_type    (id-field-type)
                  :description  nil
                  :name         (format-name "id")
                  :table_id     (id :venues)
                  :id           (id :venues :id)}
    :category_id {:extra_info   (if (fks-supported?) {:target_table_id (id :categories)}
                                    {})
                  :target       (if (fks-supported?) (-> (categories-col :id)
                                                         (dissoc :target :extra_info))
                                    nil)
                  :special_type (if (fks-supported?) :fk
                                    :category)
                  :base_type    :IntegerField
                  :description  nil
                  :name         (format-name "category_id")
                  :table_id     (id :venues)
                  :id           (id :venues :category_id)}
    :price       {:extra_info   {}
                  :target       nil
                  :special_type :category
                  :base_type    :IntegerField
                  :description  nil
                  :name         (format-name "price")
                  :table_id     (id :venues)
                  :id           (id :venues :price)}
    :longitude   {:extra_info   {}
                  :target       nil
                  :special_type :longitude,
                  :base_type    :FloatField,
                  :description  nil
                  :name         (format-name "longitude")
                  :table_id     (id :venues)
                  :id           (id :venues :longitude)}
    :latitude    {:extra_info   {}
                  :target       nil
                  :special_type :latitude
                  :base_type    :FloatField
                  :description  nil
                  :name         (format-name "latitude")
                  :table_id     (id :venues)
                  :id           (id :venues :latitude)}
    :name        {:extra_info   {}
                  :target       nil
                  :special_type :name
                  :base_type    :TextField
                  :description  nil
                  :name         (format-name "name")
                  :table_id     (id :venues)
                  :id           (id :venues :name)}))

(defn venues-cols
  "`cols` information for all the columns in `venues`."
  []
  (mapv venues-col [:id :name :category_id :latitude :longitude :price]))

;; #### checkins
(defn checkins-col
  "Return column information for the `checkins` column named by keyword COL."
  [col]
  (case col
    :id       {:extra_info   {}
               :target       nil
               :special_type :id
               :base_type    (id-field-type)
               :description  nil
               :name         (format-name "id")
               :table_id     (id :checkins)
               :id           (id :checkins :id)}
    :venue_id {:extra_info   (if (fks-supported?) {:target_table_id (id :venues)}
                               {})
               :target       (if (fks-supported?) (-> (venues-col :id)
                                                      (dissoc :target :extra_info))
                                 nil)
               :special_type (when (fks-supported?)
                               :fk)
               :base_type    :IntegerField
               :description  nil
               :name         (format-name "venue_id")
               :table_id     (id :checkins)
               :id           (id :checkins :venue_id)}
    :user_id  {:extra_info   (if (fks-supported?) {:target_table_id (id :users)}
                                 {})
               :target       (if (fks-supported?) (-> (users-col :id)
                                                      (dissoc :target :extra_info))
                                 nil)
               :special_type (if (fks-supported?) :fk
                                 :category)
               :base_type    :IntegerField
               :description  nil
               :name         (format-name "user_id")
               :table_id     (id :checkins)
               :id           (id :checkins :user_id)}))


;;; #### aggregate columns

(defn aggregate-col
  "Return the column information we'd expect for an aggregate column. For all columns besides `:count`, you'll need to pass the `Field` in question as well.

    (aggregate-col :count)
    (aggregate-col :avg (venues-col :id))"
  {:arglists '([ag-col-kw] [ag-col-kw field])}
  ([ag-col-kw]
   (case ag-col-kw
     :count  {:base_type    :IntegerField
              :special_type :number
              :name         "count"
              :id           nil
              :table_id     nil
              :description  nil
              :extra_info   {}
              :target       nil}))
  ([ag-col-kw {:keys [base_type special_type]}]
   {:pre [base_type
          special_type]}
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
                    :sum    "sum")}))


;; # THE TESTS THEMSELVES (!)

;; ### "COUNT" AGGREGATION
(qp-expect-with-all-datasets
    {:rows    [[100]]
     :columns ["count"]
     :cols    [(aggregate-col :count)]}
  {:source_table (id :venues)
   :filter       [nil nil]
   :aggregation  ["count"]
   :breakout     [nil]
   :limit        nil})

;; ### "SUM" AGGREGATION
(qp-expect-with-all-datasets
    {:rows    [[203]]
     :columns ["sum"]
     :cols    [(aggregate-col :sum (venues-col :price))]}
  {:source_table (id :venues)
   :filter       [nil nil]
   :aggregation  ["sum" (id :venues :price)]
   :breakout     [nil]
   :limit        nil})


;; ## "AVG" AGGREGATION
(qp-expect-with-all-datasets
    {:rows    [[35.50589199999998]]
     :columns ["avg"]
     :cols    [(aggregate-col :avg (venues-col :latitude))]}
  {:source_table (id :venues)
   :filter       [nil nil]
   :aggregation  ["avg" (id :venues :latitude)]
   :breakout     [nil]
   :limit        nil})


;; ### "DISTINCT COUNT" AGGREGATION
(qp-expect-with-all-datasets
    {:rows    [[15]]
     :columns ["count"]
     :cols    [(aggregate-col :count)]}
  {:source_table (id :checkins)
   :filter       [nil nil]
   :aggregation  ["distinct" (id :checkins :user_id)]
   :breakout     [nil]
   :limit        nil})


;; ## "ROWS" AGGREGATION
;; Test that a rows aggregation just returns rows as-is.
(qp-expect-with-all-datasets
 {:rows    [[1 "Red Medicine" 4 10.0646 -165.374 3]
            [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
            [3 "The Apple Pan" 11 34.0406 -118.428 2]
            [4 "Wurstküche" 29 33.9997 -118.465 2]
            [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
            [6 "The 101 Coffee Shop" 20 34.1054 -118.324 2]
            [7 "Don Day Korean Restaurant" 44 34.0689 -118.305 2]
            [8 "25°" 11 34.1015 -118.342 2]
            [9 "Krua Siri" 71 34.1018 -118.301 1]
            [10 "Fred 62" 20 34.1046 -118.292 2]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       nil
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        10
  :order_by     [[(id :venues :id) "ascending"]]})


;; ## "PAGE" CLAUSE
;; Test that we can get "pages" of results.

;; ### PAGE - Get the first page
(qp-expect-with-all-datasets
 {:rows    [[1 "African"]
            [2 "American"]
            [3 "Artisan"]
            [4 "Asian"]
            [5 "BBQ"]]
  :columns (->columns "id" "name")
  :cols    [(categories-col :id)
            (categories-col :name)]}
 {:source_table (id :categories)
  :aggregation  ["rows"]
  :page         {:items 5
                 :page 1}
  :order_by     [[(id :categories :name) "ascending"]]})

;; ### PAGE - Get the second page
(qp-expect-with-all-datasets
 {:rows    [[6 "Bakery"]
            [7 "Bar"]
            [8 "Beer Garden"]
            [9 "Breakfast / Brunch"]
            [10 "Brewery"]]
  :columns (->columns "id" "name")
  :cols    [(categories-col :id)
            (categories-col :name)]}
 {:source_table (id :categories)
  :aggregation  ["rows"]
  :page         {:items 5
                 :page 2}
  :order_by     [[(id :categories :name) "ascending"]]})


;; ## "ORDER_BY" CLAUSE
;; Test that we can tell the Query Processor to return results ordered by multiple fields
(qp-expect-with-all-datasets
 {:rows    [[1 12 375] [1 9 139] [1 1 72] [2 15 129] [2 12 471] [2 11 325] [2 9 590] [2 9 833] [2 8 380] [2 5 719]],
  :columns (->columns "venue_id" "user_id" "id")
  :cols    [(checkins-col :venue_id)
            (checkins-col :user_id)
            (checkins-col :id)]}
 {:source_table (id :checkins)
  :aggregation  ["rows"]
  :limit        10
  :fields       [(id :checkins :venue_id)
                 (id :checkins :user_id)
                 (id :checkins :id)]
  :order_by     [[(id :checkins :venue_id) "ascending"]
                 [(id :checkins :user_id) "descending"]
                 [(id :checkins :id) "ascending"]]})


;; ## "FILTER" CLAUSE

;; ### FILTER -- "AND", ">", ">="
(qp-expect-with-all-datasets
 {:rows    [[55 "Dal Rae Restaurant" 67 33.983 -118.096 4]
            [61 "Lawry's The Prime Rib" 67 34.0677 -118.376 4]
            [77 "Sushi Nakazawa" 40 40.7318 -74.0045 4]
            [79 "Sushi Yasuda" 40 40.7514 -73.9736 4]
            [81 "Tanoshi Sushi & Sake Bar" 40 40.7677 -73.9533 4]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       ["AND"
                 [">" (id :venues :id) 50]
                 [">=" (id :venues :price) 4]]
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        nil})

;; ### FILTER -- "AND", "<", ">", "!="
(qp-expect-with-all-datasets
 {:rows    [[21 "PizzaHacker" 58 37.7441 -122.421 2]
            [23 "Taqueria Los Coyotes" 50 37.765 -122.42 2]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       ["AND"
                 ["<" (id :venues :id) 24]
                 [">" (id :venues :id) 20]
                 ["!=" (id :venues :id) 22]]
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        nil})

;; ### FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(qp-expect-with-all-datasets
 {:rows    [[21 "PizzaHacker" 58 37.7441 -122.421 2]
            [22 "Gordo Taqueria" 50 37.7822 -122.484 1]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       ["BETWEEN" (id :venues :id) 21 22]
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        nil})

;; ### FILTER -- "BETWEEN" with dates
(qp-expect-with-all-datasets
 {:rows    [[29]]
  :columns ["count"]
  :cols    [(aggregate-col :count)]}
 {:source_table (id :checkins)
  :filter       ["AND" ["BETWEEN" (id :checkins :date) "2015-04-01" "2015-05-01"]]
  :aggregation  ["count"]})

;; ### FILTER -- "OR", "<=", "="
(qp-expect-with-all-datasets
 {:rows    [[1 "Red Medicine" 4 10.0646 -165.374 3]
            [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]
            [3 "The Apple Pan" 11 34.0406 -118.428 2]
            [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       ["OR"
                 ["<=" (id :venues :id) 3]
                 ["=" (id :venues :id) 5]]
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        nil})

;; TODO - These are working, but it would be nice to have some tests that covered
;; *  NOT_NULL
;; *  NULL

;; ### FILTER -- "INSIDE"
(qp-expect-with-all-datasets
 {:rows    [[1 "Red Medicine" 4 10.0646 -165.374 3]]
  :columns (venues-columns)
  :cols    (venues-cols)}
 {:source_table (id :venues)
  :filter       ["INSIDE"
                 (id :venues :latitude)
                 (id :venues :longitude)
                 10.0649
                 -165.379
                 10.0641
                 -165.371]
  :aggregation  ["rows"]
  :breakout     [nil]
  :limit        nil})


;; ## "FIELDS" CLAUSE
;; Test that we can restrict the Fields that get returned to the ones specified, and that results come back in the order of the IDs in the `fields` clause
(qp-expect-with-all-datasets
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
 {:source_table (id :venues)
  :filter       [nil nil]
  :aggregation  ["rows"]
  :fields       [(id :venues :name)
                 (id :venues :id)]
  :breakout     [nil]
  :limit        10
  :order_by     [[(id :venues :id) "ascending"]]})


;; ## "BREAKOUT"
;; ### "BREAKOUT" - SINGLE COLUMN
(qp-expect-with-all-datasets
 {:rows    [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
  :columns [(format-name "user_id")
            "count"]
  :cols    [(checkins-col :user_id)
            (aggregate-col :count)]}
 {:source_table (id :checkins)
  :filter       [nil nil]
  :aggregation  ["count"]
  :breakout     [(id :checkins :user_id)]
  :order_by     [[(id :checkins :user_id) "ascending"]]
  :limit        nil})

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(qp-expect-with-all-datasets
 {:rows    [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]],
  :columns [(format-name "user_id")
            (format-name "venue_id")
            "count"]
  :cols    [(checkins-col :user_id)
            (checkins-col :venue_id)
            (aggregate-col :count)]}
 {:source_table (id :checkins)
  :limit        10
  :aggregation  ["count"]
  :breakout     [(id :checkins :user_id)
                 (id :checkins :venue_id)]})

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(qp-expect-with-all-datasets
 {:rows    [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]],
  :columns [(format-name "user_id")
            (format-name "venue_id")
            "count"]
  :cols    [(checkins-col :user_id)
            (checkins-col :venue_id)
            (aggregate-col :count)]}
 {:source_table (id :checkins)
  :limit        10
  :aggregation  ["count"]
  :breakout     [(id :checkins :user_id)
                 (id :checkins :venue_id)]
  :order_by     [[(id :checkins :user_id) "descending"]
                 [(id :checkins :venue_id) "ascending"]]})


;; # POST PROCESSING TESTS

;; ## LIMIT-MAX-RESULT-ROWS
;; Apply limit-max-result-rows to an infinite sequence and make sure it gets capped at `max-result-rows`
(expect max-result-rows
  (->> (((u/runtime-resolved-fn 'metabase.driver.query-processor 'limit) identity) {:rows (repeat [:ok])})
       :rows
       count))


;; ## CUMULATIVE SUM

;; TODO - Should we move this into IDataset? It's only used here, but the logic might get a little more compilcated when we add more drivers
(defn- ->sum-type
  "Since summed integer fields come back as different types depending on which DB we're using, cast value V appropriately."
  [v]
  (case (id-field-type)
    :IntegerField    (int v)
    :BigIntegerField (bigdec v)))

;; ### cum_sum w/o breakout should be treated the same as sum
(qp-expect-with-all-datasets
 {:rows    [[(->sum-type 120)]]
  :columns ["sum"]
  :cols    [(aggregate-col :sum (users-col :id))]}
 {:source_table (id :users)
  :aggregation  ["cum_sum" (id :users :id)]})


;; ### Simple cumulative sum where breakout field is same as cum_sum field
(qp-expect-with-all-datasets
 {:rows    [[1] [3] [6] [10] [15] [21] [28] [36] [45] [55] [66] [78] [91] [105] [120]]
  :columns (->columns "id")
  :cols    [(users-col :id)]}
 {:source_table (id :users)
  :breakout     [(id :users :id)]
  :aggregation  ["cum_sum" (id :users :id)]})


;; ### Cumulative sum w/ a different breakout field
(qp-expect-with-all-datasets
 {:rows    [["Broen Olujimi"       (->sum-type 14)]
            ["Conchúr Tihomir"     (->sum-type 21)]
            ["Dwight Gresham"      (->sum-type 34)]
            ["Felipinho Asklepios" (->sum-type 36)]
            ["Frans Hevel"         (->sum-type 46)]
            ["Kaneonuskatew Eiran" (->sum-type 49)]
            ["Kfir Caj"            (->sum-type 61)]
            ["Nils Gotam"          (->sum-type 70)]
            ["Plato Yeshua"        (->sum-type 71)]
            ["Quentin Sören"       (->sum-type 76)]
            ["Rüstem Hebel"        (->sum-type 91)]
            ["Shad Ferdynand"      (->sum-type 97)]
            ["Simcha Yan"          (->sum-type 101)]
            ["Spiros Teofil"       (->sum-type 112)]
            ["Szymon Theutrich"    (->sum-type 120)]]
  :columns [(format-name "name")
            "sum"]
  :cols    [(users-col :name)
            (aggregate-col :sum (users-col :id))]}
 {:source_table (id :users)
  :breakout     [(id :users :name)]
  :aggregation  ["cum_sum" (id :users :id)]})


;; ### Cumulative sum w/ a different breakout field that requires grouping
(qp-expect-with-all-datasets
 {:columns [(format-name "price")
            "sum"]
  :cols    [(venues-col :price)
            (aggregate-col :sum (venues-col :id))]
  :rows    [[1 (->sum-type 1211)]
            [2 (->sum-type 4066)]
            [3 (->sum-type 4681)]
            [4 (->sum-type 5050)]]}
 {:source_table (id :venues)
  :breakout     [(id :venues :price)]
  :aggregation  ["cum_sum" (id :venues :id)]})


;;; ## STDDEV AGGREGATION
;;; SQL-Only for the time being

;; ## "STDDEV" AGGREGATION
(qp-expect-with-datasets #{:generic-sql}
  {:columns ["stddev"]
   :cols    [(aggregate-col :stddev (venues-col :latitude))]
   :rows    [[3.43467255295115]]}
  {:source_table (id :venues)
   :aggregation  ["stddev" (id :venues :latitude)]})


;;; ## order_by aggregate fields (SQL-only for the time being)

;;; ### order_by aggregate ["count"]
(qp-expect-with-datasets #{:generic-sql}
  {:columns [(format-name "price")
             "count"]
   :rows    [[4 6]
             [3 13]
             [1 22]
             [2 59]]
   :cols    [(venues-col :price)
             (aggregate-col :count)]}
  {:source_table (id :venues)
   :aggregation  ["count"]
   :breakout     [(id :venues :price)]
   :order_by     [[["aggregation" 0] "ascending"]]})


;;; ### order_by aggregate ["sum" field-id]
(qp-expect-with-datasets #{:generic-nsql}
  {:columns [(format-name "price")
             "sum"]
   :rows    [[2 (->sum-type 2855)]
             [1 (->sum-type 1211)]
             [3 (->sum-type 615)]
             [4 (->sum-type 369)]]
   :cols    [(venues-col :price)
             (aggregate-col :sum (venues-col :id))]}
  {:source_table (id :venues)
   :aggregation  ["sum" (id :venues :id)]
   :breakout     [(id :venues :price)]
   :order_by     [[["aggregation" 0] "descending"]]})


;;; ### order_by aggregate ["distinct" field-id]
(qp-expect-with-datasets #{:generic-sql}
  {:columns [(format-name "price")
             "count"]
   :rows    [[4 6]
             [3 13]
             [1 22]
             [2 59]]
   :cols    [(venues-col :price)
             (aggregate-col :count)]}
  {:source_table (id :venues)
   :aggregation  ["distinct" (id :venues :id)]
   :breakout     [(id :venues :price)]
   :order_by     [[["aggregation" 0] "ascending"]]})


;;; ### order_by aggregate ["avg" field-id]
(qp-expect-with-datasets #{:generic-sql}
  {:columns [(format-name "price")
             "avg"]
   :rows    [[3 22]
             [2 28]
             [1 32]
             [4 53]]
   :cols    [(venues-col :price)
             (aggregate-col :avg (venues-col :category_id))]}
  {:source_table (id :venues)
   :aggregation  ["avg" (id :venues :category_id)]
   :breakout     [(id :venues :price)]
   :order_by     [[["aggregation" 0] "ascending"]]})

;;; ### order_by aggregate ["stddev" field-id]
(qp-expect-with-datasets #{:generic-sql}
  {:columns [(format-name "price")
             "stddev"]
   :rows    [[3 26.19160170741759]
             [1 24.112111881665186]
             [2 21.418692164795292]
             [4 14.788509052639485]]
   :cols    [(venues-col :price)
             (aggregate-col :stddev (venues-col :category_id))]}
  {:source_table (id :venues)
   :aggregation  ["stddev" (id :venues :category_id)]
   :breakout     [(id :venues :price)]
   :order_by     [[["aggregation" 0] "descending"]]})


;;; ### make sure that rows where preview_display = false don't get displayed
(datasets/expect-with-all-datasets
 [(set (->columns "category_id" "name" "latitude" "id" "longitude" "price"))
  (set (->columns "category_id" "name" "latitude" "id" "longitude"))
  (set (->columns "category_id" "name" "latitude" "id" "longitude" "price"))]
 (let [get-col-names (fn [] (-> (driver/process-query {:database (db-id)
                                                       :type     "query"
                                                       :query    {:aggregation  ["rows"]
                                                                  :source_table (id :venues)
                                                                  :order_by     [[(id :venues :id) "ascending"]]
                                                                  :limit        1}})
                                :data
                                :columns
                                set))]
   [(get-col-names)
    (do (upd Field (id :venues :price) :preview_display false)
        (get-col-names))
    (do (upd Field (id :venues :price) :preview_display true)
        (get-col-names))]))


;;; ## :sensitive fields
;;; Make sure :sensitive information fields are never returned by the QP
(datasets/expect-with-all-datasets
 {:status    :completed,
  :row_count 15
  :data      {:columns (->columns "id" "last_login" "name")
              :cols         [(users-col :id)
                             (users-col :last_login)
                             (users-col :name)],
              :rows         [[1 "Plato Yeshua"]
                             [2 "Felipinho Asklepios"]
                             [3 "Kaneonuskatew Eiran"]
                             [4 "Simcha Yan"]
                             [5 "Quentin Sören"]
                             [6 "Shad Ferdynand"]
                             [7 "Conchúr Tihomir"]
                             [8 "Szymon Theutrich"]
                             [9 "Nils Gotam"]
                             [10 "Frans Hevel"]
                             [11 "Spiros Teofil"]
                             [12 "Kfir Caj"]
                             [13 "Dwight Gresham"]
                             [14 "Broen Olujimi"]
                             [15 "Rüstem Hebel"]]}}
 ;; Filter out the timestamps from the results since they're hard to test :/
 (-> (driver/process-query
      {:type     :query,
       :database (db-id),
       :query    {:source_table (id :users),
                  :aggregation  ["rows"],
                  :order_by     [[(id :users :id) "ascending"]]}})
     (update-in [:data :rows] (partial mapv (partial filterv #(not (isa? (type %) java.util.Date)))))))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                           UNIX TIMESTAMP SPECIAL_TYPE FIELDS                                           |
;; +------------------------------------------------------------------------------------------------------------------------+

(defmacro ^:private query-with-temp-db
  "Convenience to generate a `with-temp-db` wrapping a `driver/process-query` form.
   See usage below."
  [defs & {:as query}]
  `(with-temp-db [db# (dataset-loader) ~defs]
     (driver/process-query {:database (:id db#)
                            :type     :query
                            :query    ~query})))

;; There were 9 "sad toucan incidents" on 2015-06-02
(datasets/expect-with-datasets #{:generic-sql}
  9
  (->> (query-with-temp-db defs/sad-toucan-incidents
         :source_table &incidents:id
         :filter       ["AND"
                        [">" &incidents.timestamp:id "2015-06-01"]
                        ["<" &incidents.timestamp:id "2015-06-03"]]
         :order_by     [[&incidents.timestamp:id "ascending"]])
       :data :rows count))


;;; Unix timestamp breakouts -- SQL only
(datasets/expect-with-datasets #{:generic-sql}
  [["2015-06-01" 6]
   ["2015-06-02" 9]
   ["2015-06-03" 5]
   ["2015-06-04" 9]
   ["2015-06-05" 8]
   ["2015-06-06" 9]
   ["2015-06-07" 8]
   ["2015-06-08" 9]
   ["2015-06-09" 7]
   ["2015-06-10" 8]]
  (->> (query-with-temp-db defs/sad-toucan-incidents
         :source_table &incidents:id
         :aggregation  ["count"]
         :breakout     [&incidents.timestamp:id]
         :limit        10)
       :data :rows
       (map (fn [[^java.util.Date date count]]
              [(.toString date) (int count)]))))


;; +------------------------------------------------------------------------------------------------------------------------+
;; |                                                         JOINS                                                          |
;; +------------------------------------------------------------------------------------------------------------------------+

;; The top 10 cities by number of Tupac sightings
;; Test that we can breakout on an FK field
;; (Note how the FK Field is returned in the results)
(datasets/expect-with-datasets #{:generic-sql}
  [[16 "Arlington"]
   [15 "Albany"]
   [14 "Portland"]
   [13 "Louisville"]
   [13 "Philadelphia"]
   [12 "Anchorage"]
   [12 "Lincoln"]
   [11 "Houston"]
   [11 "Irvine"]
   [11 "Lakeland"]]
  (-> (query-with-temp-db defs/tupac-sightings
        :source_table &sightings:id
        :aggregation  ["count"]
        :breakout     [["fk->" &sightings.city_id:id &cities.name:id]]
        :order_by     [[["aggregation" 0] "descending"]]
        :limit        10)
      :data :rows))


;; Number of Tupac sightings in the Expa office
;; (he was spotted here 60 times)
;; Test that we can filter on an FK field
(datasets/expect-with-datasets #{:generic-sql}
  60
  (-> (query-with-temp-db defs/tupac-sightings
        :source_table &sightings:id
        :aggregation  ["count"]
        :filter       ["=" ["fk->" &sightings.category_id:id &categories.id:id] 8])
      :data :rows first first))


;; THE 10 MOST RECENT TUPAC SIGHTINGS (!)
;; (What he was doing when we saw him, sighting ID)
;; Check that we can include an FK field in the :fields clause
(datasets/expect-with-datasets #{:generic-sql}
  [["In the Park" 772]
   ["Working at a Pet Store" 894]
   ["At the Airport" 684]
   ["At a Restaurant" 199]
   ["Working as a Limo Driver" 33]
   ["At Starbucks" 902]
   ["On TV" 927]
   ["At a Restaurant" 996]
   ["Wearing a Biggie Shirt" 897]
   ["In the Expa Office" 499]]
  (->> (query-with-temp-db defs/tupac-sightings
         :source_table &sightings:id
         :fields       [&sightings.id:id ["fk->" &sightings.category_id:id &categories.name:id]]
         :order_by     [[&sightings.timestamp:id "descending"]]
         :limit        10)
       :data :rows))


;; 1. Check that we can order by Foreign Keys
;;    (this query targets sightings and orders by cities.name and categories.name)
;; 2. Check that we can join MULTIPLE tables in a single query
;;    (this query joins both cities and categories)
(datasets/expect-with-datasets #{:generic-sql}
  ;; CITY_ID, CATEGORY_ID, ID
  ;; Cities are already alphabetized in the source data which is why CITY_ID is sorted
  [[1 12 6]
   [1 11 355]
   [1 11 596]
   [1 13 379]
   [1 5 413]
   [1 1 426]
   [2 11 67]
   [2 11 524]
   [2 13 77]
   [2 13 202]]
  (->> (query-with-temp-db defs/tupac-sightings
         :source_table &sightings:id
         :order_by     [[["fk->" &sightings.city_id:id &cities.name:id] "ascending"]
                        [["fk->" &sightings.category_id:id &categories.name:id] "descending"]
                        [&sightings.id:id "ascending"]]
         :limit        10)
       :data :rows (map butlast) (map reverse))) ; drop timestamps. reverse ordering to make the results columns order match order_by
