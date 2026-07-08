(ns metabase-enterprise.transforms-verification.errors-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.api.util :as api-util]
   [metabase-enterprise.transforms-verification.errors :as errors]))

(deftest ^:parallel status-map-keys-are-declared-error-types-test
  (testing "every :error-type in the HTTP status map is a declared error-type"
    (is (empty? (set/difference (set (keys api-util/test-run-error-http-status))
                                errors/all))
        "an entry in test-run-error-http-status maps a keyword absent from errors/all — likely a typo or a renamed/removed error-type")))

(deftest ^:parallel ex-constructs-typed-exception-test
  (testing "errors/ex threads type, message, data, and cause"
    (let [cause (RuntimeException. "root")
          e     (errors/ex ::errors/seed-failed "boom" {:created []} cause)]
      (is (instance? clojure.lang.ExceptionInfo e))
      (is (= "boom" (ex-message e)))
      (is (= ::errors/seed-failed (:error-type (ex-data e))))
      (is (= [] (:created (ex-data e))))
      (is (identical? cause (ex-cause e)))))
  (testing "3-arity constructs with nil cause"
    (let [e (errors/ex ::errors/cycle "cyc" {:remaining [1 2]})]
      (is (= ::errors/cycle (:error-type (ex-data e))))
      (is (nil? (ex-cause e))))))

(deftest ^:parallel ex-rejects-undeclared-error-type-test
  (testing "a literal keyword absent from errors/all fails at macro-expansion"
    ;; The compiler wraps the expansion-time throw in a CompilerException; the
    ;; vocabulary message is on its cause.
    (let [e (is (thrown? clojure.lang.Compiler$CompilerException
                         (eval '(metabase-enterprise.transforms-verification.errors/ex
                                 :metabase-enterprise.transforms-verification.errors/not-a-real-error-type
                                 "msg" {}))))]
      (is (re-find #"not a declared test-run error type" (ex-message (ex-cause e))))))
  (testing "a computed keyword absent from errors/all fails at runtime"
    (let [t :metabase-enterprise.transforms-verification.errors/also-not-real]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"not a declared test-run error type"
           (errors/ex t "msg" {})))))
  (testing "a computed keyword in errors/all constructs normally"
    (let [t ::errors/cycle]
      (is (= t (:error-type (ex-data (errors/ex t "msg" {}))))))))
