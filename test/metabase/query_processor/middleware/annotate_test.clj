(ns metabase.query-processor.middleware.annotate-test
  (:require [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.test.data :as data])
  (:import metabase.driver.h2.H2Driver))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             add-native-column-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure that `add-native-column-info` can still infer types even if the initial value(s) are `nil` (#4256)
(expect
  [{:name "a", :display_name "A", :base_type :type/Integer, :source :native}
   {:name "b", :display_name "B", :base_type :type/Integer, :source :native}]
  (:cols (#'annotate/add-native-column-info {:columns [:a :b], :rows [[1 nil]
                                                                      [2 nil]
                                                                      [3 nil]
                                                                      [4   5]
                                                                      [6   7]]})))

;; make sure that `add-native-column-info` defaults `base_type` to `type/*` if there are no non-nil
;; values when we peek.
(expect
  [{:name "a", :display_name "A", :base_type :type/*, :source :native}]
  (:cols (#'annotate/add-native-column-info {:columns [:a], :rows [[nil]]})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              add-mbql-column-info                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure columns are comming back the way we'd expect
(expect
  [(-> (Field (data/id :venues :price))
       (dissoc :database_type)
       (assoc :source :fields))]
  (qp.store/with-store
    (qp.store/store-field! (Field (data/id :venues :price)))
    (-> (#'annotate/add-mbql-column-info
         {:query {:fields [[:field-id (data/id :venues :price)]]}}
         {:columns [:price]})
        :cols
        vec)))

;; when an `fk->` form is used, we should add in `:fk_field_id` info about the source Field
(expect
  [(-> (Field (data/id :categories :name))
       (dissoc :database_type)
       (assoc :fk_field_id (data/id :venues :category_id), :source :fields))]
  (qp.store/with-store
    (qp.store/store-field! (Field (data/id :categories :name)))
    (-> (#'annotate/add-mbql-column-info
         {:query {:fields [[:fk->
                            [:field-id (data/id :venues :category_id)]
                            [:field-id (data/id :categories :name)]]]}}
         {:columns [:name]})
        :cols
        vec)))

;; when a `:datetime-field` form is used, we should add in info about the `:unit`
(expect
  [(-> (Field (data/id :venues :price))
       (dissoc :database_type)
       (assoc :unit :month, :source :fields))]
  (qp.store/with-store
    (qp.store/store-field! (Field (data/id :venues :price)))
    (-> (#'annotate/add-mbql-column-info
         {:query {:fields [[:datetime-field [:field-id (data/id :venues :price)] :month]]}}
         {:columns [:price]})
        :cols
        vec)))

;; datetime unit should work on field literals too
(expect
  [{:name         "price"
    :base_type    :type/Number
    :display_name "Price"
    :unit         :month
    :source       :fields}]
  (-> (#'annotate/add-mbql-column-info
       {:query {:fields [[:datetime-field [:field-literal "price" :type/Number] :month]]}}
       {:columns [:price]})
      :cols
      vec))

;; when binning-strategy is used, include `:binning_info`
(expect
  [{:name         "price"
    :base_type    :type/Number
    :display_name "Price"
    :unit         :month
    :source       :fields
    :binning_info {:num_bins         10
                   :bin_width        5
                   :min_value        -100
                   :max_value        100
                   :binning_strategy :num-bins}}]
  (-> (#'annotate/add-mbql-column-info
       {:query {:fields [[:binning-strategy
                          [:datetime-field [:field-literal "price" :type/Number] :month]
                          :num-bins
                          10
                          {:num-bins  10
                           :bin-width 5
                           :min-value -100
                           :max-value 100}]]}}
       {:columns [:price]})
      :cols
      vec))

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-name [ag-clause]
  (binding [qp.i/*driver* (H2Driver.)]
    (annotate/aggregation-name ag-clause)))

(expect
  "count"
  (aggregation-name [:count]))

(expect
  "count"
  (aggregation-name [:distinct [:field-id 1]]))

(expect
  "sum"
  (aggregation-name [:sum [:field-id 1]]))

(expect
  "count + 1"
  (aggregation-name [:+ [:count] 1]))

(expect
  "min + (2 * avg)"
  (aggregation-name [:+ [:min [:field-id 1]] [:* 2 [:avg [:field-id 2]]]]))

(expect
  "min + (2 * avg * 3 * (max - 4))"
  (aggregation-name [:+
                     [:min [:field-id 1]]
                     [:*
                      2
                      [:avg [:field-id 2]]
                      3
                      [:-
                       [:max [:field-id 3]]
                       4]]]))

(expect
  "x"
  (aggregation-name [:named [:+ [:min [:field-id 1]] [:* 2 [:avg [:field-id 2]]]] "x"]))

(expect
  "My Cool Aggregation"
  (aggregation-name [:named [:avg [:field-id 2]] "My Cool Aggregation"]))

;; make sure custom aggregation names get included in the col info
(defn- col-info-for-aggregation-clause [clause]
  (binding [qp.i/*driver* (metabase.driver.h2.H2Driver.)]
    (#'annotate/col-info-for-aggregation-clause clause)))

(expect
  {:base_type    :type/Float
   :special_type :type/Number
   :name         "count / 2"
   :display_name "count / 2"}
  (col-info-for-aggregation-clause [:/ [:count] 2]))

(expect
  {:base_type    :type/Float
   :special_type :type/Number
   :name         "sum"
   :display_name "sum"}
  (qp.store/with-store
    (data/$ids venues
      (qp.store/store-field! (Field $price))
      (col-info-for-aggregation-clause [:sum [:+ [:field-id $price] 1]]))))

;; if a driver is kind enough to supply us with some information about the `:cols` that come back, we should include
;; that information in the results. Their information should be preferred over ours
(expect
  {:cols    [{:name         "totalEvents"
              :display_name "Total Events"
              :base_type    :type/Text
              :source       :aggregation}]
   :columns ["totalEvents"]}
  (binding [qp.i/*driver* (H2Driver.)]
    ((annotate/add-column-info (constantly {:cols    [{:name         "totalEvents"
                                                       :display_name "Total Events"
                                                       :base_type    :type/Text}]
                                            :columns ["totalEvents"]}))
     {:database (data/id)
      :type     :query
      :query    {:source-table (data/id :venues)
                 :aggregation  [[:metric "ga:totalEvents"]]}})))

;; Make sure columns always come back with a unique `:name` key (#8759)
(expect
  {:cols
   [{:base_type    :type/Number
     :special_type :type/Number
     :name         "count"
     :display_name "count"
     :source       :aggregation}
    {:source       :aggregation
     :name         "sum"
     :display_name "sum"
     :base_type    :type/Number}
    {:base_type    :type/Number
     :special_type :type/Number
     :name         "count_2"
     :display_name "count"
     :source       :aggregation}
    {:base_type    :type/Number
     :special_type :type/Number
     :name         "count_2_2"
     :display_name "count_2"
     :source       :aggregation}]
   :columns ["count" "sum" "count" "count_2"]}
  (binding [qp.i/*driver* (H2Driver.)]
    ((annotate/add-column-info (constantly {:cols    [{:name         "count"
                                                       :display_name "count"
                                                       :base_type    :type/Number}
                                                      {:name         "sum"
                                                       :display_name "sum"
                                                       :base_type    :type/Number}
                                                      {:name         "count"
                                                       :display_name "count"
                                                       :base_type    :type/Number}
                                                      {:name         "count_2"
                                                       :display_name "count_2"
                                                       :base_type    :type/Number}]
                                            :columns ["count" "sum" "count" "count_2"]}))
     {:database (data/id)
      :type     :query
      :query    {:source-table (data/id :venues)
                 :aggregation  [[:count] [:sum] [:count] [:named [:count] "count_2"]]}})))

;; make sure expressions come back with the right set of keys, including `:expression_name` (#8854)
(expect
  {:name            "discount_price"
   :display_name    "discount_price"
   :base_type       :type/Float
   :special_type    :type/Number
   :expression_name "discount_price"
   :source          :fields}
  (-> (qp.test-util/with-everything-store
        ((annotate/add-column-info (constantly {}))
         {:database (data/id)
          :type     :query
          :query    (data/$ids [venues {:wrap-field-ids? true}]
                      {:source-table $$table
                       :expressions  {"discount_price" [:* 0.9 [:field-id $price]]}
                       :fields       [$name [:expression "discount_price"]]
                       :limit        10})}))
      :cols
      second))
