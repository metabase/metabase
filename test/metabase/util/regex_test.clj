(ns metabase.util.regex-test
  (:require [clojure.test :refer :all]
            [metabase.util.regex :as u.regex]))

(deftest ^:parallel rx-test
  (let [regex (u.regex/rx (and "^" (or "Cam" "can") (opt #"\s+") #"\d+"))]
    (is (instance? java.util.regex.Pattern regex))
    (is (= (str #"^(?:(?:Cam)|(?:can))(?:\s+)?\d+")
           (str regex)))
    (testing "`opt` with multiple args should work (#21971)"
      (is (= (str #"^2022-(?:(?:06-30)|(?:07-01))(?:(?:(?:T)|(?:\s))00:00:00(?:Z)?)?")
             (str (u.regex/rx #"^2022-" (or "06-30" "07-01") (opt (or "T" #"\s") "00:00:00" (opt "Z")))))))))
