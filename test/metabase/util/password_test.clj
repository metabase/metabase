(ns ^:mb/once metabase.util.password-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.password :as u.password]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; Password Complexity testing

(deftest ^:parallel count-occurrences-test
  (testing "Check that password occurance counting works"
    (doseq [[input expected] {"abc"        {:total 3, :lower 3, :upper 0, :letter 3, :digit 0, :special 0}
                              "PASSWORD"   {:total 8, :lower 0, :upper 8, :letter 8, :digit 0, :special 0}
                              "123"        {:total 3, :lower 0, :upper 0, :letter 0, :digit 3, :special 0}
                              "GoodPw!!"   {:total 8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2}
                              "passworD1"  {:total 9, :lower 7, :upper 1, :letter 8, :digit 1, :special 0}
                              "^^Wut4nG^^" {:total 10, :lower 3, :upper 2, :letter 5, :digit 1, :special 4}}]
      (testing (pr-str (list 'count-occurrences input))
        (is (= expected
               (#'u.password/count-occurrences input)))))))

(deftest ^:parallel password-has-char-counts?-test
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
                 (apply #'u.password/password-has-char-counts? input))))))))

(deftest ^:parallel is-valid?-normal-test
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
               (u.password/is-valid? input)))))))

(deftest is-valid?-weak-test
  (testing "Do some tests with password complexity requirements set to :weak.
            Common password list should not be checked."
    (mt/with-temp-env-var-value! [:mb-password-complexity "weak"]
      (doseq [[input expected] {"ABC"      false
                                "ABCDEF"   true
                                "ABCDE1"   true
                                "passw0rd" true}]
        (testing (pr-str (list 'is-valid? input))
          (is (= expected
                 (u.password/is-valid? input))))))))

(deftest passsword-length-test
  (testing "Password length can be set by the env variable MB_PASSWORD_LENGTH"
    (mt/with-temp-env-var-value! [:mb-password-length 3
                                  :mb-password-complexity "weak"] ;; Don't confuse the issue with other complexity requirements
      (doseq [[input expected] {"A"     false
                                "AB"    false
                                "ABC"   true
                                "ABCD"  true
                                "ABCD1" true}]
        (testing (pr-str (list 'is-valid? input))
          (is (= expected
                 (u.password/is-valid? input))))))))

(deftest ^:parallel hash-bcrypt-tests
  ;; these functions were copied from cemerick/friend and just call out to org.mindrot.jbcrypt.BCrypt so these tests
  ;; are a bit perfunctory
  (let [salt (str (random-uuid))
        password (str salt "some-secure-password")
        hashed   (u.password/hash-bcrypt password)]
    (is (not= password hashed))
    (testing "Can verify our hashed passwords"
      (is (u.password/bcrypt-verify password hashed) "Password did not verify"))))
