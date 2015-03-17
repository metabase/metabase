(ns metabase.util.password-test
  (:require [expectations :refer :all]
            [metabase.util.password :refer :all]))


;; Password Complexity testing
;; TODO - need a way to test other complexity scenarios.  DI on the config would make this easier.

; fail due to being too short (min 8 chars)
(expect false (is-complex? "god"))
(expect false (is-complex? "god12"))
(expect false (is-complex? "god4!"))
(expect false (is-complex? "Agod4!"))

; fail due to missing complexity
(expect false (is-complex? "password"))
(expect false (is-complex? "password1"))
(expect false (is-complex? "password1!"))
(expect false (is-complex? "passworD!"))
(expect false (is-complex? "passworD1"))

; these passwords should be good
(expect true (is-complex? "passworD1!"))
(expect true (is-complex? "paSS&&word1"))
(expect true (is-complex? "passW0rd))"))
(expect true (is-complex? "^^Wut4nG^^"))
