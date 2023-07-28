(ns metabase.shared.i18n-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.shared.util.i18n :as i18n]))

(deftest ^:parallel tru-test
  (testing "basic strings"
    (is (= "some text here" (i18n/tru "some text here"))))
  (testing "escaping single quotes"
    (is (= "Where there's life there's hope, and need of vittles."
           (i18n/tru "Where there''s life there''s hope, and need of vittles.")))))

(deftest ^:parallel trun-test
  (testing "basic"
    (are [n exp] (= exp (i18n/trun "{0} cat" "{0} cats" n))
      0 "0 cats"
      1 "1 cat"
      7 "7 cats"))
  (testing "escaping in singular"
    (are [n exp] (= exp (i18n/trun "{0} cat''s food" "{0} cats worth of food" n))
      0 "0 cats worth of food"
      1 "1 cat's food"
      7 "7 cats worth of food"))
  (testing "escaping in both"
    (are [n exp] (= exp (i18n/trun "{0} cat''s food" "{0} cats'' food" n))
         0 "0 cats' food"
         1 "1 cat's food"
         7 "7 cats' food")))
