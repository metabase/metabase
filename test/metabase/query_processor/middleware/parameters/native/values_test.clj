(ns metabase.query-processor.middleware.parameters.native.values-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.parameters.native.values :as values]
            [metabase.test.data :as data]))

;; variable -- specified
(expect
  "2"
  (#'values/value-for-tag {:name "id", :display-name "ID", :type :text, :required true, :default "100"}
                       [{:type :category, :target [:variable [:template-tag "id"]], :value "2"}]))

;; variable -- unspecified
(expect
  #metabase.query_processor.middleware.parameters.sql.NoValue{}
  (#'values/value-for-tag {:name "id", :display-name "ID", :type :text} nil))

;; variable -- default
(expect
  "100"
  (#'values/value-for-tag {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil))

;; dimension -- specified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)
           :base_type :type/Date}
   :param {:type   :date/range
           :target [:dimension [:template-tag "checkin_date"]]
           :value  "2015-04-01~2015-05-01"}}
  (into {} (#'values/value-for-tag {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (data/id :checkins :date)]}
                                [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value "2015-04-01~2015-05-01"}])))

;; dimension -- unspecified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)
           :base_type :type/Date}
   :param nil}
  (into {} (#'values/value-for-tag {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (data/id :checkins :date)]}
                                nil)))
;; dimension -- id requiring casting
(expect
  {:field {:name      "ID"
           :parent_id nil
           :table_id  (data/id :checkins)
           :base_type :type/BigInteger}
   :param {:type   :id
           :target [:dimension [:template-tag "id"]]
           :value  5}}
  (into {} (#'values/value-for-tag {:name "id", :display-name "ID", :type :dimension, :dimension [:field-id (data/id :checkins :id)]}
                                [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}])))

;; dimension -- required but unspecified
(expect Exception
        (into {} (#'values/value-for-tag {:name "checkin_date", :display-name "Checkin Date", :type "dimension", :required true,
                                       :dimension ["field-id" (data/id :checkins :date)]}
                                      nil)))

;; dimension -- required and default specified
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)
           :base_type :type/Date}
   :param {:type   :dimension
           :target [:dimension [:template-tag "checkin_date"]]
           :value  "2015-04-01~2015-05-01"}}
  (into {} (#'values/value-for-tag {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :required true, :default "2015-04-01~2015-05-01",
                                 :dimension [:field-id (data/id :checkins :date)]}
                                nil)))


;; multiple values for the same tag should return a vector with multiple params instead of a single param
(expect
  {:field {:name      "DATE"
           :parent_id nil
           :table_id  (data/id :checkins)
           :base_type :type/Date}
   :param [{:type   :date/range
            :target [:dimension [:template-tag "checkin_date"]]
            :value  "2015-01-01~2016-09-01"}
           {:type   :date/single
            :target [:dimension [:template-tag "checkin_date"]]
            :value  "2015-07-01"}]}
  (into {} (#'values/value-for-tag {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (data/id :checkins :date)]}
                                [{:type :date/range,  :target [:dimension [:template-tag "checkin_date"]], :value "2015-01-01~2016-09-01"}
                                 {:type :date/single, :target [:dimension [:template-tag "checkin_date"]], :value "2015-07-01"}])))

;; Make sure defaults values get picked up for field filter clauses
(expect
  {:field {:name "DATE", :parent_id nil, :table_id (data/id :checkins), :base_type :type/Date}
   :param {:type   :date/all-options
           :target [:dimension [:template-tag "checkin_date"]]
           :value  "past5days"}}
  (#'values/field-filter-value-for-tag
   {:name         "checkin_date"
    :display-name "Checkin Date"
    :type         :dimension
    :dimension    [:field-id (data/id :checkins :date)]
    :default      "past5days"
    :widget-type  :date/all-options}
   nil))
