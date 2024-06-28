(ns metabase.upload.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.upload.util :as upload.u])
  #?(:clj
     (:import
      [java.lang AssertionError])))

(deftest unique-name-generator-test
  (let [max-len  4
        original ["abcd" "abcd" "abc" "abd" "abcd" "abc" "ab_4" "dcba" "dcba" "abe" "abf" "abf" "abf"]
        expected ["abcd" "ab_2" "abc" "abd" "ab_3" "ab_5" "ab_4" "dcba" "dc_2" "abe" "abf" "ab_6" "ab_7"]]

    (testing "MBQL's util is not usable"
      (let [alias-fn       (#'upload.u/unique-alias-with-max-length max-len)
            mbql-generator (mbql.u/unique-name-generator :unique-alias-fn alias-fn)]
        (is (thrown-with-msg? #?(:clj AssertionError :cljs js/Error)
                              #"unique-alias-fn must return a different string than its input. Input: \"ab_2\""
                              (mapv mbql-generator original)))))

    (testing "With our adjustments, it works a treat"
      (let [uniquified (upload.u/uniquify-names max-len original)]
        (is (= uniquified (distinct uniquified)))
        (is (= expected uniquified))))))
