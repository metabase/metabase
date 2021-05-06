(ns metabase.util.password-test
  (:require [clojure.test :refer :all]
            [environ.core :as environ]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.password :as pwu]))

(use-fixtures :once (fixtures/initialize :db))

;; Password Complexity testing

(deftest count-occurrences-test
  (testing "Check that password occurance counting works"
    (doseq [[input expected] {"abc"        {:total 3, :lower 3, :upper 0, :letter 3, :digit 0, :special 0}
                              "PASSWORD"   {:total 8, :lower 0, :upper 8, :letter 8, :digit 0, :special 0}
                              "123"        {:total 3, :lower 0, :upper 0, :letter 0, :digit 3, :special 0}
                              "GoodPw!!"   {:total 8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2}
                              "passworD1"  {:total 9, :lower 7, :upper 1, :letter 8, :digit 1, :special 0}
                              "^^Wut4nG^^" {:total 10, :lower 3, :upper 2, :letter 5, :digit 1, :special 4}}]
      (testing (pr-str (list 'count-occurrences input))
        (is (= expected
               (#'pwu/count-occurrences input)))))))

(deftest password-has-char-counts?-test
  (doseq [[group input->expected]
          {"Check that password length complexity applies"
           {[{:total 3} "god1"] true
            [{:total 4} "god1"] true
            [{:total 5} "god1"] false}

           "Check that testing password character type complexity works"
           {[{} "ABC"]                     true
            [{:lower 1} "ABC"]             false
            [{:lower 1} "abc"]             true
            [{:digit 1} "abc"]             false
            [{:digit 1, :special 2} "!0!"] true}

           "Do some tests that combine both requirements"
           {[{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^aA2"]        false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password"]    false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1"]   false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1!"]  false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD!"]   false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1"]   false
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1!"]  true
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "paSS&&word1"] true
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passW0rd))"]  true
            [{:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^^Wut4nG^^"]  true}}]
    (testing group
      (doseq [[input expected] input->expected]
        (testing (pr-str (cons 'password-has-char-counts? input))
          (is (= expected
                 (apply #'pwu/password-has-char-counts? input))))))))

(deftest is-valid?-normal-test
  (testing "Do some tests with the default (:normal) password requirements"
    (doseq [[input expected] {"ABC"           false
                              "ABCDEF"        false
                              "ABCDE1"        false
                              "123456"        false
                              "passw0rd"      false
                              "PASSW0RD"      false
                              "unc0mmonpw"    true
                              "pa$$w0®∂"      true
                              "s6n!8z-6.gcJe" true}]
      (testing (pr-str (list 'is-valid? input))
        (is (= expected
               (pwu/is-valid? input)))))))

(deftest is-valid?-weak-test
  (testing "Do some tests with password complexity requirements set to :weak.
            Common password list should not be checked."
    (mt/with-temp-env-var-value [:mb-password-complexity "weak"]
      (doseq [[input expected] {"ABC"      false
                                "ABCDEF"   true
                                "ABCDE1"   true
                                "passw0rd" true}]
        (testing (pr-str (list 'is-valid? input))
          (is (= expected
                 (pwu/is-valid? input))))))))
