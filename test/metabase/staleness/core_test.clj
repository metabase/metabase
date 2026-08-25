(ns metabase.staleness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.staleness.core :as staleness]))

(deftest unregistered-model-throws
  (testing "dispatching a model with no registered staleness method throws"
    (is (thrown? IllegalArgumentException
                 (staleness/find-stale-query :model/DefinitelyNotAModel {})))))
