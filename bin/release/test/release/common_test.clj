(ns release.common-test
  (:require [clojure.test :refer :all]
            [release.common :as c]))

(deftest version-greater-than-test
  (doseq [[x y expected] [["1.37.0" "1.36.0" true]
                          ["1.36.1" "1.36.0" true]
                          ["1.36.0" "1.36.0" false]
                          ["1.37.0" "1.36.9" true]
                          ["1.37.0" "1.36.9" true]
                          ["1.37.0.1" "1.37.0" true]
                          ["1.37.1.1" "1.37.0.2" true]
                          ["1.37.10" "1.37.2" true]
                          ["1.37.0.0" "1.37.0" false]]]
    (testing (str (pr-str (list 'version-greater-than x y)) " => " (pr-str expected))
      (doseq [x [x (str "v" x)]
              y [y (str "v" y)]]
        (is (= expected
               (c/version-greater-than x y)))
        (when expected
          (is (= (not expected)
                 (c/version-greater-than y x))))))))

(deftest most-recent-tag-test
  (is (= "v1.37.0.1"
         (#'c/most-recent-tag (shuffle ["v1.37.0.0" "v1.37.0.1" "v1.36.0" "v1.36.8.9"])))))
