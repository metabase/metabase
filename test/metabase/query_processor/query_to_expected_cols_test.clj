(ns metabase.query-processor.query-to-expected-cols-test
  "Tests for `metabase.query-processor/query->expected-cols`."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))
