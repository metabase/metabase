(ns metabase.util.honeysql-extensions-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
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

(deftest maybe-cast-test
  (testing "maybe-cast should only cast things that need to be cast"
    (letfn [(->sql [expr]
              (hsql/format {:select [expr]}))
            (maybe-cast [expr]
              (->sql (hx/maybe-cast "text" expr)))]
      (is (= ["SELECT CAST(field AS text)"]
             (maybe-cast :field)))
      (testing "cast should return a typed form"
        (is (= ["SELECT CAST(field AS text)"]
               (maybe-cast (hx/cast "text" :field)))))
      (testing "should not cast something that's already typed"
        (let [typed-expr (hx/with-type-info :field {::hx/database-type "text"})]
          (is (= ["SELECT field"]
                 (maybe-cast typed-expr)))
          (testing "should work with different string/keyword and case combos"
            (is (= typed-expr
                   (hx/maybe-cast :text typed-expr)
                   (hx/maybe-cast "TEXT" typed-expr)
                   (hx/maybe-cast :TEXT typed-expr)))))
        (testing "multiple calls to maybe-cast should only cast at most once"
          (is (= (hx/maybe-cast "text" :field)
                 (hx/maybe-cast "text" (hx/maybe-cast "text" :field))))
          (is (= ["SELECT CAST(field AS text)"]
                 (maybe-cast (hx/maybe-cast "text" :field)))))))))

(def ^:private typed-form (hx/with-type-info :field {::hx/database-type "text"}))

(deftest TypedHoneySQLForm-test
  (testing "should generate readable output"
    (is (= (pr-str `(hx/with-type-info :field {::hx/database-type "text"}))
           (pr-str typed-form)))))

(deftest type-info-test
  (testing "should let you get info"
    (is (= {::hx/database-type "text"}
           (hx/type-info typed-form)))
    (is (= nil
           (hx/type-info :field)
           (hx/type-info nil)))))

(deftest with-type-info-test
  (testing "should let you update info"
    (is (= (hx/with-type-info :field {::hx/database-type "date"})
           (hx/with-type-info typed-form {::hx/database-type "date"})))
    (testing "should normalize :database-type"
      (is (= (hx/with-type-info :field {::hx/database-type "date"})
             (hx/with-type-info typed-form {::hx/database-type "date"}))))))

(deftest with-database-type-info-test
  (testing "should be the same as calling `with-type-info` with `::hx/database-type`"
    (is (= (hx/with-type-info :field {::hx/database-type "date"})
           (hx/with-database-type-info :field "date"))))
  (testing "Passing `nil` should"
    (testing "return untyped clause as-is"
      (is (= :field
             (hx/with-database-type-info :field nil))))
    (testing "unwrap a typed clause"
      (is (= :field
             (hx/with-database-type-info (hx/with-database-type-info :field "date") nil))))))

(deftest is-of-type?-test
  (mt/are+ [expr tyype expected] (= expected (hx/is-of-type? expr tyype))
    typed-form     "text" true
    typed-form     "TEXT" true
    typed-form     :text  true
    typed-form     :TEXT  true
    typed-form     :te/xt false
    typed-form     "date" false
    typed-form     nil    false
    nil            "date" false
    :%current_date "date" false
    ;; I guess this behavior makes sense? I guess untyped = "is of type nil"
    nil            nil    true
    :%current_date nil    true))

(deftest unwrap-typed-honeysql-form-test
  (testing "should be able to unwrap"
    (is (= :field
           (hx/unwrap-typed-honeysql-form typed-form)
           (hx/unwrap-typed-honeysql-form :field)))
    (is (= nil
           (hx/unwrap-typed-honeysql-form nil)))))
