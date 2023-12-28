(ns metabuild-common.misc-test
  (:require
   [clojure.test :refer :all]
   [metabuild-common.misc :as misc]))

(deftest parse-as-keyword-test
  (are [input expected] (= expected (misc/parse-as-keyword input))
    :abc   :abc
    "abc"  :abc
    ":abc" :abc
    nil    nil
    ""     nil
    "  "   nil))
