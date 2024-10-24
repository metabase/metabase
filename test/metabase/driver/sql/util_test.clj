(ns ^:mb/driver-tests metabase.driver.sql.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util.honey-sql-2 :as h2x]))

;;; Ok to hardcode driver names here because it's for a general util function and not something that needs to be run
;;; against all supported drivers
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel quote-name-test
  (are [driver expected] (= expected
                            (sql.u/quote-name driver :field "wow"))
    :mysql    "`wow`"
    :h2       "\"wow\""
    :postgres "\"wow\""))

(deftest ^:parallel select-clause-alias-everything-test
  (testing "first column is just <identifer>, wrap it like [<identifier> <alias>]"
    (is (= [[(h2x/identifier :field "A" "B" "C" "D") (h2x/identifier :field-alias "D")]
            [(h2x/identifier :field "F")             (h2x/identifier :field-alias "G")]]
           (sql.u/select-clause-alias-everything
            [(h2x/identifier :field "A" "B" "C" "D")
             [(h2x/identifier :field "F")            (h2x/identifier :field-alias "G")]])))))

(deftest ^:parallel select-clause-deduplicate-aliases
  (testing 'select-clause-deduplicate-aliases
    (testing "should use the last component of an identifier as the alias if it does not already have one"
      (is (= [[(h2x/identifier :field "A" "B" "C" "D") (h2x/identifier :field-alias "D")]
              [(h2x/identifier :field "F")             (h2x/identifier :field-alias "G")]]
             (sql.u/select-clause-deduplicate-aliases
              [(h2x/identifier :field "A" "B" "C" "D")
               [(h2x/identifier :field "F")            (h2x/identifier :field-alias "G")]]))))))

(deftest ^:parallel select-clause-deduplicate-aliases-2
  (testing 'select-clause-deduplicate-aliases
    (testing "should append numeric suffixes to duplicate aliases"
      (is (= [[(h2x/identifier :field "A" "B" "C" "D") (h2x/identifier :field-alias "D")]
              [(h2x/identifier :field "E" "D")         (h2x/identifier :field-alias "D_2")]
              [(h2x/identifier :field "F")             (h2x/identifier :field-alias "G")]]
             (sql.u/select-clause-deduplicate-aliases
              [(h2x/identifier :field "A" "B" "C" "D")
               (h2x/identifier :field "E" "D")
               [(h2x/identifier :field "F")            (h2x/identifier :field-alias "G")]]))))))

(deftest ^:parallel select-clause-deduplicate-aliases-3
  (testing 'select-clause-deduplicate-aliases
    (testing "should handle aliases that are already suffixed gracefully"
      (is (= [[(h2x/identifier :field "A" "B" "C" "D") (h2x/identifier :field-alias "D")]
              [(h2x/identifier :field "E" "D")         (h2x/identifier :field-alias "D_2")]
              [(h2x/identifier :field "F")             (h2x/identifier :field-alias "D_3")]]
             (sql.u/select-clause-deduplicate-aliases
              [(h2x/identifier :field "A" "B" "C" "D")
               (h2x/identifier :field "E" "D")
               [(h2x/identifier :field "F")            (h2x/identifier :field-alias "D_2")]]))))))

(deftest ^:parallel escape-sql-test
  (doseq [[escape-strategy s->expected]
          {:ansi
           {"Tito's Tacos"          "Tito''s Tacos"
            "\\\\\\\\' OR 1 = 1 --" "\\\\\\\\'' OR 1 = 1 --"
            "\\\\' OR 1 = 1 --"     "\\\\'' OR 1 = 1 --"
            "\\' OR 1 = 1 --"       "\\'' OR 1 = 1 --"
            "' OR 1 = 1 --"         "'' OR 1 = 1 --"}

           :backslashes
           {"Tito's Tacos"          "Tito\\'s Tacos"
            "\\\\\\\\' OR 1 = 1 --" "\\\\\\\\\\\\\\\\\\' OR 1 = 1 --"
            "\\\\' OR 1 = 1 --"     "\\\\\\\\\\' OR 1 = 1 --"
            "\\' OR 1 = 1 --"       "\\\\\\' OR 1 = 1 --"
            "' OR 1 = 1 --"         "\\' OR 1 = 1 --"}}

          [s expected] s->expected]
    (testing escape-strategy
      (testing (pr-str s)
        (is (= expected
               (sql.u/escape-sql s escape-strategy)))))))

;;; Ok to hardcode driver names in the tests below because they're for general util functions and not something that
;;; needs to be run against all supported drivers

#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel format-sql-with-params-test
  (testing "Baseline: format-sql expands metabase params, which is not desired."
    (is (= "SELECT\n  *\nFROM\n  { { # 1234 } }"
           (sql.u/format-sql :postgres "SELECT * FROM {{#1234}}")))
    (is (= "SELECT\n  *\nFROM\n  { { #1234}}"
           (sql.u/format-sql :mysql "SELECT * FROM {{#1234}}")))))

#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel format-sql-with-params-test-2
  (testing "A compact representation should remain compact (and inner spaces removed, if any)."
    (is (= "SELECT\n  *\nFROM\n  {{#1234}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{ #1234 }}")))
    (is (= "SELECT\n  *\nFROM\n  {{#1234}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{#1234}}")))))

#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel format-sql-with-params-test-3
  (testing "Symbolic params should also have spaces removed."
    (is (= "SELECT\n  *\nFROM\n  {{FOO_BAR}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{FOO_BAR}}")))
    (is (= "SELECT\n  *\nFROM\n  {{FOO_BAR}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{ FOO_BAR }}")))))

#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel format-sql-with-params-test-4
  (testing "Dialect-specific versions should work"
    (is (= "SELECT\n  A\nFROM\n  {{#1234}} WHERE {{STATE}}"
           (sql.u/format-sql-and-fix-params :mysql "SELECT A FROM { { #1234}} WHERE {{ STATE}  }")))
    (is (= "SELECT\n  A\nFROM\n  {{#1234}}\nWHERE\n  {{STATE}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT A FROM { { #1234}} WHERE {{ STATE}  }")))))

(defmulti pound-sign-is-special-word-char?
  {:arglists '([driver-or-dialect])}
  keyword)

(defmethod pound-sign-is-special-word-char? :default
  [_driver-or-dialect]
  false)

;;; the formatter includes # in specialWordChars for :db2, :plsql, :redshift, and :tsql
(doseq [driver-or-dialect [:db2 :plsql :redshift :tsql]]
  (defmethod pound-sign-is-special-word-char? driver-or-dialect
    [_driver-or-dialect]
    true))

(deftest ^:parallel format-sql-with-additional-operators
  (testing "Should not split additional operators (#36175)"
    (doseq [op @#'sql.u/additional-operators
            :let [q (str "SELECT a FROM t WHERE x " op " 12")]]
      (testing (str "operator " op)
        (doseq [driver-or-dialect (into #{} cat [(descendants driver/hierarchy :sql) (keys sql.u/dialects)])
                :when (not (and (str/includes? op "#")
                                (pound-sign-is-special-word-char? driver-or-dialect)))]
          (testing (str "driver or dialect " driver-or-dialect)
            (is (str/includes? (sql.u/format-sql-and-fix-params driver-or-dialect q) op))))))))
