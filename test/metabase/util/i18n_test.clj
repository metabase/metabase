(ns metabase.util.i18n-test
  (:require [clojure
             [test :refer :all]
             [walk :as walk]]
            [metabase.test :as mt]
            [metabase.util.i18n :as i18n]))

(deftest tru-test
  (mt/with-mock-i18n-bundles {"es" {"must be {0} characters or less" "deben tener {0} caracteres o menos"}}
    (doseq [[message f] {"tru"          (fn [] (i18n/tru "must be {0} characters or less" 140))
                         "deferred-tru" (fn [] (str (i18n/deferred-tru "must be {0} characters or less" 140)))}]
      (testing message
        (testing "Should fall back to English if user locale & system locale are unset"
          (mt/with-temporary-setting-values [site-locale nil]
            (is (= "must be 140 characters or less"
                   (f)))))

        (testing "If system locale is set but user locale is not, should use system locale"
          (mt/with-temporary-setting-values [site-locale "es"]
            (is (= "deben tener 140 caracteres o menos"
                   (f)))))

        (testing "Should use user locale if set"
          (mt/with-user-locale "es"
            (is (= "deben tener 140 caracteres o menos"
                   (f)))

            (testing "...even if system locale is set"
              (mt/with-temporary-setting-values [site-locale "en"]
                (is (= "deben tener 140 caracteres o menos"
                       (f)))))))))))

(deftest trs-test
  (mt/with-mock-i18n-bundles {"es" {"must be {0} characters or less" "deben tener {0} caracteres o menos"}}
    (doseq [[message f] {"trs"          (fn [] (i18n/trs "must be {0} characters or less" 140))
                         "deferred-trs" (fn [] (str (i18n/deferred-trs "must be {0} characters or less" 140)))}]
      (testing message
        (testing "Should fall back to English if user locale & system locale are unset"
          (mt/with-temporary-setting-values [site-locale nil]
            (is (= "must be 140 characters or less"
                   (f)))))

        (testing "Should use system locale if set"
          (mt/with-temporary-setting-values [site-locale "es"]
            (is (= "deben tener 140 caracteres o menos"
                   (f)))

            (testing "...even if user locale is set"
              (mt/with-user-locale "en"
                (is (= "deben tener 140 caracteres o menos"
                       (f)))))))))))

(deftest localized-string?-test
  (is (= true
         (i18n/localized-string? (i18n/deferred-trs "WOW"))))
  (is (= false
         (i18n/localized-string? "WOW"))))

(deftest validate-number-of-args-test
  (testing "`trs` and `tru` should validate that the are being called with the correct number of args\n"
    (testing "not enough args"
      (is (thrown?
           clojure.lang.Compiler$CompilerException
           (walk/macroexpand-all `(i18n/trs "{0} {1}" 0))))
      (is (thrown-with-msg?
           AssertionError
           #"expects 2 args, got 1"
           (#'i18n/validate-number-of-args "{0} {1}" [0]))))

    (testing "too many args"
      (is (thrown?
           clojure.lang.Compiler$CompilerException
           (walk/macroexpand-all `(i18n/trs "{0} {1}" 0 1 2))))
      (is (thrown-with-msg?
           AssertionError
           #"expects 2 args, got 3"
           (#'i18n/validate-number-of-args "{0} {1}" [0 1 2]))))

    (testing "Missing format specifiers (e.g. {1} but no {0})"
      (testing "num args match num specifiers"
        (is (thrown?
             clojure.lang.Compiler$CompilerException
             (walk/macroexpand-all `(i18n/trs "{1}" 0))))
        (is (thrown-with-msg?
             AssertionError
             #"missing some \{\} placeholders\. Expected \{0\}, \{1\}"
             (#'i18n/validate-number-of-args "{1}" [0]))))

      (testing "num args match num specifiers if none were missing"
        (is (thrown?
             clojure.lang.Compiler$CompilerException
             (walk/macroexpand-all `(i18n/trs "{1}" 0 1))))
        (is (thrown-with-msg?
             AssertionError
             #"missing some \{\} placeholders\. Expected \{0\}, \{1\}"
             (#'i18n/validate-number-of-args "{1}" [0 1])))))))
