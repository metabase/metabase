(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [metabase.util.date :as du]
            [toucan.db :as db]))

(defn- wrap-value-literals {:style/indent 0} [inner-query]
  (qp.test-util/with-everything-store
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
    (wrap-value-literals
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
    (wrap-value-literals
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
    (wrap-value-literals
      {:source-table (data/id :checkins)
       :filter       [:= [:datetime-field [:field-id $date] :month] "2018-10-01"]})))

;; make sure datetime literal strings should also get wrapped in `absolute-datetime` clauses if they are being
;; compared against a type/DateTime `field-literal`
(expect
  (data/$ids checkins
    {:source-query {:source-table $$table}
     :filter       [:=
                    [:datetime-field
                     [:field-literal (db/select-one-field :name Field :id $date) :type/DateTime]
                     :month]
                    [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]})
  (data/$ids checkins
    (wrap-value-literals
      {:source-query {:source-table $$table}
       :filter       [:=
                      [:datetime-field
                       [:field-literal (db/select-one-field :name Field :id $date) :type/DateTime]
                       :month]
                      "2018-10-01"]})))

;; even if the Field in question is not wrapped in a datetime-field clause, we should still auto-bucket the value, but
;; we should give it a `:default` unit
(expect
  (data/$ids checkins
    {:source-table (data/id :checkins)
     :filter       [:=
                    [:field-id $date]
                    [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :default]]})
  (data/$ids checkins
    (wrap-value-literals
      {:source-table (data/id :checkins)
       :filter       [:= [:field-id $date] "2018-10-01"]})))

;; should also apply if the Fields are UNIX timestamps or other things with special type of :type/Datetime
(expect
  (data/dataset sad-toucan-incidents
    (data/$ids incidents
      {:source-table (data/id :incidents)
       :filter       [:and
                      [:>
                       [:datetime-field [:field-id $timestamp] :day]
                       [:absolute-datetime #inst "2015-06-01T00:00:00.000000000-00:00" :day]]
                      [:<
                       [:datetime-field [:field-id $timestamp] :day]
                       [:absolute-datetime #inst "2015-06-03T00:00:00.000000000-00:00" :day]]]}))

  (data/dataset sad-toucan-incidents
    (data/$ids incidents
      (wrap-value-literals
        {:source-table (data/id :incidents)
         :filter       [:and
                        [:> [:datetime-field [:field-id $timestamp] :day] "2015-06-01"]
                        [:< [:datetime-field [:field-id $timestamp] :day] "2015-06-03"]]}))))

;; string filters like `starts-with` should not parse datetime strings for obvious reasons
(expect
  (data/$ids checkins
    {:source-table (data/id :checkins)
     :filter        [:starts-with
                     [:datetime-field [:field-id $date] :month]
                     [:value "2018-10-01" {:base_type     :type/Date
                                           :special_type  nil
                                           :database_type "DATE"
                                           :unit          :month}]]})
  (data/$ids checkins
    (wrap-value-literals
      {:source-table (data/id :checkins)
       :filter       [:starts-with [:datetime-field [:field-id $date] :month] "2018-10-01"]})))

;; does wrapping value literals work recursively on source queries as well?
(expect
  (data/$ids checkins
    {:source-query {:source-table (data/id :checkins)
                    :filter       [:>
                                   [:field-id $date]
                                   [:absolute-datetime #inst "2014-01-01T00:00:00.000000000-00:00" :default]]}})
  (data/$ids checkins
    (wrap-value-literals
      {:source-query {:source-table (data/id :checkins)
                      :filter       [:> [:field-id $date] "2014-01-01"]}})))
