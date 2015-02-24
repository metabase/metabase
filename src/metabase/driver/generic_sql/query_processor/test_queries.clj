(ns metabase.driver.generic-sql.query-processor.test-queries
  "Sample queries to use for testing/debugging the Query Processor.")

(def q-count
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["count"]
           :breakout [nil]
           :limit nil}})

(def q-sum
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["sum" 1413]
           :breakout [nil]
           :limit nil}})

(def q-distinct-count
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["distinct" 1412]
           :breakout [nil]
           :limit nil}})

(def q-avg
  {:type :query
   :database 2
   :query {:source_table 37
           :filter [nil nil]
           :aggregation ["avg" 257]
           :breakout [nil]
           :limit nil}})

(def q-rows
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["rows"]
           :breakout [nil]
           :limit 10}})

(def q-fields
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["rows"]
           :fields [1412 1413]
           :breakout [nil]
           :limit 10}})

(def q-order-by
  {:type :query
   :database 2
   :query {:source_table 100
           :filter [nil nil]
           :aggregation ["rows"]
           :breakout [nil]
           :limit nil
           :order_by [[1416 "ascending"]
                      [1412 "descending"]]}})

(def q-filter
  {:type :query
   :database 2
   :query {:source_table 100
           :filter ["AND"
                    [">" 1413 1]
                    [">=" 1412 4]]
           :aggregation ["rows"]
           :breakout [nil]
           :limit nil}})

(def q-breakout
  {:type :query
   :database 1
   :query {:source_table 22
           :filter [nil nil]
           :aggregation ["count"]
           :breakout [5 12]
           :limit nil}})
