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
