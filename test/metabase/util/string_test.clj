(ns metabase.util.string-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.string :as u.str]))

(deftest mask-test
  (testing "mask"
    (testing "works correctly in general case"
      (is (= "qwer...uiop"
             (u.str/mask "qwertyuiop"))))

    (testing "works correctly with short strings"
      (is (= "qw..."
             (u.str/mask "qwer")))
      (is (= "q..."
             (u.str/mask "q"))))

    (testing "does not throw errors for empty values"
      (is (= ""
             (u.str/mask "")))
      (is (= nil
             (u.str/mask nil))))

    (testing "works with custom start-limit"
      (is (= "abcd-efgh...-end"
             (u.str/mask "abcd-efgh-ijkl-end" 9))))

    (testing "works with custom end-limit"
      (is (= "ab...ra"
             (u.str/mask "abracadabra" 2 2))))))

(deftest ^:parallel elide-test
  (is (= "short" (u.str/elide "short" 5)))
  (is (= "lo..." (u.str/elide "longer string" 5))))

(deftest ^:parallel random-string
  (is 10 (count (u.str/random-string 10)))
  (is 20 (count (u.str/random-string 20)))
  (is (not= (u.str/random-string 10) (u.str/random-string 10))))
