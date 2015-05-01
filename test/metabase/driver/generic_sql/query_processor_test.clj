(ns metabase.driver.generic-sql.query-processor-test
  (:require [clojure.math.numeric-tower :as math]
            [expectations :refer :all]
            [metabase.driver :as driver]
            [metabase.test-data :refer [db-id table->id field->id]]))

(def ^:const venues-columns
  ["ID" "CATEGORY_ID" "PRICE" "LONGITUDE" "LATITUDE" "NAME"])

(def venues-cols
  (delay [{:extra_info {} :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :venues), :id (field->id :venues :id)}
          {:extra_info {:target_table_id (table->id :categories)} :special_type :fk, :base_type :IntegerField, :description nil, :name "CATEGORY_ID", :table_id (table->id :venues), :id (field->id :venues :category_id)}
          {:extra_info {} :special_type :category, :base_type :IntegerField, :description nil, :name "PRICE", :table_id (table->id :venues), :id (field->id :venues :price)}
          {:extra_info {} :special_type :longitude, :base_type :FloatField, :description nil, :name "LONGITUDE", :table_id (table->id :venues), :id (field->id :venues :longitude)}
          {:extra_info {} :special_type :latitude, :base_type :FloatField, :description nil, :name "LATITUDE", :table_id (table->id :venues), :id (field->id :venues :latitude)}
          {:extra_info {} :special_type nil, :base_type :TextField, :description nil, :name "NAME", :table_id (table->id :venues), :id (field->id :venues :name)}]))


;; ## "AVG" AGGREGATION
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
  (driver/process-query {:type :query
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
  (driver/process-query {:type :query
                         :database @db-id
                         :query {:source_table (table->id :venues)
                                 :filter [nil nil]
                                 :aggregation ["stddev" (field->id :venues :latitude)]
                                 :breakout [nil]
                                 :limit nil}}))

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
  (driver/process-query {:type :query
                         :database @db-id
                         :query {:source_table (table->id :venues)
                                 :filter [nil nil]
                                 :aggregation ["rows"]
                                 :fields [(field->id :venues :name)
                                          (field->id :venues :id)]
                                 :breakout [nil]
                                 :limit 10
                                 :order_by [[(field->id :venues :id) "ascending"]]}}))


;; ## "BREAKOUT"
;; ### "BREAKOUT" - SINGLE COLUMN
(expect {:status :completed,
         :row_count 15,
         :data {:rows [[1 31] [2 70] [3 75] [4 77] [5 69] [6 70] [7 76] [8 81] [9 68] [10 78] [11 74] [12 59] [13 76] [14 62] [15 34]],
                :columns ["USER_ID" "count"],
                :cols [{:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil, :name "USER_ID", :table_id (table->id :checkins) :id (field->id :checkins :user_id)}
                       {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}}
  (driver/process-query {:type :query
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
                :cols [{:extra_info {:target_table_id (table->id :users)} :special_type :fk, :base_type :IntegerField, :description nil,
                        :name "USER_ID", :table_id (table->id :checkins), :id (field->id :checkins :user_id)}
                       {:extra_info {:target_table_id (table->id :venues)} :special_type :fk, :base_type :IntegerField, :description nil,
                        :name "VENUE_ID", :table_id (table->id :checkins), :id (field->id :checkins :venue_id)}
                       {:base_type :IntegerField, :special_type :number, :name "count", :id nil, :table_id nil, :description nil}]}}
  (driver/process-query {:type :query
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
  (driver/process-query {:type :query
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
  (driver/process-query {:type :query
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
  (driver/process-query {:type :query
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
  (-> (driver/process-query {:type :query
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
     :error "Column \"CHECKINS.NAME\" not found; SQL statement:\nSELECT \"CHECKINS\".* FROM \"CHECKINS\" WHERE (\"CHECKINS\".\"NAME\" = ?)"}
  (driver/process-query {:database @db-id
                         :type :query
                         :query {:source_table (table->id :checkins)
                                 :filter ["=" (field->id :venues :name) 1] ; wrong Field
                                 :aggregation ["rows"]
                                 :breakout [nil]
                                 :limit nil}}))
