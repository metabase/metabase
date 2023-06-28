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
      (testing "with values"
        (testing "click foreign key - FK filter and FK details"
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
        (testing "click numeric value - numeric quick filters and object details *for the PK column*"
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
        (testing "click nil value - basic quick filters and object details *for the PK column*"
          (is (=? [{:lib/type  :metabase.lib.drill-thru/drill-thru
                    :type      :drill-thru/zoom
                    :column    (meta/field-metadata :orders :id) ; It should correctly find the PK column
                    :object-id (-> row first :value)             ; And its value
                    :many-pks? false}
                   {:lib/type :metabase.lib.drill-thru/drill-thru
                    :type     :drill-thru/quick-filter
                    :operators (for [[op label] [[:=  "="]
                                                 [:!= "≠"]]]
                                 {:name label
                                  :filter [op {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :orders :subtotal)]]})}]
                  (lib/available-drill-thrus query -1 {:column (meta/field-metadata :orders :discount)
                                                       :value  :null
                                                       :row    row}))))))))

;; START HERE - Keep debugging these tests

;; TODO: Directly clicking on this table's primary key opens the object detail, with no popup? How does that work?
