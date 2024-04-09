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

(def pivot-query-options
  "Pivot rows and columns for `pivot-query`"
  {:pivot_rows [1 0]
   :pivot_cols [2]})

(defn pivot-query
  "A basic pivot table query"
  ([]
   (pivot-query true))

  ([include-pivot-options?]
   (mt/dataset test-data
     (merge
      (mt/mbql-query orders
                     {:aggregation [[:count] [:sum $orders.quantity]]
                      :breakout    [$orders.user_id->people.state
                                    $orders.user_id->people.source
                                    $orders.product_id->products.category]})
      (when include-pivot-options?
        pivot-query-options)))))

(defn filters-query
  "A pivot table query with a filter applied"
  ([]
   (filters-query true))

  ([include-pivot-options?]
   (merge
    (mt/mbql-query orders
                   {:aggregation [[:count]]
                    :breakout    [$orders.user_id->people.state
                                  $orders.user_id->people.source]
                    :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]})
    (when include-pivot-options?
      {:pivot_rows [0]
       :pivot_cols [1]}))))

(defn parameters-query
  "A pivot table query with parameters"
  ([]
   (parameters-query true))

  ([include-pivot-options?]
   (merge
    (mt/mbql-query orders
       {:aggregation [[:count]]
        :breakout    [$orders.user_id->people.state
                      $orders.user_id->people.source]
        :filter      [:and [:= $orders.user_id->people.source "Google" "Organic"]]
        :parameters  [{:type   "category"
                       :target [:dimension $orders.product_id->products.category]
                       :value  "Gadget"}]})
    (when include-pivot-options?
      {:pivot_rows [0]
       :pivot_cols [1]}))))

(defn pivot-card
  "A dashboard card query with a pivot table"
  []
  (let [pivot-query (pivot-query false)
        breakout    (-> pivot-query :query :breakout)]
    {:dataset_query pivot-query
     :visualization_settings
     {:pivot_table.column_split
      {:rows    [(get breakout 1) (get breakout 0)]
       :columns [(get breakout 2)]}}}))
