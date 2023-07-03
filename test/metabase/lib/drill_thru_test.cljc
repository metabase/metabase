(ns metabase.lib.drill-thru-test
  (:require
    #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
    [clojure.test :refer [deftest is testing]]
    [medley.core :as m]
    [metabase.lib.core :as lib]
    [metabase.lib.test-metadata :as meta]
    [metabase.lib.test-util :as lib.tu]
    [metabase.lib.util :as lib.util]
    [metabase.util :as u]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- by-name [cols name]
  (first (filter #(= (:name %) name) cols)))

(deftest ^:parallel available-drill-thrus-test
  (testing "table view"
    (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
          row   [{:column-name "ID" :value 2}
                 {:column-name "USER_ID" :value 1}
                 {:column-name "PRODUCT_ID" :value 123}
                 {:column-name "SUBTOTAL" :value 110.93}
                 {:column-name "TAX" :value 6.10}
                 {:column-name "TOTAL" :value 117.03}
                 {:column-name "DISCOUNT" :value nil}
                 {:column-name "CREATED_AT" :value "2018-05-15T08:04:04.58Z"}
                 {:column-name "QUANTITY" :value 3}]]
      (testing "column headers: click on"
        (testing "primary key - column filter (default: Is), sort, summarize (distinct only)"
          (is (=? [{:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/column-filter
                    :column          (meta/field-metadata :orders :id)
                    :initial-op      {:short := :display-name "Is"}}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/sort
                    :column          (meta/field-metadata :orders :id)
                    :sort-directions [:asc :desc]}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/summarize-column
                    :column          (meta/field-metadata :orders :id)
                    :aggregations    [:distinct]}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :id)
                                                       :value  nil}))))

        (testing "foreign key - distribution, column filter (default: Is), sort, summarize (distinct only)"
          (is (=? [{:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/distribution
                    :column          (meta/field-metadata :orders :user-id)}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/column-filter
                    :column          (meta/field-metadata :orders :user-id)
                    :initial-op      {:short := :display-name "Is"}}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/sort
                    :column          (meta/field-metadata :orders :user-id)
                    :sort-directions [:asc :desc]}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/summarize-column
                    :column          (meta/field-metadata :orders :user-id)
                    :aggregations    [:distinct]}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :user-id)
                                                       :value  nil}))))

        (testing "numeric column - distribution, column filter (default: Equal To), sort, summarize (all 3), summarize by time"
          (is (=? [{:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/distribution
                    :column          (meta/field-metadata :orders :subtotal)}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/column-filter
                    :column          (meta/field-metadata :orders :subtotal)
                    :initial-op      {:short := :display-name "Equal to"}}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/sort
                    :column          (meta/field-metadata :orders :subtotal)
                    :sort-directions [:asc :desc]}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/summarize-column
                    :column          (meta/field-metadata :orders :subtotal)
                    :aggregations    [:distinct :sum :avg]}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/summarize-column-by-time
                    :column          (meta/field-metadata :orders :subtotal)
                    :breakout        (meta/field-metadata :orders :created-at)}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :subtotal)
                                                       :value  nil}))))

        (testing "date column - distribution, column filter (no default), sort, summarize (distinct only)"
          (is (=? [{:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/distribution
                    :column          (meta/field-metadata :orders :created-at)}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/column-filter
                    :column          (meta/field-metadata :orders :created-at)
                    :initial-op      nil}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/sort
                    :column          (meta/field-metadata :orders :created-at)
                    :sort-directions [:asc :desc]}
                   {:lib/type        :metabase.lib.drill-thru/drill-thru
                    :type            :drill-thru/summarize-column
                    :column          (meta/field-metadata :orders :created-at)
                    :aggregations    [:distinct]}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :created-at)
                                                       :value  nil}))))

        (testing "a sorted column"
          (let [expected [{:lib/type        :metabase.lib.drill-thru/drill-thru
                           :type            :drill-thru/distribution
                           :column          (meta/field-metadata :orders :subtotal)}
                          {:lib/type        :metabase.lib.drill-thru/drill-thru
                           :type            :drill-thru/column-filter
                           :column          (meta/field-metadata :orders :subtotal)
                           :initial-op      {:short := :display-name "Equal to"}}
                          {:lib/type        :metabase.lib.drill-thru/drill-thru
                           :type            :drill-thru/sort
                           :column          (meta/field-metadata :orders :subtotal)
                           ;; Starting off empty.
                           :sort-directions []}
                          {:lib/type        :metabase.lib.drill-thru/drill-thru
                           :type            :drill-thru/summarize-column
                           :column          (meta/field-metadata :orders :subtotal)
                           :aggregations    [:distinct :sum :avg]}
                          {:lib/type        :metabase.lib.drill-thru/drill-thru
                           :type            :drill-thru/summarize-column-by-time
                           :column          (meta/field-metadata :orders :subtotal)
                           :breakout        (meta/field-metadata :orders :created-at)}]]
            (doseq [[sort-dir other-option] [[:asc :desc]
                                             [:desc :asc]]]
              (testing (str "which is " sort-dir " and the sort drill only offers " other-option)
                (is (=? (assoc-in expected [2 :sort-directions] [other-option])
                        (-> query
                            (lib/order-by -1 (meta/field-metadata :orders :subtotal) sort-dir)
                            (lib/available-drill-thrus -1 {:column (meta/field-metadata :orders :subtotal)
                                                           :value  nil})))))))))

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
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :user-id)
                                                       :value  1
                                                       :row    row}))))
        (testing "numeric value - numeric quick filters and object details *for the PK column*"
          (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                    :type      :drill-thru/zoom
                    :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                    :object-id (-> row first :value)             ; And its value
                    :many-pks? false}
                   {:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/quick-filter
                    :operators (for [[op label] [[:<  "<"]
                                                 [:>  ">"]
                                                 [:=  "="]
                                                 [:!= "≠"]]]
                                 {:name label
                                  :filter [op {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :orders :subtotal)]
                                           110.93]})}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :subtotal)
                                                       :value  110.93
                                                       :row    row}))))

        (let [products-query (lib/query meta/metadata-provider (meta/table-metadata :products))
              products-row   [{:column-name "ID" :value 118}
                              {:column-name "EAN" :value "5291392809646"}
                              {:column-name "TITLE" :value "Synergistic Rubber Shoes"}
                              {:column-name "CATEGORY" :value "Gadget"}
                              {:column-name "VENDOR" :value "Herta Skiles and Sons"}
                              {:column-name "PRICE" :value 38.42}
                              {:column-name "RATING" :value 3.5}
                              {:column-name "CREATED_AT" :value "2016-10-19T12:34:56.789Z"}]]
          (testing "category/enum value - filter is/is not, and object details *for the PK column*"
            (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                      :type      :drill-thru/zoom
                      :column    (meta/field-metadata :products :id) ; It should correctly find the PK column
                      :object-id (-> products-row first :value)               ; And its value
                      :many-pks? false}
                     {:lib/type :metabase.lib.drill-thru/drill-thru
                      :type     :drill-thru/quick-filter
                      :operators (for [[op label] [[:=  "="]
                                                   [:!= "≠"]]]
                                   {:name label
                                    :filter [op {:lib/uuid string?}
                                             [:field {:lib/uuid string?} (meta/id :products :category)]
                                             "Gadget"]})}]
                    (lib/available-drill-thrus
                      products-query
                      -1
                      {:column (meta/field-metadata :products :category)
                       :value  "Gadget"
                       :row    products-row}))))

          (testing "string value - filter (not) equal, and object details *for the PK column*"
            (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                      :type      :drill-thru/zoom
                      :column    (meta/field-metadata :products :id) ; It should correctly find the PK column
                      :object-id (-> products-row first :value)               ; And its value
                      :many-pks? false}
                     {:lib/type :metabase.lib.drill-thru/drill-thru
                      :type     :drill-thru/quick-filter
                      :operators (for [[op label] [[:=  "="]
                                                   [:!= "≠"]]]
                                   {:name label
                                    :filter [op {:lib/uuid string?}
                                             [:field {:lib/uuid string?} (meta/id :products :vendor)]
                                             "Herta Skiles and Sons"]})}]
                    (lib/available-drill-thrus
                      products-query
                      -1
                      {:column (meta/field-metadata :products :vendor)
                       :value  "Herta Skiles and Sons"
                       :row    products-row})))))

        (testing "NULL value - basic quick filters and object details *for the PK column*"
          (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                    :type      :drill-thru/zoom
                    :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                    :object-id (-> row first :value)             ; And its value
                    :many-pks? false}
                   {:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/quick-filter
                    :operators (for [[op label] [[:is-null  "="]
                                                 [:not-null "≠"]]]
                                 {:name label
                                  :filter [op {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :orders :discount)]]})}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :discount)
                                                       :value  :null
                                                       :row    row}))))

        (testing "date value - date quick filters and object details *for the PK column*"
          (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                    :type      :drill-thru/zoom
                    :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                    :object-id (-> row first :value)             ; And its value
                    :many-pks? false}
                   {:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/quick-filter
                    :operators (for [[op label] [[:<  "<"]
                                                 [:>  ">"]
                                                 [:=  "="]
                                                 [:!= "≠"]]]
                                 {:name label
                                  :filter [op {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :orders :created-at)]
                                           "2018-05-15T08:04:04.58Z"]})}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :created-at)
                                                       :value  "2018-05-15T08:04:04.58Z"
                                                       :row    row}))))))))
(comment
  (let [metadata-provider (metabase.lib.metadata.jvm/application-database-metadata-provider 1)
        orders            2
        orders-id         11
        created-at        14
        query             (lib/query metadata-provider (metabase.lib.metadata/table metadata-provider orders))]
    (lib/available-drill-thrus query -1 {:column (metabase.lib.metadata/field metadata-provider created-at)
                                         :value nil
                                         #_#_:value  "2018-05-15T08:04:04.58Z"}))
  (lib.order-by/order-bys query stage-number))

;; START HERE - Keep testing more cases

;; TODO: Directly clicking on this table's primary key opens the object detail, with no popup? How does that work?
