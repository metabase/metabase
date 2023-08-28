(ns metabase.lib.drill-thru-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn by-name [cols column-name]
  (first (filter #(= (:name %) column-name) cols)))

(def orders-query
  (lib/query meta/metadata-provider (meta/table-metadata :orders)))

(def orders-row
  [{:column-name "ID" :value 2}
   {:column-name "USER_ID" :value 1}
   {:column-name "PRODUCT_ID" :value 123}
   {:column-name "SUBTOTAL" :value 110.93}
   {:column-name "TAX" :value 6.10}
   {:column-name "TOTAL" :value 117.03}
   {:column-name "DISCOUNT" :value nil}
   {:column-name "CREATED_AT" :value "2018-05-15T08:04:04.58Z"}
   {:column-name "QUANTITY" :value 3}])

(def products-query
  (lib/query meta/metadata-provider (meta/table-metadata :products)))

(def products-row
  [{:column-name "ID" :value 118}
   {:column-name "EAN" :value "5291392809646"}
   {:column-name "TITLE" :value "Synergistic Rubber Shoes"}
   {:column-name "CATEGORY" :value "Gadget"}
   {:column-name "VENDOR" :value "Herta Skiles and Sons"}
   {:column-name "PRICE" :value 38.42}
   {:column-name "RATING" :value 3.5}
   {:column-name "CREATED_AT" :value "2016-10-19T12:34:56.789Z"}])

(deftest ^:parallel table-view-available-drill-thrus-headers-pk-test
  (testing "column headers: click on"
    (testing "primary key - column filter (default: Is), sort, summarize (distinct only)"
      (is (=? [{:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/column-filter
                :column          (meta/field-metadata :orders :id)
                :initial-op      {:short := :display-name-variant :default}}
               {:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/sort
                :column          (meta/field-metadata :orders :id)
                :sort-directions [:asc :desc]}
               {:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/summarize-column
                :column          (meta/field-metadata :orders :id)
                :aggregations    [:distinct]}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :id)
                                                          :value  nil}))))))

(deftest ^:parallel table-view-available-drill-thrus-headers-fk-test
  (testing "column headers: click on"
    (testing "foreign key - distribution, column filter (default: Is), sort, summarize (distinct only)"
      (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                :type     :drill-thru/distribution
                :column   (meta/field-metadata :orders :user-id)}
               {:lib/type   :metabase.lib.drill-thru/drill-thru
                :type       :drill-thru/column-filter
                :column     (meta/field-metadata :orders :user-id)
                :initial-op {:short := :display-name-variant :default}}
               {:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/sort
                :column          (meta/field-metadata :orders :user-id)
                :sort-directions [:asc :desc]}
               {:lib/type     :metabase.lib.drill-thru/drill-thru
                :type         :drill-thru/summarize-column
                :column       (meta/field-metadata :orders :user-id)
                :aggregations [:distinct]}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :user-id)
                                                          :value  nil}))))))

(deftest ^:parallel table-view-available-drill-thrus-headers-numeric-column-test
  (testing "column headers: click on"
    (testing "numeric column - distribution, column filter (default: Equal To), sort, summarize (all 3), summarize by time"
      (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                :type     :drill-thru/distribution
                :column   (meta/field-metadata :orders :subtotal)}
               {:lib/type   :metabase.lib.drill-thru/drill-thru
                :type       :drill-thru/column-filter
                :column     (meta/field-metadata :orders :subtotal)
                :initial-op {:short := :display-name-variant :equal-to}}
               {:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/sort
                :column          (meta/field-metadata :orders :subtotal)
                :sort-directions [:asc :desc]}
               {:lib/type     :metabase.lib.drill-thru/drill-thru
                :type         :drill-thru/summarize-column
                :column       (meta/field-metadata :orders :subtotal)
                :aggregations [:distinct :sum :avg]}
               {:lib/type :metabase.lib.drill-thru/drill-thru
                :type     :drill-thru/summarize-column-by-time
                :column   (meta/field-metadata :orders :subtotal)
                :breakout (meta/field-metadata :orders :created-at)}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :subtotal)
                                                          :value  nil}))))))

(deftest ^:parallel table-view-available-drill-thrus-headers-date-column-test
  (testing "column headers: click on"
    (testing "date column - distribution, column filter (no default), sort, summarize (distinct only)"
      (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                :type     :drill-thru/distribution
                :column   (meta/field-metadata :orders :created-at)}
               {:lib/type   :metabase.lib.drill-thru/drill-thru
                :type       :drill-thru/column-filter
                :column     (meta/field-metadata :orders :created-at)
                :initial-op nil}
               {:lib/type        :metabase.lib.drill-thru/drill-thru
                :type            :drill-thru/sort
                :column          (meta/field-metadata :orders :created-at)
                :sort-directions [:asc :desc]}
               {:lib/type     :metabase.lib.drill-thru/drill-thru
                :type         :drill-thru/summarize-column
                :column       (meta/field-metadata :orders :created-at)
                :aggregations [:distinct]}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :created-at)
                                                          :value  nil}))))))

(deftest ^:parallel table-view-available-drill-thrus-headers-sorted-column-test
  (testing "column headers: click on"
    (testing "a sorted column"
      (let [expected [{:lib/type :metabase.lib.drill-thru/drill-thru
                       :type     :drill-thru/distribution
                       :column   (meta/field-metadata :orders :subtotal)}
                      {:lib/type   :metabase.lib.drill-thru/drill-thru
                       :type       :drill-thru/column-filter
                       :column     (meta/field-metadata :orders :subtotal)
                       :initial-op {:short := :display-name-variant :equal-to}}
                      {:lib/type        :metabase.lib.drill-thru/drill-thru
                       :type            :drill-thru/sort
                       :column          (meta/field-metadata :orders :subtotal)
                       ;; Starting off empty.
                       :sort-directions []}
                      {:lib/type     :metabase.lib.drill-thru/drill-thru
                       :type         :drill-thru/summarize-column
                       :column       (meta/field-metadata :orders :subtotal)
                       :aggregations [:distinct :sum :avg]}
                      {:lib/type :metabase.lib.drill-thru/drill-thru
                       :type     :drill-thru/summarize-column-by-time
                       :column   (meta/field-metadata :orders :subtotal)
                       :breakout (meta/field-metadata :orders :created-at)}]]
        (doseq [[sort-dir other-option] [[:asc :desc]
                                         [:desc :asc]]]
          (testing (str "which is " sort-dir " and the sort drill only offers " other-option)
            (is (=? (assoc-in expected [2 :sort-directions] [other-option])
                    (-> orders-query
                        (lib/order-by -1 (meta/field-metadata :orders :subtotal) sort-dir)
                        (lib/available-drill-thrus -1 {:column (meta/field-metadata :orders :subtotal)
                                                       :value  nil}))))))))))

(deftest ^:parallel table-view-available-drill-thrus-fk-value-test
  (testing "table values: click on"
    (testing "foreign key - FK filter and FK details"
      (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru
                :type     :drill-thru/fk-filter
                :filter   [:= {:lib/uuid string?}
                           [:field {:lib/uuid string?} (meta/id :orders :user-id)]
                           1]}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/fk-details
                :column    (meta/field-metadata :orders :user-id)
                :object-id 1
                :many-pks? false}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :user-id)
                                                          :value  1
                                                          :row    orders-row}))))))

(deftest ^:parallel table-view-available-drill-thrus-numeric-value-test
  (testing "table values: click on"
    (testing "numeric value - numeric quick filters and object details *for the PK column*"
      (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/zoom
                :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                :object-id (-> orders-row first :value)      ; And its value
                :many-pks? false}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/quick-filter
                :operators (for [[op label] [[:<  "<"]
                                             [:>  ">"]
                                             [:=  "="]
                                             [:!= "≠"]]]
                             {:name   label
                              :filter [op {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :orders :subtotal)]
                                       110.93]})}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :subtotal)
                                                          :value  110.93
                                                          :row    orders-row}))))))

(deftest ^:parallel table-view-available-drill-thrus-category-value-test
  (testing "table values: click on"
    (testing "category/enum value - filter is/is not, and object details *for the PK column*"
      (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/zoom
                :column    (meta/field-metadata :products :id)    ; It should correctly find the PK column
                :object-id (-> products-row first :value)         ; And its value
                :many-pks? false}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/quick-filter
                :operators (for [[op label] [[:=  "="]
                                             [:!= "≠"]]]
                             {:name   label
                              :filter [op {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :products :category)]
                                       "Gadget"]})}]
              (lib/available-drill-thrus
               products-query
               -1
               {:column (meta/field-metadata :products :category)
                :value  "Gadget"
                :row    products-row}))))))

(deftest ^:parallel table-view-available-drill-thrus-string-value-test
  (testing "table values: click on"
    (testing "string value - filter (not) equal, and object details *for the PK column*"
      (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/zoom
                :column    (meta/field-metadata :products :id)    ; It should correctly find the PK column
                :object-id (-> products-row first :value)         ; And its value
                :many-pks? false}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/quick-filter
                :operators (for [[op label] [[:=  "="]
                                             [:!= "≠"]]]
                             {:name   label
                              :filter [op {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :products :vendor)]
                                       "Herta Skiles and Sons"]})}]
              (lib/available-drill-thrus
               products-query
               -1
               {:column (meta/field-metadata :products :vendor)
                :value  "Herta Skiles and Sons"
                :row    products-row}))))))

(deftest ^:parallel table-view-available-drill-thrus-null-value-test
  (testing "table values: click on"
    (testing "NULL value - basic quick filters and object details *for the PK column*"
      (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/zoom
                :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                :object-id (-> orders-row first :value)             ; And its value
                :many-pks? false}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/quick-filter
                :operators (for [[op label] [[:is-null  "="]
                                             [:not-null "≠"]]]
                             {:name   label
                              :filter [op {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :orders :discount)]]})}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :discount)
                                                          :value  :null
                                                          :row    orders-row}))))))

(deftest ^:parallel table-view-available-drill-thrus-date-value-test
  (testing "table values: click on"
    (testing "date value - date quick filters and object details *for the PK column*"
      (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/zoom
                :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                :object-id (-> orders-row first :value)      ; And its value
                :many-pks? false}
               {:lib/type  :metabase.lib.drill-thru/drill-thru
                :type      :drill-thru/quick-filter
                :operators (for [[op label] [[:<  "<"]
                                             [:>  ">"]
                                             [:=  "="]
                                             [:!= "≠"]]]
                             {:name   label
                              :filter [op {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :orders :created-at)]
                                       "2018-05-15T08:04:04.58Z"]})}]
              (lib/available-drill-thrus orders-query -1 {:column (meta/field-metadata :orders :created-at)
                                                          :value  "2018-05-15T08:04:04.58Z"
                                                          :row    orders-row}))))))

(deftest ^:parallel histogram-available-drill-thrus-test
  (testing "histogram breakout view"
    (testing "broken out by state - click a state - underlying, zoom in, pivot (non-location), automatic insights, quick filter"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                      (lib/aggregate (lib/count))
                      (lib/breakout (meta/field-metadata :people :state)))
            row   [{:column-name "STATE" :value "Wisconsin"} ; Yes, the full name here, not WI.
                   {:column-name "count" :value 87}]
            cols  (lib.metadata.calculation/visible-columns query)]
        (is (=? [{:lib/type :metabase.lib.drill-thru/drill-thru,
                  :type :drill-thru/pivot,
                  :pivots {:category [(by-name cols "NAME")
                                      (by-name cols "SOURCE")]
                           :time     [(by-name cols "BIRTH_DATE")
                                      (by-name cols "CREATED_AT")]}}
                 {:lib/type :metabase.lib.drill-thru/drill-thru
                  :type     :drill-thru/quick-filter
                  :operators (for [[op label] [[:<  "<"]
                                               [:>  ">"]
                                               [:=  "="]
                                               [:!= "≠"]]]
                               {:name label
                                :filter [op {:lib/uuid string?}
                                         [:aggregation {:lib/uuid string?} (-> query
                                                                               lib/aggregations
                                                                               first
                                                                               lib.options/uuid)]
                                         87]})}
                 {:lib/type   :metabase.lib.drill-thru/drill-thru
                  :type       :drill-thru/underlying-records
                  :row-count  87
                  :table-name "People"}
                 #_{:lib/type  :metabase.lib.drill-thru/drill-thru
                  :type      :drill-thru/zoom
                  :column    (meta/field-metadata :people :state)
                  :object-id "WI"
                  :many-pks? false}]
                (lib/available-drill-thrus query -1 {:column     (-> query
                                                                     lib.metadata.calculation/returned-columns
                                                                     (by-name "count"))
                                                     :value      87
                                                     :row        row
                                                     :dimensions [{:column-name "STATE" :value "WI"}]})))))))

;; START HERE - Keep testing more cases

;; TODO: Directly clicking on this table's primary key opens the object detail, with no popup? How does that work?
