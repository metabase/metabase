(ns metabase.util.regex-test
  (:require [clojure.test :refer :all]
            [metabase.util.regex :as u.regex]))

(deftest rx-test
  (let [regex (u.regex/rx (and "^" (or "Cam" "can") (opt #"\s+") #"\d+"))]
    (is (instance? java.util.regex.Pattern regex))
    (is (= (str #"^(?:(?:Cam)|(?:can))(?:\s+)?\d+")
           (str regex)))))
