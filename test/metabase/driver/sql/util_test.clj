(ns metabase.driver.sql.util-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql.util :as sql.u]
            [metabase.util.honeysql-extensions :as hx]))

;; `select-clause-deduplicate-aliases` should use the last component of an identifier as the alias if it does not
;; already have one
(expect
  [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
   [(hx/identifier :field "F")             (hx/identifier :field-alias "G")]]
  (sql.u/select-clause-deduplicate-aliases
   [(hx/identifier :field "A" "B" "C" "D")
    [(hx/identifier :field "F")            (hx/identifier :field-alias "G")]]))

;; `select-clause-deduplicate-aliases` should append numeric suffixes to duplicate aliases
(expect
  [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
   [(hx/identifier :field "E" "D")         (hx/identifier :field-alias "D_2")]
   [(hx/identifier :field "F")             (hx/identifier :field-alias "G")]]
  (sql.u/select-clause-deduplicate-aliases
   [(hx/identifier :field "A" "B" "C" "D")
    (hx/identifier :field "E" "D")
    [(hx/identifier :field "F")            (hx/identifier :field-alias "G")]]))

;; `select-clause-deduplicate-aliases` should handle aliases that are already suffixed gracefully
(expect
  [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
   [(hx/identifier :field "E" "D")         (hx/identifier :field-alias "D_2")]
   [(hx/identifier :field "F")             (hx/identifier :field-alias "D_3")]]
  (sql.u/select-clause-deduplicate-aliases
   [(hx/identifier :field "A" "B" "C" "D")
    (hx/identifier :field "E" "D")
    [(hx/identifier :field "F")            (hx/identifier :field-alias "D_2")]]))
