(ns metabase.driver.generic-sql.query-processor-test
  (:require [clojure.math.numeric-tower :as math]
            [expectations :refer :all]
            [metabase.driver.generic-sql.query-processor :refer :all]
            [metabase.test-data :refer [db-id table->id field->id]]))

(def venues-columns
  (delay ["ID" "CATEGORY_ID" "PRICE" "LONGITUDE" "LATITUDE" "NAME"]))

(def venues-cols
  (delay [{:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :venues), :id (field->id :venues :id)}
          {:extra_info {:target_table_id (table->id :categories)} :special_type :fk, :base_type :IntegerField, :description nil, :name "CATEGORY_ID", :table_id (table->id :venues), :id (field->id :venues :category_id)}
          {:extra_info {} :special_type :category, :base_type :IntegerField, :description nil, :name "PRICE", :table_id (table->id :venues), :id (field->id :venues :price)}
          {:extra_info {} :special_type :longitude, :base_type :FloatField, :description nil, :name "LONGITUDE", :table_id (table->id :venues), :id (field->id :venues :longitude)}
          {:extra_info {} :special_type :latitude, :base_type :FloatField, :description nil, :name "LATITUDE", :table_id (table->id :venues), :id (field->id :venues :latitude)}
          {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name "NAME", :table_id (table->id :venues), :id (field->id :venues :name)}]))

;; ## "COUNT" AGGREGATION
(expect {:status :completed
         :row_count 1
         :data {:rows [[100]]
                :columns ["count"]
                :cols [{:base_type :IntegerField
                        :special_type :number
                        :name "count"
                        :id nil
                        :table_id nil
                        :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter [nil nil]
                                  :aggregation ["count"]
                                  :breakout [nil]
                                  :limit nil}}))

;; ## "SUM" AGGREGATION
(expect {:status :completed
         :row_count 1
         :data {:rows [[203]]
                :columns ["sum"]
                :cols [{:base_type :IntegerField
                        :special_type :category
                        :name "sum"
                        :id nil
                        :table_id nil
                        :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter [nil nil]
                                  :aggregation ["sum" (field->id :venues :price)]
                                  :breakout [nil]
                                  :limit nil}}))

;; ## "DISTINCT COUNT" AGGREGATION
(expect {:status :completed
         :row_count 1
         :data {:rows [[15]]
                :columns ["count"]
                :cols [{:base_type :IntegerField
                        :special_type :number
                        :name "count"
                        :id nil
                        :table_id nil
                        :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :checkins)
                                  :filter [nil nil]
                                  :aggregation ["distinct" (field->id :checkins :user_id)]
                                  :breakout [nil]
                                  :limit nil}}))

;; ## "AVG" AGGREGATION
;; TODO - try this with an integer field. (Should the average of an integer field be a float or an int?)
(expect {:status :completed,
         :row_count 1,
         :data {:rows [[35.50589199999998]]
                :columns ["avg"]
                :cols [{:base_type :FloatField
                        :special_type :latitude
                        :name "avg"
                        :id nil
                        :table_id nil
                        :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter [nil nil]
                                  :aggregation ["avg" (field->id :venues :latitude)]
                                  :breakout [nil]
                                  :limit nil}}))

;; ## "STDDEV" AGGREGATION
(expect {:status :completed
         :row_count 1
         :data {:rows [[3.43467255295115]]
                :columns ["stddev"]
                :cols [{:base_type :FloatField
                        :special_type :latitude
                        :name "stddev"
                        :id nil
                        :table_id nil
                        :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter [nil nil]
                                  :aggregation ["stddev" (field->id :venues :latitude)]
                                  :breakout [nil]
                                  :limit nil}}))

;; ## "ROWS" AGGREGATION
;; Test that a rows aggregation just returns rows as-is.
(expect {:status :completed,
         :row_count 10,
         :data
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
          :columns @venues-columns
          :cols @venues-cols}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter nil
                                  :aggregation ["rows"]
                                  :breakout [nil]
                                  :limit 10
                                  :order_by [[(field->id :venues :id) "ascending"]]}}))

;; ## "PAGE" CLAUSE
;; Test that we can get "pages" of results.

;; ### PAGE - Get the first page
(expect {:status :completed
         :row_count 5
         :data {:rows [[1 "African"]
                       [2 "American"]
                       [3 "Artisan"]
                       [4 "Asian"]
                       [5 "BBQ"]]
                :columns ["ID", "NAME"]
                :cols [{:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :categories), :id (field->id :categories :id)}
                       {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name "NAME", :table_id (table->id :categories), :id (field->id :categories :name)}]}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :categories)
                            :aggregation ["rows"]
                            :page {:items 5
                                   :page 1}
                            :order_by [[(field->id :categories :name) "ascending"]]}}))

;; ### PAGE - Get the second page
(expect {:status :completed
         :row_count 5
         :data {:rows [[6 "Bakery"]
                       [7 "Bar"]
                       [8 "Beer Garden"]
                       [9 "Breakfast / Brunch"]
                       [10 "Brewery"]]
                :columns ["ID", "NAME"]
                :cols [{:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :categories), :id (field->id :categories :id)}
                       {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name "NAME", :table_id (table->id :categories), :id (field->id :categories :name)}]}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :categories)
                            :aggregation ["rows"]
                            :page {:items 5
                                   :page 2}
                            :order_by [[(field->id :categories :name) "ascending"]]}}))

;; ## "FIELDS" CLAUSE
;; Test that we can restrict the Fields that get returned to the ones specified, and that results come back in the order of the IDs in the `fields` clause
(expect {:status :completed,
         :row_count 10,
         :data {:rows [["Red Medicine" 1]
                       ["Stout Burgers & Beers" 2]
                       ["The Apple Pan" 3]
                       ["Wurstküche" 4]
                       ["Brite Spot Family Restaurant" 5]
                       ["The 101 Coffee Shop" 6]
                       ["Don Day Korean Restaurant" 7]
                       ["25°" 8]
                       ["Krua Siri" 9]
                       ["Fred 62" 10]],
                :columns ["NAME" "ID"],
                :cols [{:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name "NAME", :table_id (table->id :venues), :id (field->id :venues :name)}
                       {:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :venues), :id (field->id :venues :id)}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter [nil nil]
                                  :aggregation ["rows"]
                                  :fields [(field->id :venues :name)
                                           (field->id :venues :id)]
                                  :breakout [nil]
                                  :limit 10
                                  :order_by [[(field->id :venues :id) "ascending"]]}}))

;; ## "ORDER_BY" CLAUSE
;; Test that we can tell the Query Processor to return results ordered by multiple fields
(expect {:status :completed,
         :row_count 10,
         :data {:rows [[1 12 375] [1 9 139] [1 1 72] [2 15 129] [2 12 471] [2 11 325] [2 9 590] [2 9 833] [2 8 380] [2 5 719]],
                :columns ["VENUE_ID" "USER_ID" "ID"],
                :cols [{:extra_info {:target_table_id (table->id :venues)} :special_type :fk, :base_type :IntegerField, :description nil, :name "VENUE_ID", :table_id (table->id :checkins), :id (field->id :checkins :venue_id)}
                       {:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil, :name "USER_ID", :table_id (table->id :checkins), :id (field->id :checkins :user_id)}
                       {:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :checkins), :id (field->id :checkins :id)}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :checkins)
                                  :aggregation ["rows"]
                                  :limit 10
                                  :fields [(field->id :checkins :venue_id)
                                           (field->id :checkins :user_id)
                                           (field->id :checkins :id)]
                                  :order_by [[(field->id :checkins :venue_id) "ascending"]
                                             [(field->id :checkins :user_id) "descending"]
                                             [(field->id :checkins :id) "ascending"]]}}))

;; ## "FILTER" CLAUSE


;; ### FILTER -- "AND", ">", ">="
(expect {:status :completed,
         :row_count 5,
         :data
         {:rows [[55 67 4 -118.096 33.983 "Dal Rae Restaurant"]
                 [61 67 4 -118.376 34.0677 "Lawry's The Prime Rib"]
                 [77 40 4 -74.0045 40.7318 "Sushi Nakazawa"]
                 [79 40 4 -73.9736 40.7514 "Sushi Yasuda"]
                 [81 40 4 -73.9533 40.7677 "Tanoshi Sushi & Sake Bar"]]
          :columns @venues-columns
          :cols @venues-cols}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :venues)
                                  :filter ["AND"
                                           [">" (field->id :venues :id) 50]
                                           [">=" (field->id :venues :price) 4]]
                                  :aggregation ["rows"]
                                  :breakout [nil]
                                  :limit nil}}))

;; ### FILTER -- "AND", "<", ">", "!="
(expect
    {:status :completed
     :row_count 2
     :data {:rows [[21 58 2 -122.421 37.7441 "PizzaHacker"]
                   [23 50 2 -122.42 37.765 "Taqueria Los Coyotes"]]
            :columns @venues-columns
            :cols @venues-cols}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :venues)
                            :filter ["AND"
                                     ["<" (field->id :venues :id) 24]
                                     [">" (field->id :venues :id) 20]
                                     ["!=" (field->id :venues :id) 22]]
                            :aggregation ["rows"]
                            :breakout [nil]
                            :limit nil}}))

;; ### FILTER -- "BETWEEN", single subclause (neither "AND" nor "OR")
(expect
    {:status :completed
     :row_count 2
     :data {:rows [[21 58 2 -122.421 37.7441 "PizzaHacker"]
                   [22 50 1 -122.484 37.7822 "Gordo Taqueria"]]
            :columns @venues-columns
            :cols @venues-cols}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :venues)
                            :filter ["BETWEEN" (field->id :venues :id) 21 22]
                            :aggregation ["rows"]
                            :breakout [nil]
                            :limit nil}}))

;; ### FILTER -- "OR", "<=", "="
(expect
    {:status :completed,
     :row_count 4,
     :data {:rows [[1 4 3 -165.374 10.0646 "Red Medicine"]
                   [2 11 2 -118.329 34.0996 "Stout Burgers & Beers"]
                   [3 11 2 -118.428 34.0406 "The Apple Pan"]
                   [5 20 2 -118.261 34.0778 "Brite Spot Family Restaurant"]]
            :columns @venues-columns
            :cols @venues-cols}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :venues)
                            :filter ["OR"
                                     ["<=" (field->id :venues :id) 3]
                                     ["=" (field->id :venues :id) 5]]
                            :aggregation ["rows"]
                            :breakout [nil]
                            :limit nil}}))

;; TODO - These are working, but it would be nice to have some tests that covered
;; *  NOT_NULL
;; *  NULL

;; ### FILTER -- "INSIDE"
;; TODO - add "NEAR"
(expect
  {:status :completed
   :row_count 1
   :data {:rows [[1 4 3 -165.374 10.0646 "Red Medicine"]]
          :columns @venues-columns
          :cols @venues-cols}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:source_table (table->id :venues)
                            :filter ["INSIDE"
                                     (field->id :venues :latitude)
                                     (field->id :venues :longitude)
                                     10.0649
                                     -165.379
                                     10.0641
                                     -165.371]
                            :aggregation ["rows"]
                            :breakout [nil]
                            :limit nil}}))

;; ## "BREAKOUT"
;; ### "BREAKOUT" - SINGLE COLUMN
(expect {:status :completed,
         :row_count 15,
         :data {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
                :columns ["USER_ID" "count"],
                :cols [{:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil, :name "USER_ID", :table_id (table->id :checkins) :id (field->id :checkins :user_id)}
                       {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :checkins)
                                  :filter [nil nil]
                                  :aggregation ["count"]
                                  :breakout [(field->id :checkins :user_id)]
                                  :order_by [[(field->id :checkins :user_id) "ascending"]]
                                  :limit nil}}))

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ IMPLICT "ORDER_BY"
;; Fields should be implicitly ordered :ASC for all the fields in `breakout` that are not specified in `order_by`
(expect {:status :completed,
         :row_count 10,
         :data {:rows [[1 1 1] [1 5 1] [1 7 1] [1 10 1] [1 13 1] [1 16 1] [1 26 1] [1 31 1] [1 35 1] [1 36 1]],
                :columns ["USER_ID" "VENUE_ID" "count"],
                :cols [{:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil, :name "USER_ID", :table_id (table->id :checkins), :id (field->id :checkins :user_id)}
                       {:extra_info {:target_table_id (table->id :venues)} :special_type :fk, :base_type :IntegerField, :description nil, :name "VENUE_ID", :table_id (table->id :checkins), :id (field->id :checkins :venue_id)}
                       {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :checkins)
                                  :limit 10
                                  :aggregation ["count"]
                                  :breakout [(field->id :checkins :user_id)
                                             (field->id :checkins :venue_id)]}}))

;; ### "BREAKOUT" - MULTIPLE COLUMNS W/ EXPLICIT "ORDER_BY"
;; `breakout` should not implicitly order by any fields specified in `order_by`
(expect {:status :completed,
         :row_count 10,
         :data {:rows [[15 2 1] [15 3 1] [15 7 1] [15 14 1] [15 16 1] [15 18 1] [15 22 1] [15 23 2] [15 24 1] [15 27 1]],
                :columns ["USER_ID" "VENUE_ID" "count"],
                :cols [{:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil, :name "USER_ID", :table_id (table->id :checkins), :id (field->id :checkins :user_id)}
                       {:extra_info {:target_table_id (table->id :venues)} :special_type :fk, :base_type :IntegerField, :description nil, :name "VENUE_ID", :table_id (table->id :checkins), :id (field->id :checkins :venue_id)}
                       {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}}
        (process-and-run {:type :query
                          :database @db-id
                          :query {:source_table (table->id :checkins)
                                  :limit 10
                                  :aggregation ["count"]
                                  :breakout [(field->id :checkins :user_id)
                                             (field->id :checkins :venue_id)]
                                  :order_by [[(field->id :checkins :user_id) "descending"]
                                             [(field->id :checkins :venue_id) "ascending"]]}}))

;; ## EMPTY QUERY
;; Just don't barf
(expect {:status :completed, :row_count 0, :data {:rows [], :columns [], :cols []}}
        (process-and-run {:type :query
                          :database @db-id
                          :native {}
                          :query {:source_table 0
                                  :filter [nil nil]
                                  :aggregation ["rows"]
                                  :breakout [nil]
                                  :limit nil}}))


;; # POST PROCESSING TESTS

;; ## CUMULATIVE SUM

;; ### Simple cumulative sum w/o any breakout
(expect {:status :completed
         :row_count 15
         :data {:rows [[1] [3] [6] [10] [15] [21] [28] [36] [45] [55] [66] [78] [91] [105] [120]]
                :columns ["ID"]
                :cols [{:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :users), :id (field->id :users :id)}]}}
  (process-and-run {:type :query
                    :database @db-id
                    :query {:limit nil
                            :source_table (table->id :users)
                            :filter [nil nil]
                            :breakout [nil]
                            :aggregation ["cum_sum" (field->id :users :id)]}}))

;; ### Cumulative sum w/ a breakout field
(expect {:status :completed
         :row_count 15
         :data {:rows [4 12 13 22 34 44 57 72 78 85 90 104 115 118 120]
                :columns ["CAST(LAST_LOGIN AS DATE)" "ID"]
                :cols [{:extra_info {} :special_type :category :base_type :DateTimeField, :description nil, :name "LAST_LOGIN", :table_id (table->id :users), :id (field->id :users :last_login)}
                       {:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :users), :id (field->id :users :id)}]}}
  (-> (process-and-run {:type :query
                        :database @db-id
                        :query {:limit nil
                                :source_table (table->id :users)
                                :filter [nil nil]
                                :breakout [(field->id :users :last_login)]
                                :aggregation ["cum_sum" (field->id :users :id)]}})
      ;; Rows come back like `[value timestamp]` but it is hard to compare timestamps directly since the values that come back are casted
      ;; to Dates and the exact value depends on the locale of the machine running the tests. So just drop the timestamps from the results.
      (update-in [:data :rows] (partial map last))))


;; # ERROR RESPONSES

;; Check that we get an error response formatted the way we'd expect
(expect
    {:status :failed
     :error "Column \"CHECKINS.NAME\" not found; SQL statement:\nSELECT \"CHECKINS\".* FROM \"CHECKINS\" WHERE (\"CHECKINS\".\"NAME\" = ?) LIMIT 65536"}
  (process-and-run {:database @db-id
                    :type :query
                    :query {:source_table (table->id :checkins)
                            :filter ["=" (field->id :venues :name) 1] ; wrong Field
                            :aggregation ["rows"]
                            :breakout [nil]
                            :limit nil}}))
