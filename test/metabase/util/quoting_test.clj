(ns metabase.util.quoting-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.quoting :as quoting]))

(deftest ^:parallel quoted-test
  (testing "a value becomes one double-quoted line, with pr-str's escapes for newlines, quotes, and backslashes"
    (is (= "\"a\\nb\\\"c\\\\d\"" (quoting/quoted "a\nb\"c\\d"))))
  (testing "line-breaking, invisible, and double-quote-like characters that pr-str leaves raw are escaped"
    (is (= "\"a\\u2028b\\u001bc\\u200bd\\u201ce\\udb40\\udc41\""
           (quoting/quoted "a\u2028b\u001bc\u200bd\u201ce\uDB40\uDC41"))))
  (testing "single quotes and ordinary non-ASCII text are kept"
    (is (= "\"Men’s Straße 東京\"" (quoting/quoted "Men’s Straße 東京"))))
  (testing "the caller's print bindings don't change the result"
    (binding [*print-readably* false]
      (is (= "\"a\\nb\"" (quoting/quoted "a\nb"))))))
