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

;; ### Cumulative sum w/ a breakout field
(expect {:status :completed
         :row_count 15
         :data
         {:rows [[4 4M] [12 8M] [13 1M] [22 9M] [34 12M] [44 10M] [57 13M] [72 15M] [78 6M] [85 7M] [90 5M] [104 14M] [115 11M] [118 3M] [120 2M]]
          :columns ["ID" "sum"]
          :cols [{:extra_info {}, :special_type :id, :base_type :BigIntegerField, :description nil, :name "ID", :table_id (table->id :users), :id (field->id :users :id)}
                 {:base_type :BigIntegerField, :special_type :id, :name "sum", :id nil, :table_id nil, :description nil}]}}
  (driver/process-query {:type :query
                         :database @db-id
                         :query {:limit nil
                                 :source_table (table->id :users)
                                 :filter [nil nil]
                                 :breakout [(field->id :users :last_login)]
                                 :aggregation ["cum_sum" (field->id :users :id)]}}))


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
