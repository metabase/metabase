(ns metabase.util.format-test
  (:require
   [clojure.test :refer :all]
   [metabase.util :as u]))

(deftest ^:parallel format-plural-test
  (doseq [[expected n singular plural]
          [["candies" 0 "candy" "candies"]
           ["candy" 1 "candy" "candies"]
           ["candies" 2 "candy" "candies"]
           ["books" 2 "book" nil]]]
    (testing (format "format-plural %d %s %s" n singular plural)
      (= expected (u/format-plural n singular plural)))))
