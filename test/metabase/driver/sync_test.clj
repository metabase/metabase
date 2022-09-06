(ns metabase.driver.sync-test
  (:require [clojure.test :as t]
            [metabase.driver.sync :as driver.s])
  (:import clojure.lang.ExceptionInfo))

(t/deftest schema-filter-test
  (doseq [[test-kind expect-match? schema-name inclusion-filters exclusion-filters]
          [["nil filters" true "foo" nil nil]
           ["blank filters" true "foo" "" ""]
           ["simple inclusion filter (include)" true "foo" "foo" ""]
           ["simple inclusion filter (exclude)" false "bar" "foo" ""]
           ["wildcard inclusion filter" true "foo" "f*" ""]
           ["simple exclusion filter (include)" true "bar" "" "foo"]
           ["simple exclusion filter (exclude)" false "foo" "" "foo"]
           ["wildcard exclusion filter" true "foo" "" "b*"]
           ["inclusion filter with commas and wildcards (include)" true "foo" "bar,f*,baz" ""]
           ["inclusion filter with commas and wildcards (exclude)" false "ban" "bar,f*,baz" ""]
           ["exclusion filter with commas and wildcards (include)" true "foo" "" "ba*,fob"]
           ["exclusion filter with commas and wildcards (exclude)" false "foo" "" "bar,baz,fo*"]
           ["multiple inclusion with whitespace trimming" true "bar" "  foo  ,  bar \n  ,  \nbaz  " ""]]]
    (t/testing (str "include-schema? works as expected for " test-kind)
      (t/is (= expect-match? (driver.s/include-schema? inclusion-filters exclusion-filters schema-name))))
    (t/testing "include-schema? throws an exception if both patterns are specified"
      (t/is (thrown-with-msg?
             ExceptionInfo
             #"Inclusion and exclusion patterns cannot both be specified"
             (driver.s/include-schema? "foo" "bar" "whatever"))))))
