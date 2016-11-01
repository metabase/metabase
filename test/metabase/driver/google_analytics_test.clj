(ns metabase.driver.google-analytics-test
  "Tests for the Google Analytics driver and query processor."
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.driver.googleanalytics :as ga]
            [metabase.driver.googleanalytics.query-processor :as qp]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor.expand :as ql]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

;; just check that a basic almost-empty MBQL query can be compiled
(expect
  {:query {:ids "ga:0123456", :dimensions "", :start-date "2005-01-01", :end-date "today", :max-results 10000, :include-empty-rows false}, :mbql? true}
  (qp/mbql->native {:query {:source-table {:name "0123456"}}}))
