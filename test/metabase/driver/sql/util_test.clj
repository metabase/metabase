(ns metabase.driver.sql.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.util :as sql.u]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx]))

(deftest ^:parallel quote-name-test
  (are [driver expected] (= expected
                            (sql.u/quote-name driver :field "wow"))
    :mysql    "`wow`"
    :h2       "\"wow\""
    :postgres "\"wow\""))

(deftest ^:parallel select-clause-deduplicate-aliases
  (testing 'select-clause-deduplicate-aliases
    (testing "should use the last component of an identifier as the alias if it does not already have one"
      (is (= [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
              [(hx/identifier :field "F")             (hx/identifier :field-alias "G")]]
             (sql.u/select-clause-deduplicate-aliases
              [(hx/identifier :field "A" "B" "C" "D")
               [(hx/identifier :field "F")            (hx/identifier :field-alias "G")]]))))

    (testing "should append numeric suffixes to duplicate aliases"
      (is (= [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
              [(hx/identifier :field "E" "D")         (hx/identifier :field-alias "D_2")]
              [(hx/identifier :field "F")             (hx/identifier :field-alias "G")]]
             (sql.u/select-clause-deduplicate-aliases
              [(hx/identifier :field "A" "B" "C" "D")
               (hx/identifier :field "E" "D")
               [(hx/identifier :field "F")            (hx/identifier :field-alias "G")]]))))

    (testing "should handle aliases that are already suffixed gracefully"
      (is (= [[(hx/identifier :field "A" "B" "C" "D") (hx/identifier :field-alias "D")]
              [(hx/identifier :field "E" "D")         (hx/identifier :field-alias "D_2")]
              [(hx/identifier :field "F")             (hx/identifier :field-alias "D_3")]]
             (sql.u/select-clause-deduplicate-aliases
              [(hx/identifier :field "A" "B" "C" "D")
               (hx/identifier :field "E" "D")
               [(hx/identifier :field "F")            (hx/identifier :field-alias "D_2")]]))))))

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
