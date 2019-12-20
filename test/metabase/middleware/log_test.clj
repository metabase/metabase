(ns metabase.middleware.log-test
  (:require [clojure.test :refer :all]
            [metabase.middleware.log :as log]))

(deftest log-info-input-tests
  (testing "log-info handles nil status input"
    (is (true?
          (try
            (#'log/log-info nil)
            true
            (catch Throwable _
              false)))))) ; Make sure it didn't throw NPE
