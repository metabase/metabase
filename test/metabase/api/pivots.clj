(ns metabase.api.pivots
  (:require
   [metabase.test :as mt]))

(defn applicable-drivers
  "Drivers that these pivot table tests should run on"
  []
  (disj (mt/normal-drivers-with-feature :expressions :left-join)
        ;; mongodb doesn't support foreign keys required by this test
        :mongo
        ;; Disable on Redshift due to OutOfMemory issue (see #18834)
        :redshift))

(defn pivot-query
  "A basic pivot table query"
  []
  (mt/dataset sample-dataset
    (-> (mt/mbql-query orders
                       {:aggregation [[:count] [:sum $orders.quantity]]
                        :breakout    [$orders.user_id->people.state
                                      $orders.user_id->people.source
                                      $orders.product_id->products.category]})
        (assoc :pivot_rows [1 0]
               :pivot_cols [2]))))

(defn filters-query
  "A pivot table query with a filter applied"
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [$orders.user_id->people.state
                       $orders.user_id->people.source]
         :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn parameters-query
  "A pivot table query with parameters"
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [$orders.user_id->people.state
                       $orders.user_id->people.source]
         :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]
         :parameters  [{:type   "category"
                        :target [:dimension $orders.product_id->products.category]
                        :value  "Gadget"}]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn pivot-card
  "A dashboard card query with a pivot table"
  []
  {:dataset_query (pivot-query)})
