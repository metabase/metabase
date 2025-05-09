(ns metabase.lib.parse-param-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.parse-param :as lib.parse-param]))

(defn- ->param [param-name]
  {:type :metabase.lib.parse/param
   :name param-name})

(defn- ->function-param [function-name args]
  {:type :metabase.lib.parse/function-param
   :name function-name
   :args args})

(deftest ^:parallel simple-param-test
  (testing "Should parse simple params"
    (is (= (->param "foo_bar")
           (lib.parse-param/parse-param "foo_bar")))))

(deftest ^:parallel special-param-test
  (testing "Should parse params with special charactesr in the name"
    (is (= (->param "5: the-best_!#?")
           (lib.parse-param/parse-param "5: the-best_!#?")))))

(deftest ^:parallel no-arg-function-test
  (testing "Should parse a no-arg function"
    (is (= (->function-param "mb.foo" [])
           (lib.parse-param/parse-param "mb.foo()")))))

(deftest ^:parallel single-quote-arg-function-test
  (testing "Should parse a function with a single-quote string arg"
    (is (= (->function-param "mb.foo" ["hello"])
           (lib.parse-param/parse-param "mb.foo('hello')")))))

(deftest ^:parallel double-quote-arg-function-test
  (testing "Should parse a function with a double-quote string arg"
    (is (= (->function-param "mb.foo" ["hello"])
           (lib.parse-param/parse-param "mb.foo(\"hello\")")))))

(deftest ^:parallel mixed-quote-arg-function-test
  (testing "Should parse a function with both single-quote and double-quote string args"
    (is (= (->function-param "mb.foo" ["hello" "goodbye"])
           (lib.parse-param/parse-param "mb.foo('hello', \"goodbye\")")))))

(deftest ^:parallel nested-quote-arg-function-test
  (testing "Should parse a function with both single-quote and double-quote string args"
    (is (= (->function-param "mb.foo" ["\"hello\"" "'goodbye'"])
           (lib.parse-param/parse-param "mb.foo('\"hello\"', \"'goodbye'\")")))))

(deftest ^:parallel parse-errors-are-simple-params-test
  (testing "Invalid function inputs should be treated as regular params"
    (let [bad-inputs ["mb.foo("
                      "mb.foo('hello)"
                      "mb.foo(\"hello\",'goodbye)"
                      "mb.foo(\"hello\",)"
                      "aa.foo('hello')"]]
      (doseq [input bad-inputs]
        (is (= (->param input)
               (lib.parse-param/parse-param input)))))))
