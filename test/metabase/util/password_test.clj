(ns metabase.util.password-test
  (:require [expectations :refer :all]
            [metabase.test.util :refer [resolve-private-vars]]
            [metabase.util.password :refer :all]))


;; Password Complexity testing

(resolve-private-vars metabase.util.password count-occurrences password-has-char-counts?)

;; Check that password occurance counting works
(expect {:total  3, :lower 3, :upper 0, :letter 3, :digit 0, :special 0} (count-occurrences "abc"))
(expect {:total  8, :lower 0, :upper 8, :letter 8, :digit 0, :special 0} (count-occurrences "PASSWORD"))
(expect {:total  3, :lower 0, :upper 0, :letter 0, :digit 3, :special 0} (count-occurrences "123"))
(expect {:total  8, :lower 4, :upper 2, :letter 6, :digit 0, :special 2} (count-occurrences "GoodPw!!"))
(expect {:total  9, :lower 7, :upper 1, :letter 8, :digit 1, :special 0} (count-occurrences "passworD1"))
(expect {:total 10, :lower 3, :upper 2, :letter 5, :digit 1, :special 4} (count-occurrences "^^Wut4nG^^"))

;; Check that password length complexity applies
(expect true  (password-has-char-counts? {:total 3} "god1"))
(expect true  (password-has-char-counts? {:total 4} "god1"))
(expect false (password-has-char-counts? {:total 5} "god1"))

;; Check that testing password character type complexity works
(expect true  (password-has-char-counts? {} "ABC"))
(expect false (password-has-char-counts? {:lower 1} "ABC"))
(expect true  (password-has-char-counts? {:lower 1} "abc"))
(expect false (password-has-char-counts? {:digit 1} "abc"))
(expect true  (password-has-char-counts? {:digit 1, :special 2} "!0!"))

;; Do some tests that combine both requirements
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^aA2"))
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password"))
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1"))
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "password1!"))
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD!"))
(expect false (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1"))
(expect true  (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passworD1!"))
(expect true  (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "paSS&&word1"))
(expect true  (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "passW0rd))"))
(expect true  (password-has-char-counts? {:total 6, :lower 1, :upper 1, :digit 1, :special 1} "^^Wut4nG^^"))

;; Do some tests with the default (:normal) password requirements
(expect false (is-complex? "ABC"))
(expect false (is-complex? "ABCDEF"))
(expect true  (is-complex? "ABCDE1"))
(expect true  (is-complex? "123456"))
