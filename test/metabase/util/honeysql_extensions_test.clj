(ns metabase.util.honeysql-extensions-test
  (:require [expectations :refer [expect]]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.util.Locale))

;; Basic format test not including a specific quoting option
(expect
  ["setting"]
  (hformat/format :setting))

;; `:h2` quoting will uppercase and quote the identifier
(expect
  ["\"SETTING\""]
  (hformat/format :setting :quoting :h2))

;; `literal` should be compiled to a single-quoted literal
(expect
  ["WHERE name = 'Cam'"]
  (hsql/format {:where [:= :name (hx/literal "Cam")]}))

;; `literal` should properly escape single-quotes inside the literal string
;; double-single-quotes is how to escape them in SQL
(expect
  ["WHERE name = 'Cam''s'"]
  (hsql/format {:where [:= :name (hx/literal "Cam's")]}))

;; `literal` should only escape single quotes that aren't already escaped -- with two single quotes...
(expect
  ["WHERE name = 'Cam''s'"]
  (hsql/format {:where [:= :name (hx/literal "Cam''s")]}))

;; ...or with a slash
(expect
  ["WHERE name = 'Cam\\'s'"]
  (hsql/format {:where [:= :name (hx/literal "Cam\\'s")]}))

;; `literal` should escape strings that start with a single quote
(expect
  ["WHERE name = '''s'"]
  (hsql/format {:where [:= :name (hx/literal "'s")]}))

;; `literal` should handle namespaced keywords correctly
(expect
  ["WHERE name = 'ab/c'"]
  (hsql/format {:where [:= :name (hx/literal :ab/c)]}))

;; make sure `identifier` properly handles components with dots and both strings & keywords
(expect
  ["`A`.`B`.`C.D`.`E.F`"]
  (hsql/format (hx/identifier "A" :B "C.D" :E.F)
    :quoting :mysql))

;; `identifer` should handle slashes
(expect
  ["`A/B`.`C\\D`.`E/F`"]
  (hsql/format (hx/identifier "A/B" "C\\D" :E/F)
    :quoting :mysql))

;; `identifier` should also handle strings with quotes in them (ANSI)
(expect
  ;; two double-quotes to escape, e.g. "A""B"
  ["\"A\"\"B\""]
  (hsql/format (hx/identifier "A\"B")
    :quoting :ansi))

;; `identifier` should also handle strings with quotes in them (MySQL)
(expect
  ;; double-backticks to escape backticks seems to be the way to do it
  ["`A``B`"]
  (hsql/format (hx/identifier "A`B")
    :quoting :mysql))

;; `identifier` shouldn't try to change `lisp-case` to `snake-case` or vice-versa
(expect
  ["A-B.c-d.D_E.f_g"]
  (hsql/format (hx/identifier "A-B" :c-d "D_E" :f_g)))

(expect
  ["\"A-B\".\"c-d\".\"D_E\".\"f_g\""]
  (hsql/format (hx/identifier "A-B" :c-d "D_E" :f_g)
    :quoting :ansi))

;; `identifier` should ignore `nil` or empty components.
(expect
  ["A.B.C"]
  (hsql/format (hx/identifier "A" "B" nil "C")))

;; `identifier` should handle nested identifiers
(expect
  (hx/identifier "A" "B" "C" "D")
  (hx/identifier "A" (hx/identifier "B" "C") "D"))

(expect
  ["A.B.C.D"]
  (hsql/format (hx/identifier "A" (hx/identifier "B" "C") "D")))

(defn- call-with-locale
  "Sets the default locale temporarily to `locale-tag`, then invokes `f` and reverts the locale change"
  [locale-tag f]
  (let [current-locale (Locale/getDefault)]
    (try
      (Locale/setDefault (Locale/forLanguageTag locale-tag))
      (f)
      (finally
        (Locale/setDefault current-locale)))))

(defmacro ^:private with-locale [locale-tag & body]
  `(call-with-locale ~locale-tag (fn [] ~@body)))

;; We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using Java's
;; toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language like Turkish, it can
;; turn an i into an İ. This test converts a keyword with an `i` in it to verify that we convert the identifier
;; correctly using the english locale even when the user has changed the locale to Turkish
(expect
  ["\"SETTING\""]
  (with-locale "tr"
   (hformat/format :setting :quoting :h2)))

;; test ToSql behavior for Ratios (#9246). Should convert to a double rather than leaving it as a division operation.
;; The double itself should get converted to a numeric literal
(expect
  ["SELECT 0.1 AS one_tenth"]
  (hsql/format {:select [[(/ 1 10) :one_tenth]]}))
