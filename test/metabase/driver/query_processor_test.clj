(ns metabase.driver.query-processor-test
  "Query processing tests that can be ran between any of the available drivers, and should give the same results."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [table :refer [Table]])
            [metabase.test.data.datasets :as datasets :refer [*dataset* expect-with-all-datasets]]))

;; ##  Dataset-Independent Data Fns

(defn id
  "Return the ID of a `Table` or `Field` for the current driver data set."
  ([table-name]
   {:pre [*dataset*
          (keyword? table-name)]
    :post [(integer? %)]}
   (datasets/table-name->id *dataset* table-name))
  ([table-name field-name]
   {:pre [*dataset*
          (keyword? table-name)
          (keyword? field-name)]
    :post [(integer? %)]}
   (datasets/field-name->id *dataset* table-name field-name)))

(defn db-id []
  {:pre  [*dataset*]
   :post [(integer? %)]}
  (:id (datasets/db *dataset*)))

(defn fks-supported? []
  (datasets/fks-supported? *dataset*))

(defn format-name [name]
  (datasets/format-name *dataset* name))

(defn id-field-type []
  (datasets/id-field-type *dataset*))


;; ## Dataset-Independent QP Tests

;; ### Helper Fns + Macros

(defmacro qp-expect-with-all-datasets
  "Slightly more succinct way of writing QP tests. Adds standard boilerplate to actual/expected forms."
  [data query]
  `(expect-with-all-datasets
       {:status :completed
        :row_count ~(count (:rows data))
        :data ~data}
     (driver/process-query {:type :query
                            :database (db-id)
                            :query ~query})))

(defn ->columns
  "Generate the vector that should go in the `columns` part of a QP result; done by calling `format-name` against each column name."
  [& names]
  (mapv (partial format-name)
        names))


;; ### Predefinied Column Fns
;; These are meant for inclusion in the expected output of the QP tests, to save us from writing the same results several times

;; #### venues
(defn venues-columns
  "Names of all columns for the `venues` table."
  []
  (->columns "id" "category_id" "price" "longitude" "latitude" "name"))

(defn venue-col
  "Return column information for the `venues` column named by keyword COL."
  [col]
  (case col
    :id          {:extra_info {}
                  :special_type :id
                  :base_type (id-field-type)
                  :description nil
                  :name (format-name "id")
                  :table_id (id :venues)
                  :id (id :venues :id)}
    :category_id {:extra_info (if (fks-supported?) {:target_table_id (id :categories)}
                                  {})
                  :special_type (if (fks-supported?) :fk
                                    :category)
                  :base_type :IntegerField
                  :description nil
                  :name (format-name "category_id")
                  :table_id (id :venues)
                  :id (id :venues :category_id)}
    :price       {:extra_info {}
                  :special_type :category
                  :base_type :IntegerField
                  :description nil
                  :name (format-name "price")
                  :table_id (id :venues)
                  :id (id :venues :price)}
    :longitude   {:extra_info {}
                  :special_type :longitude,
                  :base_type :FloatField,
                  :description nil
                  :name (format-name "longitude")
                  :table_id (id :venues)
                  :id (id :venues :longitude)}
    :latitude    {:extra_info {}
                  :special_type :latitude
                  :base_type :FloatField
                  :description nil
                  :name (format-name "latitude")
                  :table_id (id :venues)
                  :id (id :venues :latitude)}
    :name        {:extra_info {}
                  :special_type nil
                  :base_type :TextField
                  :description nil
                  :name (format-name "name")
                  :table_id (id :venues)
                  :id (id :venues :name)}))

(defn venues-cols
  "`cols` information for all the columns in `venues`."
  []
  (mapv venue-col [:id :category_id :price :longitude :latitude :name]))

;; #### categories
(defn categories-col
  "Return column information for the `categories` column named by keyword COL."
  [col]
  (case col
    :id   {:extra_info {} :special_type :id, :base_type (id-field-type), :description nil, :name (format-name "id")
           :table_id (id :categories), :id (id :categories :id)}
    :name {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name (format-name "name")
           :table_id (id :categories), :id (id :categories :name)}))

;; #### checkins
(defn checkins-col
  "Return column information for the `checkins` column named by keyword COL."
  [col]
  (case col
    :id       {:extra_info {}
               :special_type :id
               :base_type (id-field-type)
               :description nil
               :name (format-name "id")
               :table_id (id :checkins)
               :id (id :checkins :id)}
    :venue_id {:extra_info (if (fks-supported?) {:target_table_id (id :venues)}
                               {})
               :special_type (when (fks-supported?)
                               :fk)
               :base_type :IntegerField
               :description nil
               :name (format-name "venue_id")
               :table_id (id :checkins)
               :id (id :checkins :venue_id)}
    :user_id  {:extra_info (if (fks-supported?) {:target_table_id (id :users)}
                               {})
               :special_type (if (fks-supported?) :fk
                                 :category)
               :base_type :IntegerField
               :description nil
               :name (format-name "user_id")
               :table_id (id :checkins)
               :id (id :checkins :user_id)}))


;; #### users
(defn users-col
  "Return column information for the `users` column named by keyword COL."
  [col]
  (case col
    :id         {:extra_info {}
                 :special_type :id
                 :base_type (id-field-type)
                 :description nil
                 :name (format-name "id")
                 :table_id (id :users)
                 :id (id :users :id)}
    :name       {:extra_info {}
                 :special_type :category
                 :base_type :TextField
                 :description nil
                 :name (format-name "name")
                 :table_id (id :users)
                 :id (id :users :name)}
    :last_login {:extra_info {}
                 :special_type :category
                 :base_type :DateTimeField
                 :description nil
                 :name (format-name "last_login")
                 :table_id (id :users)
                 :id (id :users :last_login)}))


;; # THE TESTS THEMSELVES (!)

;; ### "COUNT" AGGREGATION
(qp-expect-with-all-datasets
    {:rows [[100]]
     :columns ["count"]
     :cols [{:base_type :IntegerField
             :special_type :number
             :name "count"
             :id nil
             :table_id nil
             :description nil}]}
  {:source_table (id :venues)
   :filter [nil nil]
   :aggregation ["count"]
   :breakout [nil]
   :limit nil})

;; ### "SUM" AGGREGATION
(qp-expect-with-all-datasets
    {:rows [[203]]
     :columns ["sum"]
     :cols [{:base_type :IntegerField
             :special_type :category
             :name "sum"
             :id nil
             :table_id nil
             :description nil}]}
  {:source_table (id :venues)
   :filter [nil nil]
   :aggregation ["sum" (id :venues :price)]
   :breakout [nil]
   :limit nil})


;; ## "AVG" AGGREGATION
(qp-expect-with-all-datasets
    {:rows [[35.50589199999998]]
     :columns ["avg"]
     :cols [{:base_type :FloatField
             :special_type :latitude
             :name "avg"
             :id nil
             :table_id nil
             :description nil}]}
  {:source_table (id :venues)
   :filter [nil nil]
   :aggregation ["avg" (id :venues :latitude)]
   :breakout [nil]
   :limit nil})


;; ### "DISTINCT COUNT" AGGREGATION
(qp-expect-with-all-datasets
    {:rows [[15]]
     :columns ["count"]
     :cols [{:base_type :IntegerField
             :special_type :number
             :name "count"
             :id nil
             :table_id nil
             :description nil}]}
  {:source_table (id :checkins)
   :filter [nil nil]
   :aggregation ["distinct" (id :checkins :user_id)]
   :breakout [nil]
   :limit nil})


;; ## "ROWS" AGGREGATION
;; Test that a rows aggregation just returns rows as-is.
(qp-expect-with-all-datasets
    {:rows [[1 4 3 -165.374 10.0646 "Red Medicine"]
            [2 11 2 -118.329 34.0996 "Stout Burgers & Beers"]
            [3 11 2 -118.428 34.0406 "The Apple Pan"]
            [4 29 2 -118.465 33.9997 "Wurstküche"]
            [5 20 2 -118.261 34.0778 "Brite Spot Family Restaurant"]
            [6 20 2 -118.324 34.1054 "The 101 Coffee Shop"]
            [7 44 2 -118.305 34.0689 "Don Day Korean Restaurant"]
            [8 11 2 -118.342 34.1015 "25°"]
            [9 71 1 -118.301 34.1018 "Krua Siri"]
            [10 20 2 -118.292 34.1046 "Fred 62"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter nil
   :aggregation ["rows"]
   :breakout [nil]
   :limit 10
   :order_by [[(id :venues :id) "ascending"]]})


;; ## "PAGE" CLAUSE
;; Test that we can get "pages" of results.

;; ### PAGE - Get the first page
(qp-expect-with-all-datasets
    {:rows [[1 "African"]
            [2 "American"]
            [3 "Artisan"]
            [4 "Asian"]
            [5 "BBQ"]]
     :columns (->columns "id" "name")
     :cols [{:extra_info {} :special_type :id, :base_type (id-field-type), :description nil, :name (format-name "id")
             :table_id (id :categories), :id (id :categories :id)}
            {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name (format-name "name")
             :table_id (id :categories), :id (id :categories :name)}]}
  {:source_table (id :categories)
   :aggregation ["rows"]
   :page {:items 5
          :page 1}
   :order_by [[(id :categories :name) "ascending"]]})

;; ### PAGE - Get the second page
(qp-expect-with-all-datasets
    {:rows [[6 "Bakery"]
            [7 "Bar"]
            [8 "Beer Garden"]
            [9 "Breakfast / Brunch"]
            [10 "Brewery"]]
     :columns (->columns "id" "name")
     :cols [(categories-col :id)
            (categories-col :name)]}
  {:source_table (id :categories)
   :aggregation ["rows"]
   :page {:items 5
          :page 2}
   :order_by [[(id :categories :name) "ascending"]]})


;; ## "ORDER_BY" CLAUSE
;; Test that we can tell the Query Processor to return results ordered by multiple fields
(qp-expect-with-all-datasets
    {:rows [[1 12 375] [1 9 139] [1 1 72] [2 15 129] [2 12 471] [2 11 325] [2 9 590] [2 9 833] [2 8 380] [2 5 719]],
     :columns (->columns "venue_id" "user_id" "id")
     :cols [(checkins-col :venue_id)
            (checkins-col :user_id)
            (checkins-col :id)]}
  {:source_table (id :checkins)
   :aggregation ["rows"]
   :limit 10
   :fields [(id :checkins :venue_id)
            (id :checkins :user_id)
            (id :checkins :id)]
   :order_by [[(id :checkins :venue_id) "ascending"]
              [(id :checkins :user_id) "descending"]
              [(id :checkins :id) "ascending"]]})


;; ## "FILTER" CLAUSE

;; ### FILTER -- "AND", ">", ">="
(qp-expect-with-all-datasets
    {:rows [[55 67 4 -118.096 33.983 "Dal Rae Restaurant"]
            [61 67 4 -118.376 34.0677 "Lawry's The Prime Rib"]
            [77 40 4 -74.0045 40.7318 "Sushi Nakazawa"]
            [79 40 4 -73.9736 40.7514 "Sushi Yasuda"]
            [81 40 4 -73.9533 40.7677 "Tanoshi Sushi & Sake Bar"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter ["AND"
            [">" (id :venues :id) 50]
            [">=" (id :venues :price) 4]]
   :aggregation ["rows"]
   :breakout [nil]
   :limit nil})

;; ### FILTER -- "AND", "<", ">", "!="
(qp-expect-with-all-datasets
    {:rows [[21 58 2 -122.421 37.7441 "PizzaHacker"]
            [23 50 2 -122.42 37.765 "Taqueria Los Coyotes"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter ["AND"
            ["<" (id :venues :id) 24]
            [">" (id :venues :id) 20]
            ["!=" (id :venues :id) 22]]
   :aggregation ["rows"]
   :breakout [nil]
   :limit nil})

;; ### FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(qp-expect-with-all-datasets
    {:rows [[21 58 2 -122.421 37.7441 "PizzaHacker"]
            [22 50 1 -122.484 37.7822 "Gordo Taqueria"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter ["BETWEEN" (id :venues :id) 21 22]
   :aggregation ["rows"]
   :breakout [nil]
   :limit nil})

;; ### FILTER -- "OR", "<=", "="
(qp-expect-with-all-datasets
    {:rows [[1 4 3 -165.374 10.0646 "Red Medicine"]
            [2 11 2 -118.329 34.0996 "Stout Burgers & Beers"]
            [3 11 2 -118.428 34.0406 "The Apple Pan"]
            [5 20 2 -118.261 34.0778 "Brite Spot Family Restaurant"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter ["OR"
            ["<=" (id :venues :id) 3]
            ["=" (id :venues :id) 5]]
   :aggregation ["rows"]
   :breakout [nil]
   :limit nil})

;; TODO - These are working, but it would be nice to have some tests that covered
;; *  NOT_NULL
;; *  NULL

;; ### FILTER -- "INSIDE"
(qp-expect-with-all-datasets
    {:rows [[1 4 3 -165.374 10.0646 "Red Medicine"]]
     :columns (venues-columns)
     :cols (venues-cols)}
  {:source_table (id :venues)
   :filter ["INSIDE"
            (id :venues :latitude)
            (id :venues :longitude)
            10.0649
            -165.379
            10.0641
            -165.371]
   :aggregation ["rows"]
   :breakout [nil]
   :limit nil})


;; ## "FIELDS" CLAUSE
;; Test that we can restrict the Fields that get returned to the ones specified, and that results come back in the order of the IDs in the `fields` clause
(qp-expect-with-all-datasets
    {:rows [["Red Medicine" 1]
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
     :cols [(venue-col :name)
            (venue-col :id)]}
  {:source_table (id :venues)
   :filter [nil nil]
   :aggregation ["rows"]
   :fields [(id :venues :name)
            (id :venues :id)]
   :breakout [nil]
   :limit 10
   :order_by [[(id :venues :id) "ascending"]]})


;; ## "BREAKOUT"
;; ### "BREAKOUT" - SINGLE COLUMN
(qp-expect-with-all-datasets
    {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
     :columns [(format-name "user_id")
               "count"]
     :cols [(checkins-col :user_id)
            {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}
  {:source_table (id :checkins)
   :filter [nil nil]
   :aggregation ["count"]
   :breakout [(id :checkins :user_id)]
   :order_by [[(id :checkins :user_id) "ascending"]]
   :limit nil})

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(qp-expect-with-all-datasets
    {:rows [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]],
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols [(checkins-col :user_id)
            (checkins-col :venue_id)
            {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}
  {:source_table (id :checkins)
   :limit 10
   :aggregation ["count"]
   :breakout [(id :checkins :user_id)
              (id :checkins :venue_id)]})

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(qp-expect-with-all-datasets
    {:rows [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]],
     :columns [(format-name "user_id")
               (format-name "venue_id")
               "count"]
     :cols [(checkins-col :user_id)
            (checkins-col :venue_id)
            {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}
  {:source_table (id :checkins)
   :limit 10
   :aggregation ["count"]
   :breakout [(id :checkins :user_id)
              (id :checkins :venue_id)]
   :order_by [[(id :checkins :user_id) "descending"]
              [(id :checkins :venue_id) "ascending"]]})


;; ## EMPTY QUERY
;; Just don't barf
(expect-with-all-datasets
    {:status :completed
     :row_count 0
     :data {:rows [], :columns [], :cols []}}
  (driver/process-query {:type :query
                         :database (db-id)
                         :native {}
                         :query {:source_table 0
                                 :filter [nil nil]
                                 :aggregation ["rows"]
                                 :breakout [nil]
                                 :limit nil}}))


;; # POST PROCESSING TESTS

;; ## CUMULATIVE SUM

;; ### cum_sum w/o breakout should be treated the same as sum
(qp-expect-with-all-datasets
    {:rows [[(case (id-field-type)
               :IntegerField    120
               :BigIntegerField 120M)]]
     :columns ["sum"]
     :cols [{:base_type (id-field-type), :special_type :id, :name "sum", :id nil, :table_id nil, :description nil}]}
  {:source_table (id :users)
   :aggregation ["cum_sum" (id :users :id)]})

;; ### Simple cumulative sum where breakout field is same as cum_sum field
(qp-expect-with-all-datasets
    {:rows [[1] [3] [6] [10] [15] [21] [28] [36] [45] [55] [66] [78] [91] [105] [120]]
     :columns (->columns "id")
     :cols [(users-col :id)]}
  {:source_table (id :users)
   :breakout [(id :users :id)]
   :aggregation ["cum_sum" (id :users :id)]})

;; ### Cumulative sum w/ a different breakout field
(qp-expect-with-all-datasets
    {:rows [["Broen Olujimi" 14]
            ["Conchúr Tihomir" 21]
            ["Dwight Gresham" 34]
            ["Felipinho Asklepios" 36]
            ["Frans Hevel" 46]
            ["Kaneonuskatew Eiran" 49]
            ["Kfir Caj" 61]
            ["Nils Gotam" 70]
            ["Plato Yeshua" 71]
            ["Quentin Sören" 76]
            ["Rüstem Hebel" 91]
            ["Shad Ferdynand" 97]
            ["Simcha Yan" 101]
            ["Spiros Teofil" 112]
            ["Szymon Theutrich" 120]]
     :columns (->columns "name" "id")
     :cols [(users-col :name)
            (users-col :id)]}
  {:source_table (id :users)
   :breakout [(id :users :name)]
   :aggregation ["cum_sum" (id :users :id)]})

;; ### Cumulative sum w/ a different breakout field that requires grouping
(qp-expect-with-all-datasets
    {:columns (->columns "price" "id")
     :cols [(venue-col :price)
            (venue-col :id)]
     :rows [[1 1211]
            [2 4066]
            [3 4681]
            [4 5050]]}
  {:source_table (id :venues)
   :breakout     [(id :venues :price)]
   :aggregation  ["cum_sum" (id :venues :id)]})
