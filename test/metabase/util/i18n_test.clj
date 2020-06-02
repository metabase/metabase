(ns metabase.util.i18n-test
  (:require [clojure.test :refer :all]
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
