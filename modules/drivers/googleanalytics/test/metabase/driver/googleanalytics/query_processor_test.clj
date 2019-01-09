(ns metabase.driver.googleanalytics.query-processor-test
  (:require [expectations :refer [expect]]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]))

(expect
  "ga::WOW"
  (#'ga.qp/built-in-segment {:filter [:segment "ga::WOW"]}))

;; should work recursively
(expect
  "gaid::A"
  (#'ga.qp/built-in-segment {:filter [:and [:= [:field-id 1] 2] [:segment "gaid::A"]]}))

;; should throw Exception if more than one segment is matched
(expect
  Exception
  (#'ga.qp/built-in-segment {:filter [:and [:segment "gaid::A"] [:segment "ga::B"]]}))

;; should ignore Metabase segments
(expect
  "ga::B"
  (#'ga.qp/built-in-segment {:filter [:and [:segment 100] [:segment "ga::B"]]}))

;; Make sure we properly parse isoYearIsoWeeks (#9244)
(expect
  #inst "2018-12-31T00:00:00.000000000-00:00"
  ((#'ga.qp/ga-dimension->date-format-fn "ga:isoYearIsoWeek") "201901"))
