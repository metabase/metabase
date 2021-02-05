(ns metabase.util.password-test
  (:require [expectations :refer [expect]]
            [clojure.test :refer :all]
            [metabase.util.password :as pwu]))

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

(deftest is-complex?-test
  (testing "Do some tests with the default (:normal) password requirements"
    (doseq [[input expected] {"ABC"    false
                              "ABCDEF" false
                              "ABCDE1" true
                              "123456" true}]
      (testing (pr-str (list 'is-complex? input))
        (is (= expected
               (pwu/is-complex? input)))))))
