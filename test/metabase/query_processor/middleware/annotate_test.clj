(ns metabase.query-processor.middleware.annotate-test
  (:require [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as i]
             [store :as qp.store]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.test.data :as data])
  (:import metabase.driver.h2.H2Driver))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             add-native-column-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure that `add-native-column-info` can still infer types even if the initial value(s) are `nil` (#4256)
(expect
  [{:name "a", :display_name "A", :base_type :type/Integer}
   {:name "b", :display_name "B", :base_type :type/Integer}]
  (:cols (#'annotate/add-native-column-info {:columns [:a :b], :rows [[1 nil]
                                                                      [2 nil]
                                                                      [3 nil]
                                                                      [4   5]
                                                                      [6   7]]})))

;; make sure that `add-native-column-info` defaults `base_type` to `type/*` if there are no non-nil
;; values when we peek.
(expect
  [{:name "a", :display_name "A", :base_type :type/*}]
  (:cols (#'annotate/add-native-column-info {:columns [:a], :rows [[nil]]})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              add-mbql-column-info                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure columns are comming back the way we'd expect
(expect
  [(dissoc (Field (data/id :venues :price)) :database_type)]
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
       (assoc :fk_field_id (data/id :venues :category_id)))]
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
       (assoc :unit :month))]
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
    :unit         :month}]
  (-> (#'annotate/add-mbql-column-info
       {:query {:fields [[:datetime-field [:field-literal "price" :type/Number] :month]]}}
       {:columns [:price]})
      :cols
      vec))

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-name [ag-clause]
  (binding [i/*driver* (H2Driver.)]
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
  "My Cool Aggregation"
  (aggregation-name [:named [:avg [:field-id 2]] "My Cool Aggregation"]))

;; TODO - more tests for info added for aggregations
