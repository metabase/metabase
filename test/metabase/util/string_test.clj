(ns metabase.util.string-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.string :as u.str]))

(set! *warn-on-reflection* true)

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
  (is (= "lo..." (u.str/elide "longer string" 5)))
  (is (= "short" (u.str/limit-chars "short" 5)))
  (is (= "longe" (u.str/limit-chars "longer string" 5))))

(deftest ^:parallel random-string
  (is (= 10 (count (u.str/random-string 10))))
  (is (= 20 (count (u.str/random-string 20))))
  (is (not= (u.str/random-string 10) (u.str/random-string 10))))

(deftest ^:parallel limit-bytes
  (is (nil? (u.str/limit-bytes nil 5)))
  (is (= "abc" (u.str/limit-bytes "abc" 3)))
  (is (= 3 (count (.getBytes (u.str/limit-bytes "abc" 3)))))
  (is (= "abc" (u.str/limit-bytes "abc" 5)))
  (is (= "ab" (u.str/limit-bytes "abc" 2)))
  (is (= 2 (count (.getBytes (u.str/limit-bytes "abc" 2)))))
  (is (= "" (u.str/limit-bytes "abc" 0)))
  (testing "A multi-byte char that gets split will not end up as a different 1-byte char"
    (is (= 2 (count (.getBytes (u.str/limit-bytes "abÆ" 3)))))
    (is (= "ab" (u.str/limit-bytes "abÆ" 3))))
  (testing "Multi-byte that don't get split are fine"
    (is (= "¼Üß" (u.str/limit-bytes "¼Üß" 6)))
    (is (= 6 (count (.getBytes (u.str/limit-bytes "¼Üß" 6)))))
    (is (= "¼Ü" (u.str/limit-bytes "¼Üß" 4)))
    (is (= 4 (count (.getBytes (u.str/limit-bytes "¼Üß" 4)))))))
