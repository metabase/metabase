(ns metabase.driver.sync-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.postgres]
   [metabase.driver.sync :as driver.s])
  (:import
   (clojure.lang ExceptionInfo)))

(comment metabase.driver.postgres/keep-me) ; this is used by [[schema-filter-NPE-test]] below

(deftest ^:parallel schema-filter-test
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
    (testing (str "include-schema? works as expected for " test-kind)
      (is (= expect-match? (driver.s/include-schema? inclusion-filters exclusion-filters schema-name))))
    (testing "include-schema? throws an exception if both patterns are specified"
      (is (thrown-with-msg?
           ExceptionInfo
           #"Inclusion and exclusion patterns cannot both be specified"
           (driver.s/include-schema? "foo" "bar" "whatever"))))))

(deftest ^:parallel schema-filter-NPE-test
  (testing "Schema filter function should not NPE if you pass in a `nil` schema (#38156)"
    (testing "inclusion -- don't include nil schemas"
      (let [db {:details {:schema-filters-type "inclusion"
                          :schema-filters-patterns "x"}
                :engine :postgres}]
        (is (not (driver.s/include-schema? db nil)))))
    (testing "exclusion -- don't exclude nil schemas"
      (let [db {:details {:schema-filters-type "exclusion"
                          :schema-filters-patterns "x"}
                :engine :postgres}]
        (is (driver.s/include-schema? db nil))))))
