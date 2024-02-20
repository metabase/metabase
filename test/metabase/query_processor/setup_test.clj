(ns metabase.query-processor.setup-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.setup :as qp.setup]))

(deftest ^:parallel internal-query-type-test
  (testing "Make sure internal (audit app) queries work, even tho they don't have a :database ID."
    (qp.setup/with-qp-setup [query {:type :internal}]
      (is (= {:type :internal}
             query)))))
