(ns metabase.util.malli.describe-test
  "Additional tests for this live in [[metabase.util.malli-test]]."
  (:require
   #?@(:clj
       ([clojure.test :refer [are deftest testing]]
        [metabase.util.malli.describe :as umd]))))

;;; this is only fixed in Clojure

#?(:clj
   (deftest ^:parallel correct-string-length-descriptions-test
     (testing "Work around upstream issue https://github.com/metosin/malli/issues/924"
       (are [schema expected] (= expected
                                 (umd/describe schema))
         [:string {:min 5}] "string with length >= 5"
         [:string {:max 5}] "string with length <= 5"))))
