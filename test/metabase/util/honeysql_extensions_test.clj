(ns metabase.util.honeysql-extensions-test
  (:require [clojure.test :refer :all]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase.test :as mt]
            [metabase.util.honeysql-extensions :as hx])
  (:import metabase.util.honeysql_extensions.Identifier))

(deftest format-test
  (testing "Basic format test not including a specific quoting option"
    (is (= ["setting"]
           (hformat/format :setting))))

  (testing "`:h2` quoting will uppercase and quote the identifier"
    (is (= ["\"SETTING\""]
           (hformat/format :setting :quoting :h2)))))

(deftest literal-test
  (testing "`literal` should be compiled to a single-quoted literal"
    (is (= ["WHERE name = 'Cam'"]
           (hsql/format {:where [:= :name (hx/literal "Cam")]}))))

  (testing (str "`literal` should properly escape single-quotes inside the literal string double-single-quotes is how "
                "to escape them in SQL")
    (is (= ["WHERE name = 'Cam''s'"]
           (hsql/format {:where [:= :name (hx/literal "Cam's")]}))))

  (testing "`literal` should only escape single quotes that aren't already escaped -- with two single quotes..."
    (is (= ["WHERE name = 'Cam''s'"]
           (hsql/format {:where [:= :name (hx/literal "Cam''s")]}))))

  (testing "...or with a slash"
    (is (= ["WHERE name = 'Cam\\'s'"]
           (hsql/format {:where [:= :name (hx/literal "Cam\\'s")]}))))

  (testing "`literal` should escape strings that start with a single quote"
    (is (= ["WHERE name = '''s'"]
           (hsql/format {:where [:= :name (hx/literal "'s")]}))))

  (testing "`literal` should handle namespaced keywords correctly"
    (is (= ["WHERE name = 'ab/c'"]
           (hsql/format {:where [:= :name (hx/literal :ab/c)]}))))

  (testing "make sure `identifier` properly handles components with dots and both strings & keywords"
    (is (= ["`A`.`B`.`C.D`.`E.F`"]
           (hsql/format (hx/identifier :field "A" :B "C.D" :E.F)
                        :quoting :mysql))))

  (testing "`identifer` should handle slashes"
    (is (= ["`A/B`.`C\\D`.`E/F`"]
           (hsql/format (hx/identifier :field "A/B" "C\\D" :E/F)
                        :quoting :mysql))))

  (testing "`identifier` should also handle strings with quotes in them (ANSI)"
    ;; two double-quotes to escape, e.g. "A""B"
    (is (= ["\"A\"\"B\""]
           (hsql/format (hx/identifier :field "A\"B")
                        :quoting :ansi))))

  (testing "`identifier` should also handle strings with quotes in them (MySQL)"
    ;; double-backticks to escape backticks seems to be the way to do it
    (is (= ["`A``B`"]
           (hsql/format (hx/identifier :field "A`B")
                        :quoting :mysql))))

  (testing "`identifier` shouldn't try to change `lisp-case` to `snake-case` or vice-versa"
    (is (= ["A-B.c-d.D_E.f_g"]
           (hsql/format (hx/identifier :field "A-B" :c-d "D_E" :f_g))))

    (is (= ["\"A-B\".\"c-d\".\"D_E\".\"f_g\""]
           (hsql/format (hx/identifier :field "A-B" :c-d "D_E" :f_g)
                        :quoting :ansi))))

  (testing "`identifier` should ignore `nil` or empty components."
    (is (= ["A.B.C"]
           (hsql/format (hx/identifier :field "A" "B" nil "C")))))

  (testing "`identifier` should handle nested identifiers"
    (is (= (hx/identifier :field "A" "B" "C" "D")
           (hx/identifier :field "A" (hx/identifier :field "B" "C") "D")))

    (is (= ["A.B.C.D"]
           (hsql/format (hx/identifier :field "A" (hx/identifier :field "B" "C") "D")))))

  (testing "the `identifier` function should unnest identifiers for you so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["A" "B" "C" "D"])
           (hx/identifier :field "A" (hx/identifier :field "B" "C") "D"))))

  (testing "the `identifier` function should remove nils so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["table" "field"])
           (hx/identifier :field nil "table" "field"))))

  (testing "the `identifier` function should convert everything to strings so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["keyword" "qualified/keyword"])
           (hx/identifier :field :keyword :qualified/keyword)))))

(deftest h2-quoting-test
  (testing (str "We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using "
                "Java's toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language "
                "like Turkish, it can turn an i into an İ. This test converts a keyword with an `i` in it to verify "
                "that we convert the identifier correctly using the english locale even when the user has changed the "
                "locale to Turkish")
    (mt/with-locale "tr"
      (is (= ["\"SETTING\""]
             (hformat/format :setting :quoting :h2))))))

(deftest ratios-test
  (testing (str "test ToSql behavior for Ratios (#9246). Should convert to a double rather than leaving it as a "
                "division operation. The double itself should get converted to a numeric literal")
    (is (= ["SELECT 0.1 AS one_tenth"]
           (hsql/format {:select [[(/ 1 10) :one_tenth]]})))))
