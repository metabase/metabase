(ns metabase.util.password-test
  (:require [expectations :refer [expect]]
            [metabase.util.password :as pwu]))

;; Password Complexity testing

;; Check that password occurance counting works
(expect {:total  3, :lower 3, :upper 0, :letter 3, :digit 0, :special 0} (#'pwu/count-occurrences "abc"))
(expect {:total  8, :lower 0, :upper 8, :letter 8, :digit 0, :special 0} (#'pwu/count-occurrences "PASSWORD"))
(expect {:total  3, :lower 0, :upper 0, :letter 0, :digit 3, :special 0} (#'pwu/count-occurrences "123"))
(expect {:total  8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2} (#'pwu/count-occurrences "GoodPw!!"))
(expect {:total  9, :lower 7, :upper 1, :letter 8, :digit 1, :special 0} (#'pwu/count-occurrences "passworD1"))
(expect {:total 10, :lower 3, :upper 2, :letter 5, :digit 1, :special 4} (#'pwu/count-occurrences "^^Wut4nG^^"))

;; Check that password length complexity applies
(expect true  (#'pwu/password-has-char-counts? {:total 3} "god1"))
(expect true  (#'pwu/password-has-char-counts? {:total 4} "god1"))
(expect false (#'pwu/password-has-char-counts? {:total 5} "god1"))

;; Check that testing password character type complexity works
(expect true  (#'pwu/password-has-char-counts? {} "ABC"))
(expect false (#'pwu/password-has-char-counts? {:lower 1} "ABC"))
(expect true  (#'pwu/password-has-char-counts? {:lower 1} "abc"))
(expect false (#'pwu/password-has-char-counts? {:digit 1} "abc"))
(expect true  (#'pwu/password-has-char-counts? {:digit 1, :special 2} "!0!"))

;; Do some tests that combine both requirements
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^aA2"))
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password"))
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1"))
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1!"))
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD!"))
(expect false (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1"))
(expect true  (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1!"))
(expect true  (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "paSS&&word1"))
(expect true  (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passW0rd))"))
(expect true  (#'pwu/password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^^Wut4nG^^"))

;; Do some tests with the default (:normal) password requirements
(expect false (pwu/is-complex? "ABC"))
(expect false (pwu/is-complex? "ABCDEF"))
(expect true  (pwu/is-complex? "ABCDE1"))
(expect true  (pwu/is-complex? "123456"))
