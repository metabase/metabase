(ns metabase.driver.googleanalytics.query-processor-test
  (:require [expectations :refer [expect]]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]))

(expect
  "WOW"
  (#'ga.qp/built-in-segment {:query {:filter [:segment "WOW"]}}))

;; should work recursively
(expect
  "A"
  (#'ga.qp/built-in-segment {:query {:filter [:and [:= [:field-id 1] 2] [:segment "A"]]}}))

;; should throw Exception if more than one segment is matched
(expect
  Exception
  (#'ga.qp/built-in-segment {:query {:filter [:and [:segment "A"] [:segment "B"]]}}))

;; should ignore Metabase segments
(expect
  "B"
  (#'ga.qp/built-in-segment {:query {:filter [:and [:segment 100] [:segment "B"]]}}))

;; we should be able to remove built-in segments
(expect
  [:segment 100]
  (#'ga.qp/remove-built-in-segments [:and [:segment 100] [:segment "B"]]))
