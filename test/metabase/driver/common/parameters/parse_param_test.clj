(ns metabase.driver.common.parameters.parse-param-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse-param :as params.parse-param]))

(deftest simple-param-test
  (testing "Should parse simple params"
    (is (= (params/->Param "foo_bar")
           (params.parse-param/parse-param "foo_bar")))))

(deftest special-param-test
  (testing "Should parse params with special charactesr in the name"
    (is (= (params/->Param "5: the-best_!#?")
           (params.parse-param/parse-param "5: the-best_!#?")))))

(deftest no-arg-function-test
  (testing "Should parse a no-arg function"
    (is (= (params/->FunctionParam "mb.foo" [])
           (params.parse-param/parse-param "mb.foo()")))))

(deftest single-quote-arg-function-test
  (testing "Should parse a function with a single-quote string arg"
    (is (= (params/->FunctionParam "mb.foo" ["hello"])
           (params.parse-param/parse-param "mb.foo('hello')")))))

(deftest double-quote-arg-function-test
  (testing "Should parse a function with a double-quote string arg"
    (is (= (params/->FunctionParam "mb.foo" ["hello"])
           (params.parse-param/parse-param "mb.foo(\"hello\")")))))

(deftest mixed-quote-arg-function-test
  (testing "Should parse a function with both single-quote and double-quote string args"
    (is (= (params/->FunctionParam "mb.foo" ["hello" "goodbye"])
           (params.parse-param/parse-param "mb.foo('hello', \"goodbye\")")))))

(deftest nested-quote-arg-function-test
  (testing "Should parse a function with both single-quote and double-quote string args"
    (is (= (params/->FunctionParam "mb.foo" ["\"hello\"" "'goodbye'"])
           (params.parse-param/parse-param "mb.foo('\"hello\"', \"'goodbye'\")")))))

(deftest parse-errors-are-simple-params-test
  (testing "Invalid function inputs should be treated as regular params"
    (let [bad-inputs ["mb.foo("
                      "mb.foo('hello)"
                      "mb.foo(\"hello\",'goodbye)"
                      "mb.foo(\"hello\",)"
                      "aa.foo('hello')"]]
      (doseq [input bad-inputs]
        (is (= (params/->Param input)
               (params.parse-param/parse-param input)))))))
