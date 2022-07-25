(ns metabase.util.i18n-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.test :as mt]
            [metabase.util.i18n :as i18n]))

(deftest ^:parallel available-locales-test
  (testing "Should return locale in normalized format"
    (is (contains? (set (i18n/available-locales-with-names))
                   ["pt_BR", "Portuguese (Brazil)"]))))

(deftest tru-test
  (mt/with-mock-i18n-bundles {"es" {:messages {"must be {0} characters or less"
                                               "deben tener {0} caracteres o menos"}}}
    (doseq [[message f] {"tru"
                         (fn [] (i18n/tru "must be {0} characters or less" 140))
                         "tru with str"
                         (fn [] (i18n/tru (str "must be " "{0} characters or less") 140))
                         "deferred-tru"
                         (fn [] (str (i18n/deferred-tru "must be {0} characters or less" 140)))
                         "deferred-tru with str"
                         (fn [] (str (i18n/deferred-tru (str "must be " "{0} characters or less") 140)))}]
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
  (mt/with-mock-i18n-bundles {"es" {:messages {"must be {0} characters or less"
                                               "deben tener {0} caracteres o menos"}}}
    (doseq [[message f] {"trs"
                         (fn [] (i18n/trs "must be {0} characters or less" 140))
                         "trs with str"
                         (fn [] (i18n/trs (str "must be " "{0} characters or less") 140))
                         "deferred-trs"
                         (fn [] (str (i18n/deferred-trs "must be {0} characters or less" 140)))
                         "deferred-trs with str"
                         (fn [] (str (i18n/deferred-trs (str "must be " "{0} characters or less") 140)))}]
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

(deftest trun-test
  (mt/with-mock-i18n-bundles {"es" {:headers {"Plural-Forms" "nplurals=2; plural=(n != 1);\n"}
                                    :messages {"{0} table" ["{0} tabla" "{0} tablas"]}}}
    (doseq [[message singular? f]
            [["trun - singular"
              true
              (fn [] (i18n/trun "{0} table" "{0} tables" 1))]

             ["trun - plural"
              false
              (fn [] (i18n/trun "{0} table" "{0} tables" 2))]

             ["deferred-trun - singular"
              true
              (fn [] (str (i18n/deferred-trun "{0} table" "{0} tables" 1)))]

             ["deferred-trun - plural"
              false
              (fn [] (str (i18n/deferred-trun "{0} table" "{0} tables" 2)))]]]
      (testing message
        (testing "Should fall back to English if user locale & system locale are unset"
          (mt/with-temporary-setting-values [site-locale nil]
            (is (= (if singular? "1 table" "2 tables")
                   (f)))))

        (testing "Should use user locale if set"
          (mt/with-user-locale "es"
            (is (= (if singular? "1 tabla" "2 tablas")
                   (f)))))))))

(deftest trsn-test
  (mt/with-mock-i18n-bundles {"es" {:headers {"Plural-Forms" "nplurals=2; plural=(n != 1);\n"}
                                    :messages {"{0} table" ["{0} tabla" "{0} tablas"]}}}
    (doseq [[message singular? f]
            [["trsn - singular"
              true
              (fn [] (i18n/trsn "{0} table" "{0} tables" 1))]

             ["trsn - plural"
              false
              (fn [] (i18n/trsn "{0} table" "{0} tables" 2))]

             ["deferred-trsn - singular"
              true
              (fn [] (str (i18n/deferred-trsn "{0} table" "{0} tables" 1)))]

             ["deferred-trsn - plural"
              false
              (fn [] (str (i18n/deferred-trsn "{0} table" "{0} tables" 2)))]]]
      (testing message
        (testing "Should fall back to English if user locale & system locale are unset"
          (mt/with-temporary-setting-values [site-locale nil]
            (is (= (if singular? "1 table" "2 tables")
                   (f)))))

        (testing "Should use system locale if set"
          (mt/with-temporary-setting-values [site-locale "es"]
            (is (= (if singular? "1 tabla" "2 tablas")
                   (f)))))))))

(deftest ^:parallel localized-string?-test
  (is (= true
         (i18n/localized-string? (i18n/deferred-trs "WOW"))))
  (is (= false
         (i18n/localized-string? "WOW"))))

(deftest ^:parallel validate-number-of-args-test
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
             (#'i18n/validate-number-of-args "{1}" [0 1]))))))

  (testing "The number of args is still validated if the first argument is a `str` form"
      (is (thrown?
           clojure.lang.Compiler$CompilerException
           (walk/macroexpand-all `(i18n/trs (~'str "{0}" "{1}") 0))))
      (is (thrown-with-msg?
           AssertionError
           #"expects 2 args, got 1"
           (#'i18n/validate-number-of-args '(str "{0}" "{1}") [0])))))
