(ns metabase.staleness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.staleness.core :as staleness]))

(deftest default-arm-returns-nil-for-unregistered-model
  (testing "a model with no registered method contributes no query (OSS-safe fallback)"
    (is (nil? (staleness/find-stale-query :model/DefinitelyNotAModel {})))))
