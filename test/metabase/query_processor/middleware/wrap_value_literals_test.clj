(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [metabase.util.date :as du]))

(defn- wrap-value-literals {:style/indent 1} [field-ids-to-put-in-store inner-query]
  (qp.store/with-store
    (doseq [field-id field-ids-to-put-in-store]
      (qp.store/store-field! (Field field-id)))
    (binding [du/*report-timezone* (java.util.TimeZone/getTimeZone "UTC")]
      (-> ((wrap-value-literals/wrap-value-literals identity)
           {:database (data/id)
            :type     :query
            :query    inner-query})
          :query))))

(expect
  (data/$ids venues
    {:source-table (data/id :venues)
     :filter       [:>
                    [:field-id $id]
                    [:value 50 {:base_type     :type/BigInteger
                                :special_type  :type/PK
                                :database_type "BIGINT"}]]})
  (data/$ids venues
    (wrap-value-literals [$id]
      {:source-table (data/id :venues)
       :filter       [:> [:field-id $id] 50]})))

(expect
  (data/$ids venues
    {:source-table (data/id :venues)
     :filter       [:and
                    [:> [:field-id $id] [:value 50 {:base_type     :type/BigInteger
                                                    :special_type  :type/PK
                                                    :database_type "BIGINT"}]]
                    [:< [:field-id $price] [:value 5 {:base_type     :type/Integer
                                                      :special_type  :type/Category
                                                      :database_type "INTEGER"}]]]})
  (data/$ids venues
    (wrap-value-literals [$id $price]
      {:source-table (data/id :venues)
       :filter       [:and
                      [:> [:field-id $id] 50]
                      [:< [:field-id $price] 5]]})))

;; do datetime literal strings get wrapped in `absolute-datetime` clauses when in appropriate filters?
(expect
  (data/$ids checkins
    {:source-table (data/id :checkins)
     :filter       [:=
                    [:datetime-field [:field-id $date] :month]
                    [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]})
  (data/$ids checkins
    (wrap-value-literals [$date]
      {:source-table (data/id :checkins)
       :filter       [:= [:datetime-field [:field-id $date] :month] "2018-10-01"]})))

;; string filters like `starts-with` should not parse datetime strings for obvious reasons
(expect
  (data/$ids checkins
    {:source-table (data/id :checkins)
     :filter        [:starts-with
                     [:datetime-field [:field-id $date] :month]
                     [:value "2018-10-01" {:base_type     :type/Date
                                           :special_type  nil
                                           :database_type "DATE"
                                           :unit          :month}]
                     nil]})
  (data/$ids checkins
    (wrap-value-literals [$date]
      {:source-table (data/id :checkins)
       :filter       [:starts-with [:datetime-field [:field-id $date] :month] "2018-10-01"]})))
