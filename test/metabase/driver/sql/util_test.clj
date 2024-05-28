(ns metabase.driver.sql.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util.honey-sql-2 :as h2x]))

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
               [(h2x/identifier :field "F")            (h2x/identifier :field-alias "G")]]))))

    (testing "should append numeric suffixes to duplicate aliases"
      (is (= [[(h2x/identifier :field "A" "B" "C" "D") (h2x/identifier :field-alias "D")]
              [(h2x/identifier :field "E" "D")         (h2x/identifier :field-alias "D_2")]
              [(h2x/identifier :field "F")             (h2x/identifier :field-alias "G")]]
             (sql.u/select-clause-deduplicate-aliases
              [(h2x/identifier :field "A" "B" "C" "D")
               (h2x/identifier :field "E" "D")
               [(h2x/identifier :field "F")            (h2x/identifier :field-alias "G")]]))))

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

(deftest ^:parallel format-sql-with-params-test
  (testing "Baseline: format-sql expands metabase params, which is not desired."
    (is (= "SELECT\n  *\nFROM\n  { { # 1234 } }"
           (sql.u/format-sql :postgres "SELECT * FROM {{#1234}}")))
    (is (= "SELECT\n  *\nFROM\n  { { #1234}}"
           (sql.u/format-sql :mysql "SELECT * FROM {{#1234}}"))))
  (testing "A compact representation should remain compact (and inner spaces removed, if any)."
    (is (= "SELECT\n  *\nFROM\n  {{#1234}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{ #1234 }}")))
    (is (= "SELECT\n  *\nFROM\n  {{#1234}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{#1234}}"))))
  (testing "Symbolic params should also have spaces removed."
    (is (= "SELECT\n  *\nFROM\n  {{FOO_BAR}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{FOO_BAR}}")))
    (is (= "SELECT\n  *\nFROM\n  {{FOO_BAR}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT * FROM {{ FOO_BAR }}"))))
  (testing "Dialect-specific versions should work"
    (is (= "SELECT\n  A\nFROM\n  {{#1234}} WHERE {{STATE}}"
           (sql.u/format-sql-and-fix-params :mysql "SELECT A FROM { { #1234}} WHERE {{ STATE}  }")))
    (is (= "SELECT\n  A\nFROM\n  {{#1234}}\nWHERE\n  {{STATE}}"
           (sql.u/format-sql-and-fix-params :postgres "SELECT A FROM { { #1234}} WHERE {{ STATE}  }")))))

(deftest ^:parallel format-sql-with-additional-operators
  (testing "Should not split additional operators (#36175)"
    (doseq [op @#'sql.u/additional-operators
            :let [q (str "SELECT a FROM t WHERE x " op " 12")]]
      (testing (str "operator " op)
        (doseq [driver-or-dialect (set (concat (descendants driver/hierarchy :sql) (keys sql.u/dialects)))
                ;; the formatter includes # in specialWordChars for :db2, :plsql, :redshift, and :tsql
                :when (not (and (str/includes? op "#")
                                (#{:db2 :plsql :redshift :tsql} driver-or-dialect)))]
          (testing (str "driver or dialect " driver-or-dialect)
            (is (str/includes? (sql.u/format-sql-and-fix-params driver-or-dialect q) op))))))))
