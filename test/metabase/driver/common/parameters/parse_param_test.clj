(ns metabase.driver.common.parameters.parse-param-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse-param :as params.parse-param]))

(deftest simple-param-test
  (testing "Should parse simple params"
    (is (= (params.parse-param/parse-param "foo_bar")
           (params/->Param "foo_bar")))))

(deftest special-characters-name-test
  (testing "Should parse names with some special characters"
    (is (= (params.parse-param/parse-param "foo-bar_bash#")
           (params/->Param "foo-bar_bash#")))))

(deftest no-arg-function-test
  (testing "Should parse a no-arg function"
    (is (= (params.parse-param/parse-param "mb.foo()")
           (params/->FunctionParam "mb.foo" [])))))

(deftest single-quote-arg-function-test
  (testing "Should parse a function with a single-quote string arg"
    (is (= (params.parse-param/parse-param "mb.foo('hello')")
           (params/->FunctionParam "mb.foo" ["hello"])))))

(deftest double-quote-arg-function-test
  (testing "Should parse a function with a double-quote string arg"
    (is (= (params.parse-param/parse-param "mb.foo(\"hello\")")
           (params/->FunctionParam "mb.foo" ["hello"])))))

(deftest mixed-quote-arg-function-test
  (testing "Should parse a function with both single-quote and double-quote string args"
    (is (= (params.parse-param/parse-param "mb.foo('hello', \"goodbye\")")
           (params/->FunctionParam "mb.foo" ["hello" "goodbye"])))))
