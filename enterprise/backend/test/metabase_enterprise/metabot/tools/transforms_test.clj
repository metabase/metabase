(ns metabase-enterprise.metabot.tools.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms :as metabot.tools.transforms]))

;; Tests for get-transforms and get-transform-details have been moved to
;; metabase.metabot.tools.transforms-test (OSS).

(deftest get-transform-python-library-details-test
  (testing "get-transform-python-library-details is available"
    ;; Basic smoke test that the function exists and is callable
    (is (fn? metabot.tools.transforms/get-transform-python-library-details))))
