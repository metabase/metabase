(ns metabase.driver.query-processor.expand-test
  "Tests for the Query Expander."
  (:require [expectations :refer :all]
            [metabase.driver.query-processor.expand :refer :all]
            [metabase.test.data :refer [id db-id]]
            [metabase.test.util.q :refer [Q-expand]]
            [metabase.util :as u]))

;;; # ---------------------------------------- RELATIVE DATES ----------------------------------------

(defmacro ^:private expand-with-filter-val [filter-value]
  `(expand ~(Q-expand aggregate count of checkins
                      filter > date filter-value)))

;; Check that a query using a relative date gets expanded into a query identical to the one we'd see if
;; we just specified the date normally

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/years-ago 1)))
  (expand-with-filter-val ["relative_date" "years" -1]))

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/years-ago -1)))
  (expand-with-filter-val ["relative_date" "years" 1]))

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/months-ago 1)))
  (expand-with-filter-val ["relative_date" "months" -1]))

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/months-ago -1)))
  (expand-with-filter-val ["relative_date" "months" 1]))

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/days-ago 1)))
  (expand-with-filter-val ["relative_date" "days" -1]))

(expect (expand-with-filter-val (u/date->yyyy-mm-dd (u/days-ago -1)))
  (expand-with-filter-val ["relative_date" "days" 1]))
