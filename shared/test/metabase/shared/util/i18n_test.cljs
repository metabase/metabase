(ns metabase.shared.util.i18n-test
  (:require [clojure.test :refer [deftest testing is]]
            [metabase.shared.util.i18n :as i18n]
            ["ttag" :as ttag]))

(deftest chomp-format-string-test
  (is (= ["hello there"] (i18n/chomp-format-string "hello there")))
  (is (= ["hello there "] (i18n/chomp-format-string "hello there {0}")))
  (is (= ["hello " " there"] (i18n/chomp-format-string "hello {0} there")))
  (testing "recognizes {0} and { 0 }"
    (is (= ["hello " " there"] (i18n/chomp-format-string "hello { 0 } there"))))
  (is (= ["a " " b " " c " " d " " e"]
         (i18n/chomp-format-string "a {0} b {1} c {2} d {3} e")))
  (is (= ["hello there "] (i18n/chomp-format-string "hello there {10}"))))

(deftest js-i18n-test
  (is (= "hello" (i18n/js-i18n "hello")))
  (is (= "hello there" (i18n/js-i18n "hello {0}" "there")))
  (is (= "your sound card works perfectly"
         (i18n/js-i18n "your {0} works {1}"
                       "sound card"
                       "perfectly")))
  ;;todo: it would be nice if we could do but i don't know how to trigger that
  #_#_#_
  (ttag/useLocale "fr")
  (is (= "hello" (i18n/js-i18n "bonjour")))
  (ttag/useLocale "en"))
