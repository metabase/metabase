(ns metabase.driver.sql.util-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql.util :as sql.u]
            [metabase.util.honeysql-extensions :as hx]))

(deftest select-clause-deduplicate-aliases
  (testing `select-clause-deduplicate-aliases`
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

(deftest escape-sql-test
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
