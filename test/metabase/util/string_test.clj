(ns metabase.util.string-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.string :as u.str]))


(deftest mask-test
  (testing "mask works correctly in general case"
    (is (= "qwer...uiop"
           (u.str/mask "qwertyuiop"))))

  (testing "mask works correctly with short strings"
    (is (= "qw..."
           (u.str/mask "qwer")))
    (is (= "q..."
           (u.str/mask "q"))))

  (testing "mask does not throw errors for empty values"
    (is (= ""
           (u.str/mask "")))
    (is (= nil
           (u.str/mask nil)))))
