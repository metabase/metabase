(ns ^:mb/once metabase.util.honey-sql-1-test
  (:require
   [clojure.test :refer :all]
   [honeysql.core :as hsql]
   [honeysql.format :as hformat]
   [metabase.test :as mt]
   [metabase.util.honey-sql-1 :as h1x]
   [metabase.util.honeysql-extensions :as hx])
  (:import
   (metabase.util.honey_sql_1 Identifier)))

(deftest ^:parallel format-test
  (testing "Basic format test not including a specific quoting option"
    (is (= ["setting"]
           (hformat/format :setting))))

  (testing "`:h2` quoting will uppercase and quote the identifier"
    (is (= ["\"SETTING\""]
           (hformat/format :setting :quoting :h2)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel literal-test
  (testing "`literal` should be compiled to a single-quoted literal"
    (is (= ["WHERE name = 'Cam'"]
           (hsql/format {:where [:= :name (h1x/literal "Cam")]}))))

  (testing (str "`literal` should properly escape single-quotes inside the literal string double-single-quotes is how "
                "to escape them in SQL")
    (is (= ["WHERE name = 'Cam''s'"]
           (hsql/format {:where [:= :name (h1x/literal "Cam's")]}))))

  (testing "`literal` should only escape single quotes that aren't already escaped -- with two single quotes..."
    (is (= ["WHERE name = 'Cam''s'"]
           (hsql/format {:where [:= :name (h1x/literal "Cam''s")]}))))

  (testing "...or with a slash"
    (is (= ["WHERE name = 'Cam\\'s'"]
           (hsql/format {:where [:= :name (h1x/literal "Cam\\'s")]}))))

  (testing "`literal` should escape strings that start with a single quote"
    (is (= ["WHERE name = '''s'"]
           (hsql/format {:where [:= :name (h1x/literal "'s")]}))))

  (testing "`literal` should handle namespaced keywords correctly"
    (is (= ["WHERE name = 'ab/c'"]
           (hsql/format {:where [:= :name (h1x/literal :ab/c)]}))))

  (testing "make sure `identifier` properly handles components with dots and both strings & keywords"
    (is (= ["`A`.`B`.`C.D`.`E.F`"]
           (hsql/format (h1x/identifier :field "A" :B "C.D" :E.F)
                        :quoting :mysql))))

  (testing "`identifer` should handle slashes"
    (is (= ["`A/B`.`C\\D`.`E/F`"]
           (hsql/format (h1x/identifier :field "A/B" "C\\D" :E/F)
                        :quoting :mysql))))

  (testing "`identifier` should also handle strings with quotes in them (ANSI)"
    ;; two double-quotes to escape, e.g. "A""B"
    (is (= ["\"A\"\"B\""]
           (hsql/format (h1x/identifier :field "A\"B")
                        :quoting :ansi))))

  (testing "`identifier` should also handle strings with quotes in them (MySQL)"
    ;; double-backticks to escape backticks seems to be the way to do it
    (is (= ["`A``B`"]
           (hsql/format (h1x/identifier :field "A`B")
                        :quoting :mysql))))

  (testing "`identifier` shouldn't try to change `lisp-case` to `snake-case` or vice-versa"
    (is (= ["A-B.c-d.D_E.f_g"]
           (hsql/format (h1x/identifier :field "A-B" :c-d "D_E" :f_g))))

    (is (= ["\"A-B\".\"c-d\".\"D_E\".\"f_g\""]
           (hsql/format (h1x/identifier :field "A-B" :c-d "D_E" :f_g)
                        :quoting :ansi))))

  (testing "`identifier` should ignore `nil` or empty components."
    (is (= ["A.B.C"]
           (hsql/format (h1x/identifier :field "A" "B" nil "C")))))

  (testing "`identifier` should handle nested identifiers"
    (is (= (h1x/identifier :field "A" "B" "C" "D")
           (h1x/identifier :field "A" (h1x/identifier :field "B" "C") "D")))

    (is (= ["A.B.C.D"]
           (hsql/format (h1x/identifier :field "A" (h1x/identifier :field "B" "C") "D")))))

  (testing "the `identifier` function should unnest identifiers for you so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["A" "B" "C" "D"])
           (h1x/identifier :field "A" (h1x/identifier :field "B" "C") "D"))))

  (testing "the `identifier` function should remove nils so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["table" "field"])
           (h1x/identifier :field nil "table" "field"))))

  (testing "the `identifier` function should convert everything to strings so drivers that manipulate `:components` don't need to worry about that"
    (is (= (Identifier. :field ["keyword" "qualified/keyword"])
           (h1x/identifier :field :keyword :qualified/keyword)))))

(deftest h2-quoting-test
  (testing (str "We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using "
                "Java's toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language "
                "like Turkish, it can turn an i into an İ. This test converts a keyword with an `i` in it to verify "
                "that we convert the identifier correctly using the english locale even when the user has changed the "
                "locale to Turkish")
    (mt/with-locale "tr"
      (is (= ["\"SETTING\""]
             (hformat/format :setting :quoting :h2))))))

(deftest ^:parallel ratios-test
  (testing (str "test ToSql behavior for Ratios (#9246). Should convert to a double rather than leaving it as a "
                "division operation. The double itself should get converted to a numeric literal")
    (is (= ["SELECT 0.1 AS one_tenth"]
           (hsql/format {:select [[(/ 1 10) :one_tenth]]})))))

(defn- ->sql [expr]
  (hsql/format {:select [expr]}))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel maybe-cast-test
  (testing "maybe-cast should only cast things that need to be cast"
    (letfn [(maybe-cast [expr]
              (->sql (h1x/maybe-cast "text" expr)))]
      (is (= ["SELECT CAST(field AS text)"]
             (maybe-cast :field)))
      (testing "cast should return a typed form"
        (is (= ["SELECT CAST(field AS text)"]
               (maybe-cast (h1x/cast "text" :field)))))
      (testing "should not cast something that's already typed"
        (let [typed-expr (h1x/with-type-info :field {::hx/database-type "text"})]
          (is (= ["SELECT field"]
                 (maybe-cast typed-expr)))
          (testing "should work with different string/keyword and case combos"
            (is (= typed-expr
                   (h1x/maybe-cast :text typed-expr)
                   (h1x/maybe-cast "TEXT" typed-expr)
                   (h1x/maybe-cast :TEXT typed-expr)))))
        (testing "multiple calls to maybe-cast should only cast at most once"
          (is (= (h1x/maybe-cast "text" :field)
                 (h1x/maybe-cast "text" (h1x/maybe-cast "text" :field))))
          (is (= ["SELECT CAST(field AS text)"]
                 (maybe-cast (h1x/maybe-cast "text" :field)))))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel cast-unless-type-in-test
  (letfn [(cast-unless-type-in [expr]
            (first (->sql (h1x/cast-unless-type-in "timestamp" #{"timestamp" "timestamptz"} expr))))]
    (is (= "SELECT field"
           (cast-unless-type-in (h1x/with-type-info :field {::hx/database-type "timestamp"}))))
    (is (= "SELECT field"
           (cast-unless-type-in (h1x/with-type-info :field {::hx/database-type "timestamptz"}))))
    (is (= "SELECT CAST(field AS timestamp)"
           (cast-unless-type-in (h1x/with-type-info :field {::hx/database-type "date"}))))))

(def ^:private typed-form (h1x/with-type-info :field {::hx/database-type "text"}))

(deftest ^:parallel TypedHoneySQLForm-test
  (testing "should generate readable output"
    (is (= (pr-str `(h1x/with-type-info :field {::hx/database-type "text"}))
           (pr-str typed-form)))))

(deftest ^:parallel type-info-test
  (testing "should let you get info"
    (is (= {::hx/database-type "text"}
           (h1x/type-info typed-form)))
    (is (= nil
           (h1x/type-info :field)
           (h1x/type-info nil)))))

(deftest ^:parallel with-type-info-test
  (testing "should let you update info"
    (is (= (h1x/with-type-info :field {::hx/database-type "date"})
           (h1x/with-type-info typed-form {::hx/database-type "date"})))
    (testing "should normalize :database-type"
      (is (= (h1x/with-type-info :field {::hx/database-type "date"})
             (h1x/with-type-info typed-form {::hx/database-type "date"}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel with-database-type-info-test
  (testing "should be the same as calling `with-type-info` with `::hx/database-type`"
    (is (= (h1x/with-type-info :field {::hx/database-type "date"})
           (h1x/with-database-type-info :field "date"))))
  (testing "Passing `nil` should"
    (testing "return untyped clause as-is"
      (is (= :field
             (h1x/with-database-type-info :field nil))))
    (testing "unwrap a typed clause"
      (is (= :field
             (h1x/with-database-type-info (h1x/with-database-type-info :field "date") nil))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel is-of-type?-test
  (are [expr tyype expected] (= expected (h1x/is-of-type? expr tyype))
    typed-form     "text"   true
    typed-form     "TEXT"   true
    typed-form     :text    true
    typed-form     :TEXT    true
    typed-form     :te/xt   false
    typed-form     "date"   false
    typed-form     nil      false
    typed-form     #"tex.*" true
    nil            #"tex.*" false
    typed-form     #"int*"  false
    nil            "date"   false
    :%current_date "date"   false
    ;; I guess this behavior makes sense? I guess untyped = "is of type nil"
    nil            nil    true
    :%current_date nil    true))

(deftest ^:parallel unwrap-typed-honeysql-form-test
  (testing "should be able to unwrap"
    (is (= :field
           (h1x/unwrap-typed-honeysql-form typed-form)
           (h1x/unwrap-typed-honeysql-form :field)))
    (is (= nil
           (h1x/unwrap-typed-honeysql-form nil)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(deftest ^:parallel math-operators-propagate-type-info-test
  (testing "Math operators like `+` should propagate the type info of their args\n"
    ;; just pass along type info of the first arg with type info.
    (doseq [f [#'h1x/+ #'h1x/- #'h1x/* #'h1x// #'h1x/mod]
            x [(h1x/with-database-type-info 1 "int") 1]
            y [(h1x/with-database-type-info 2 "INT") 2]]
      (testing (str (pr-str (list f x y)) \newline)
        (let [expr (f x y)]
          (testing (pr-str expr)
            (is (= (if (some h1x/type-info [x y])
                     "int"
                     nil)
                   (h1x/type-info->db-type (h1x/type-info expr))))))))))
