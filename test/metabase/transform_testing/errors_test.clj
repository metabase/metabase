(ns metabase.transform-testing.errors-test
  "The `:error-type` vocabulary, the `ex` constructor, and warehouse-message remapping.
  Pure — no app-db, no warehouse, no driver."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.transform-testing.errors :as errors]))

;;; -------------------------------------------- checked --------------------------------------------

(deftest checked-accepts-every-declared-type-test
  (testing "`checked` returns its argument for every member of `all`"
    (doseq [error-type errors/all]
      (testing (str error-type)
        (is (= error-type (errors/checked error-type)))))))

(deftest checked-rejects-undeclared-type-test
  (testing "an undeclared keyword throws, carrying the offender in ex-data"
    (is (thrown? clojure.lang.ExceptionInfo (errors/checked ::not-a-real-error)))
    (is (= {:invalid-error-type ::not-a-real-error}
           (try (errors/checked ::not-a-real-error)
                (catch clojure.lang.ExceptionInfo e (ex-data e))))))
  (testing "nil is not a declared error type"
    (is (thrown? clojure.lang.ExceptionInfo (errors/checked nil))))
  (testing "a same-named keyword in another namespace is not a member"
    (is (thrown? clojure.lang.ExceptionInfo (errors/checked ::setup-failed)))))

;;; ------------------------------------------ status-code ------------------------------------------

(def ^:private expected-status
  "The status every declared error type must map to. Exhaustive over `all` by assertion below, so a
  new error type with no mapping fails here instead of being absorbed by the 500 fallback."
  {::errors/duplicate-expectation-name 400
   ::errors/unknown-expectation-type   400
   ::errors/invalid-expectation        400
   ::errors/unsafe-identifier          400
   ::errors/unknown-column             400
   ::errors/ambiguous-column           400
   ::errors/missing-inputs             400
   ::errors/unused-inputs              400
   ::errors/duplicate-input-table      400
   ::errors/unparseable-source         400
   ::errors/unremapped-reference       400
   ::errors/unsupported-transform      422
   ::errors/unsupported-driver         422
   ::errors/transform-failed           422
   ::errors/setup-failed               422
   ::errors/expectation-failed         422
   ::errors/unsupported-format         501})

(defn- types-with-status
  "The members of `all` that `status-code` maps to `status`."
  [status]
  (into #{} (filter #(= status (errors/status-code %))) errors/all))

(deftest status-code-is-exhaustive-over-all-test
  (testing "every declared error type has an expected status, and no stale entry lingers here"
    (is (= errors/all (set (keys expected-status)))))
  (doseq [[error-type expected] expected-status]
    (testing (str error-type)
      (is (= expected (errors/status-code error-type))))))

(deftest status-code-classes-test
  (testing "authoring errors — the caller can fix the test — are 400"
    (is (= #{::errors/duplicate-expectation-name
             ::errors/unknown-expectation-type
             ::errors/invalid-expectation
             ::errors/unsafe-identifier
             ::errors/unknown-column
             ::errors/ambiguous-column
             ::errors/missing-inputs
             ::errors/unused-inputs
             ::errors/duplicate-input-table
             ::errors/unparseable-source
             ::errors/unremapped-reference}
           (types-with-status 400))))
  (testing "environment errors — the transform or its database prevents a run here — are 422"
    (is (= #{::errors/unsupported-transform
             ::errors/unsupported-driver
             ::errors/transform-failed
             ::errors/setup-failed
             ::errors/expectation-failed}
           (types-with-status 422))))
  (testing "a form that is not built yet is 501"
    (is (= #{::errors/unsupported-format}
           (types-with-status 501))))
  (testing "nothing is declared 500"
    ;; `api-exception-response` structures a body only for a non-500 status carrying `:error-code`,
    ;; so a type declared 500 would lose its code on the wire.
    (is (= #{} (types-with-status 500)))))

(deftest status-code-falls-back-to-500-test
  (testing "an unknown error type"
    (is (= 500 (errors/status-code ::not-a-real-error))))
  (testing "an untyped exception"
    (is (= 500 (errors/status-code nil)))))

;;; ----------------------------------------------- ex ----------------------------------------------

(deftest ex-rejects-literal-undeclared-type-at-expansion-test
  (testing "a literal undeclared keyword fails while expanding, not when the form runs"
    ;; The 3-arity only re-emits a 4-arity call, so the check lands one expansion deeper: full
    ;; `macroexpand` for the 3-arity, `macroexpand-1` for the 4-arity.
    ;; A macro that throws while expanding surfaces as a CompilerException wrapping the real one,
    ;; so the typed failure is the cause rather than the thrown class.
    (doseq [form ['(metabase.transform-testing.errors/ex ::undeclared "boom" {})
                  '(metabase.transform-testing.errors/ex ::undeclared "boom" {} nil)]]
      (let [outcome (try (macroexpand form)
                         (catch clojure.lang.Compiler$CompilerException e e))
            cause   (when (instance? clojure.lang.Compiler$CompilerException outcome)
                      (ex-cause outcome))]
        (is (instance? clojure.lang.Compiler$CompilerException outcome)
            "expanding an undeclared type must fail at macro-expansion, not at call time")
        (is (instance? clojure.lang.ExceptionInfo cause))
        (is (= ::undeclared (:invalid-error-type (ex-data cause))))))))

(deftest ex-builds-typed-exception-info-test
  (let [e (errors/ex ::errors/setup-failed "boom" {:transform-id 1})]
    (is (instance? clojure.lang.ExceptionInfo e))
    (is (= "boom" (ex-message e)))
    (testing "the error type is assoc'd into the caller's data, which is otherwise preserved"
      (is (= {:transform-id 1 :error-type ::errors/setup-failed} (ex-data e))))
    (testing "the 3-arity leaves the cause nil"
      (is (nil? (ex-cause e))))))

(deftest ex-attaches-cause-test
  (let [cause (Exception. "underlying")
        e     (errors/ex ::errors/transform-failed "boom" {} cause)]
    (is (identical? cause (ex-cause e)))
    (is (= ::errors/transform-failed (:error-type (ex-data e))))))

(deftest ex-checks-computed-type-at-runtime-test
  (testing "a non-literal error type compiles, and is checked when the form runs"
    (is (thrown? clojure.lang.ExceptionInfo
                 (errors/ex (identity ::undeclared) "boom" {})))
    (is (= {:invalid-error-type ::undeclared}
           (try (errors/ex (identity ::undeclared) "boom" {})
                (catch clojure.lang.ExceptionInfo e (ex-data e))))))
  (testing "a declared computed type is accepted"
    (is (= ::errors/setup-failed
           (:error-type (ex-data (errors/ex (identity ::errors/setup-failed) "boom" {})))))))

;;; ------------------------------------------ remap-message ----------------------------------------

(deftest remap-message-replaces-temp-name-test
  (is (= "Table PUBLIC.ORDERS not found"
         (errors/remap-message "Table mb_test_abc not found" {"mb_test_abc" "PUBLIC.ORDERS"}))))

(deftest remap-message-ignores-case-test
  (testing "Snowflake and H2 upper-case the generated names; the map is keyed by the minted name"
    (is (= "Table PUBLIC.ORDERS not found"
           (errors/remap-message "Table MB_TEST_ABC not found" {"mb_test_abc" "PUBLIC.ORDERS"}))))
  (testing "mixed case too"
    (is (= "Table PUBLIC.ORDERS not found"
           (errors/remap-message "Table Mb_Test_Abc not found" {"mb_test_abc" "PUBLIC.ORDERS"})))))

(deftest remap-message-replaces-several-names-test
  (is (= "cannot join PUBLIC.ORDERS to PUBLIC.PEOPLE"
         (errors/remap-message "cannot join mb_test_abc to mb_test_def"
                               {"mb_test_abc" "PUBLIC.ORDERS"
                                "mb_test_def" "PUBLIC.PEOPLE"}))))

(deftest remap-message-replaces-every-occurrence-test
  (is (= "ORDERS, ORDERS and ORDERS"
         (errors/remap-message "mb_test_abc, mb_test_abc and mb_test_abc"
                               {"mb_test_abc" "ORDERS"}))))

(deftest remap-message-matches-whole-words-only-test
  (testing "an identifier that merely starts with the temp name is left alone"
    (is (= "Table mb_test_abc_extra not found"
           (errors/remap-message "Table mb_test_abc_extra not found" {"mb_test_abc" "ORDERS"}))))
  (testing "one that merely ends with it, likewise"
    (is (= "Table x_mb_test_abc not found"
           (errors/remap-message "Table x_mb_test_abc not found" {"mb_test_abc" "ORDERS"}))))
  (testing "non-word delimiters are boundaries, so a quoted or schema-qualified name still matches"
    (is (= "Table \"ORDERS\" not found"
           (errors/remap-message "Table \"mb_test_abc\" not found" {"mb_test_abc" "ORDERS"})))
    (is (= "Table PUBLIC.ORDERS not found"
           (errors/remap-message "Table PUBLIC.mb_test_abc not found" {"mb_test_abc" "ORDERS"})))))

(deftest remap-message-tolerates-nil-message-test
  (testing "a driver exception with no message does not blow up the rethrow path"
    ;; nil in, nil out: coercing to "" would be indistinguishable from a driver that really said
    ;; nothing, leaving the caller unable to substitute something useful.
    (is (nil? (errors/remap-message nil {"mb_test_abc" "ORDERS"})))))

(deftest remap-message-inserts-logical-name-literally-test
  (testing "$1 in the logical name is a backreference to Matcher/replaceAll unless quoted"
    (is (= "Table PUBLIC.ORDERS$1 not found"
           (errors/remap-message "Table mb_test_abc not found" {"mb_test_abc" "PUBLIC.ORDERS$1"}))))
  (testing "a backslash in the logical name is an escape to Matcher/replaceAll unless quoted"
    (is (= "Table PUBLIC.ORDERS\\X not found"
           (errors/remap-message "Table mb_test_abc not found" {"mb_test_abc" "PUBLIC.ORDERS\\X"})))))

(deftest remap-message-with-empty-map-test
  (testing "nothing to remap returns the message unchanged"
    (is (= "Table mb_test_abc not found"
           (errors/remap-message "Table mb_test_abc not found" {})))))
