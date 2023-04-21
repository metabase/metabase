(ns ^:mb/once metabase.util.regex-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.regex :as u.regex]))

(deftest ^:parallel rx-test
  (is (=? #"^(?:(?:Cam)|(?:can))(?:\s+)?\d+"
          (u.regex/rx [:and "^" [:or "Cam" "can"] [:? #"\s+"] #"\d+"])))
  (testing "`opt` with multiple args should work (#21971)"
    (is (=? #"^2022-(?:(?:06-30)|(?:07-01))(?:(?:(?:T)|(?:\s))00:00:00(?:Z)?)?"
            (u.regex/rx #"^2022-" [:or "06-30" "07-01"] [:? [:or "T" #"\s"] "00:00:00" [:? "Z"]]))))
  (testing :not
    (is (=? #"^metabase\.(?!util).*"
            (u.regex/rx #"^metabase\." [:not "util"] #".*")))
    (is (= "metabase.x"
           (re-matches (u.regex/rx #"^metabase\." [:not "util"] #".*") "metabase.x")))
    (is (nil? (re-matches (u.regex/rx #"^metabase\." [:not "util"] #".*") "metabase.util")))
    (is (nil? (re-matches (u.regex/rx #"^metabase\." [:not "util"] #".*") "metabase.util.x")))))
