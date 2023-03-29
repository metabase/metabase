(ns metabase.csv-test
  (:require
   [clojure.test :refer :all]
   [metabase.csv :as csv]))

(def bool-type  :metabase.csv/boolean)
(def int-type   :metabase.csv/int)
(def float-type :metabase.csv/float)
(def vchar-type :metabase.csv/varchar_255)
(def text-type  :metabase.csv/text)

(deftest type-detection-test
  (doseq [[value expected] [["0"                          bool-type]
                            ["1"                          bool-type]
                            ["t"                          bool-type]
                            ["T"                          bool-type]
                            ["tRuE"                       bool-type]
                            ["f"                          bool-type]
                            ["F"                          bool-type]
                            ["FAlse"                      bool-type]
                            ["Y"                          bool-type]
                            ["n"                          bool-type]
                            ["yes"                        bool-type]
                            ["NO"                         bool-type]
                            ["2"                          int-type]
                            ["9,986,000"                  int-type]
                            ["3.14"                       float-type]
                            [".14"                        float-type]
                            ["0.14"                       float-type]
                            ["9,986,000.0"                float-type]
                            [(apply str (repeat 255 "x")) vchar-type]
                            [(apply str (repeat 256 "x")) text-type]
                            ["86 is my favorite number"   vchar-type]
                            ["My favorite number is 86"   vchar-type]]]
    (testing (format "\"%s\" is a %s" value expected)
      (is (= expected (csv/value->type value))))))

(deftest type-coalescing-test
  (doseq [[type-a type-b expected] [[bool-type  int-type   int-type]
                                    [int-type   bool-type  int-type] ;; ensure arg order doesn't matter
                                    [int-type   float-type float-type]
                                    [bool-type  vchar-type vchar-type]
                                    [bool-type  text-type  text-type]
                                    [int-type   vchar-type vchar-type]
                                    [int-type   text-type  text-type]
                                    [float-type vchar-type vchar-type]
                                    [float-type text-type  text-type]
                                    [vchar-type text-type  text-type]]]
    (is (= expected (csv/coalesce type-a type-b)))))
