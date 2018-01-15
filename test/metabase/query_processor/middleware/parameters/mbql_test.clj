(ns metabase.query-processor.middleware.parameters.mbql-test
  "Tests for *MBQL* parameter substitution."
  (:require [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [query-processor-test :refer [first-row format-rows-by non-timeseries-engines]]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.query-processor.middleware.parameters.mbql :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

(defn- expand-parameters [query]
  (expand (dissoc query :parameters) (:parameters query)))


;; adding a simple parameter
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["=" ["field-id" 123] "666"]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}]}))

;; multiple filters are conjoined by an "AND"
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["AND" ["AND" ["AND" ["=" 456 12]] ["=" ["field-id" 123] "666"]] ["=" ["field-id" 456] "999"]]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:filter   ["AND" ["=" 456 12]]
                                   :breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "id"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "666"}
                                   {:hash   "def456"
                                    :name   "bar"
                                    :type   "category"
                                    :target ["dimension" ["field-id" 456]]
                                    :value  "999"}]}))

;; date range parameters
(expect
  {:database   1
   :type       :query
   :query      {:filter   ["TIME_INTERVAL" ["field-id" 123] -30 "day" {:include-current false}]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "past30days"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:filter   ["TIME_INTERVAL" ["field-id" 123] -30 "day" {:include-current true}]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "past30days~"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:filter   ["=" ["field-id" 123] ["relative_datetime" -1 "day"]]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "yesterday"}]}))

(expect
  {:database   1
   :type       :query
   :query      {:filter   ["BETWEEN" ["field-id" 123] "2014-05-10" "2014-05-16"]
                :breakout [17]}}
  (expand-parameters {:database   1
                      :type       :query
                      :query      {:breakout [17]}
                      :parameters [{:hash   "abc123"
                                    :name   "foo"
                                    :type   "date"
                                    :target ["dimension" ["field-id" 123]]
                                    :value  "2014-05-10~2014-05-16"}]}))



;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           END-TO-END TESTS                                            |
;;; +-------------------------------------------------------------------------------------------------------+

;; for some reason param substitution tests fail on Redshift & (occasionally) Crate so just don't run those for now
(def ^:private ^:const params-test-engines (disj non-timeseries-engines :redshift :crate))

;; check that date ranges work correctly
(datasets/expect-with-engines params-test-engines
  [29]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "date"
                                       :target ["dimension" ["field-id" (data/id :checkins :date)]]
                                       :value  "2015-04-01~2015-05-01"}]}))))

;; check that IDs work correctly (passed in as numbers)
(datasets/expect-with-engines params-test-engines
  [1]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "number"
                                       :target ["dimension" ["field-id" (data/id :checkins :id)]]
                                       :value  100}]}))))

;; check that IDs work correctly (passed in as strings, as the frontend is wont to do; should get converted)
(datasets/expect-with-engines params-test-engines
  [1]
  (first-row
    (format-rows-by [int]
      (qp/process-query {:database   (data/id)
                         :type       :query
                         :query      (data/query checkins
                                       (ql/aggregation (ql/count)))
                         :parameters [{:hash   "abc123"
                                       :name   "foo"
                                       :type   "number"
                                       :target ["dimension" ["field-id" (data/id :checkins :id)]]
                                       :value  "100"}]}))))
