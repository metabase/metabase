(ns metabase.util.honey-sql-2-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]))

(deftest ^:parallel inline-Ratio-test
  (testing ":inline behavior for clojure.lang.Ratio should make sense (#28354)"
    (is (= ["SELECT 4 / (1.0 / 3.0) AS x"]
           (sql/format {:select [[[:/
                                   [:inline 4]
                                   [:inline (/ 1 3)]]
                                  :x]]})))))

(deftest ^:parallel custom-functions-test
  (testing `::h2x/extract
    (is (= ["extract(a from b)"]
           (sql/format-expr [::h2x/extract :a :b]))))
  (testing `::h2x/distinct-count
    (is (= ["count(distinct x)"]
           (sql/format-expr [::h2x/distinct-count :x]))))
  (testing `::h2x/percentile-cont
    (is (= ["PERCENTILE_CONT(0.9) within group (order by a)"]
           (sql/format-expr [::h2x/percentile-cont :a 0.9]))))
  (testing `::h2x/at-time-zone
    (is (= ["(a AT TIME ZONE 'US/Pacific')"]
           (sql/format-expr [::h2x/at-time-zone :a "US/Pacific"])))))

(deftest ^:parallel format-test
  (testing "Basic format test not including a specific quoting option"
    (is (= ["SELECT setting"]
           (sql/format {:select [[:setting]]} {:quoted false}))))

  (testing "`:h2` quoting will uppercase and quote the identifier"
    (is (= ["SELECT \"SETTING\""]
           (sql/format {:select [[:setting]]} {:dialect :h2})))))

(deftest ^:parallel literal-test
  (testing "`literal` should be compiled to a single-quoted literal"
    (is (= ["WHERE name = 'Cam'"]
           (sql/format {:where [:= :name (h2x/literal "Cam")]}
                       {:quoted false}))))

  (testing (str "`literal` should properly escape single-quotes inside the literal string double-single-quotes is how "
                "to escape them in SQL")
    (is (= ["WHERE name = 'Cam''s'"]
           (sql/format {:where [:= :name (h2x/literal "Cam's")]}
                       {:quoted false}))))

  (testing "`literal` should only escape single quotes that aren't already escaped -- with two single quotes..."
    (is (= ["WHERE name = 'Cam''s'"]
           (sql/format {:where [:= :name (h2x/literal "Cam''s")]}
                       {:quoted false}))))

  (testing "...or with a slash"
    (is (= ["WHERE name = 'Cam\\'s'"]
           (sql/format {:where [:= :name (h2x/literal "Cam\\'s")]}
                       {:quoted false}))))

  (testing "`literal` should escape strings that start with a single quote"
    (is (= ["WHERE name = '''s'"]
           (sql/format {:where [:= :name (h2x/literal "'s")]}
                       {:quoted false}))))

  (testing "`literal` should handle namespaced keywords correctly"
    (is (= ["WHERE name = 'ab/c'"]
           (sql/format {:where [:= :name (h2x/literal :ab/c)]}
                       {:quoted false})))))

(deftest ^:parallel identifier-test
  (testing "make sure `identifier` properly handles components with dots and both strings & keywords"
    (is (= ["SELECT `A`.`B`.`C.D`.`E.F`"]
           (sql/format {:select [[(h2x/identifier :field "A" :B "C.D" :E.F)]]}
                       {:dialect :mysql}))))

  (testing "`identifer` should handle slashes"
    (is (= ["SELECT `A/B`.`C\\D`.`E/F`"]
           (sql/format {:select [[(h2x/identifier :field "A/B" "C\\D" :E/F)]]}
                       {:dialect :mysql}))))

  (testing "`identifier` should also handle strings with quotes in them (ANSI)"
    ;; two double-quotes to escape, e.g. "A""B"
    (is (= ["SELECT \"A\"\"B\""]
           (sql/format {:select [[(h2x/identifier :field "A\"B")]]}
                       {:dialect :ansi}))))

  (testing "`identifier` should also handle strings with quotes in them (MySQL)"
    ;; double-backticks to escape backticks seems to be the way to do it
    (is (= ["SELECT `A``B`"]
           (sql/format {:select [[(h2x/identifier :field "A`B")]]}
                       {:dialect :mysql}))))

  (testing "`identifier` shouldn't try to change `lisp-case` to `snake-case` or vice-versa"
    (is (= ["SELECT \"A-B\".\"c-d\".\"D_E\".\"f_g\""]
           (sql/format {:select [[(h2x/identifier :field "A-B" :c-d "D_E" :f_g)]]}
                       {:dialect :ansi}))))

  (testing "`identifier` should ignore `nil` or empty components."
    (is (= ["SELECT \"A\".\"B\".\"C\""]
           (sql/format {:select [[(h2x/identifier :field "A" "B" nil "C")]]}
                       {:dialect :ansi}))))

  (testing "`identifier` should handle nested identifiers"
    (is (= (h2x/identifier :field "A" "B" "C" "D")
           (h2x/identifier :field "A" (h2x/identifier :field "B" "C") "D")))

    (is (= ["SELECT \"A\".\"B\".\"C\".\"D\""]
           (sql/format {:select [[(h2x/identifier :field "A" (h2x/identifier :field "B" "C") "D")]]}
                       {:dialect :ansi}))))

  (testing "the `identifier` function should unnest identifiers for you so drivers that manipulate `:components` don't need to worry about that"
    (is (= (h2x/identifier :field "A" "B" "C" "D")
           (h2x/identifier :field "A" (h2x/identifier :field "B" "C") "D"))))

  (testing "the `identifier` function should remove nils so drivers that manipulate `:components` don't need to worry about that"
    (is (= (h2x/identifier :field "table" "field")
           (h2x/identifier :field nil "table" "field"))))

  (testing "the `identifier` function should convert everything to strings so drivers that manipulate `:components` don't need to worry about that"
    (is (= (h2x/identifier :field "keyword" "qualified/keyword")
           (h2x/identifier :field :keyword :qualified/keyword))))

  (testing "Should get formatted correctly inside aliases"
    ;; Apparently you have to wrap the alias form in ANOTHER vector to make it work -- see
    ;; https://clojurians.slack.com/archives/C1Q164V29/p1675301408026759
    (is (= ["SELECT \"A\".\"B\" AS \"C\""]
           (sql/format {:select [[(h2x/identifier :field "A" "B") [(h2x/identifier :field-alias "C")]]]}
                       {:dialect :ansi})))))

(deftest h2-quoting-test
  (testing (str "We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using "
                "Java's toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language "
                "like Turkish, it can turn an i into an İ. This test converts a keyword with an `i` in it to verify "
                "that we convert the identifier correctly using the english locale even when the user has changed the "
                "locale to Turkish")
    (mt/with-locale "tr"
      (is (= ["SELECT \"SETTING\""]
             (sql/format {:select [:setting]} {:dialect :h2}))))))

(deftest ^:parallel ratios-test
  (testing (str "test behavior for Ratios (#9246). In Honey SQL 1, we converted this to a double in the query itself. "
                "As far as I know, there is no way to do that in Honey SQL 2. So instead we convert it to a double
                in [[metabase.db.jdbc-protocols]]. "
                "division operation. The double itself should get converted to a numeric literal")
    (is (= [{:one_tenth (case (mdb.connection/db-type)
                          (:h2 :postgres) 0.1
                          :mysql          0.1M)}]
           (mdb.query/query {:select [[(/ 1 10) :one_tenth]]})))))

(deftest ^:parallel quoted-cast-test
  (is (= ["SELECT CAST(? AS \"bird type\")" "toucan"]
         (sql/format {:select [[(h2x/quoted-cast "bird type" "toucan")]]} {:quoted true, :dialect :ansi}))))

(defn- ->sql [expr]
  (sql/format {:select [[expr]]} {:quoted false}))

(deftest ^:parallel maybe-cast-test
  (testing "maybe-cast should only cast things that need to be cast"
    (letfn [(maybe-cast [expr]
              (->sql (h2x/maybe-cast "text" expr)))]
      (is (= ["SELECT CAST(field AS text)"]
             (maybe-cast :field)))
      (testing "cast should return a typed form"
        (is (= ["SELECT CAST(field AS text)"]
               (maybe-cast (h2x/cast "text" :field)))))
      (testing "should not cast something that's already typed"
        (let [typed-expr (h2x/with-type-info :field {:database-type "text"})]
          (is (= ["SELECT field"]
                 (maybe-cast typed-expr)))
          (testing "should work with different string/keyword and case combos"
            (is (= typed-expr
                   (h2x/maybe-cast :text typed-expr)
                   (h2x/maybe-cast "TEXT" typed-expr)
                   (h2x/maybe-cast :TEXT typed-expr)))))
        (testing "multiple calls to maybe-cast should only cast at most once"
          (is (= (h2x/maybe-cast "text" :field)
                 (h2x/maybe-cast "text" (h2x/maybe-cast "text" :field))))
          (is (= ["SELECT CAST(field AS text)"]
                 (maybe-cast (h2x/maybe-cast "text" :field)))))))))

(deftest ^:parallel cast-unless-type-in-test
  (letfn [(cast-unless-type-in [expr]
            (first (->sql (h2x/cast-unless-type-in "timestamp" #{"timestamp" "timestamptz"} expr))))]
    (is (= "SELECT field"
           (cast-unless-type-in (h2x/with-type-info :field {:database-type "timestamp"}))))
    (is (= "SELECT field"
           (cast-unless-type-in (h2x/with-type-info :field {:database-type "timestamptz"}))))
    (is (= "SELECT CAST(field AS timestamp)"
           (cast-unless-type-in (h2x/with-type-info :field {:database-type "date"}))))))

(def ^:private typed-form (h2x/with-type-info :field {:database-type "text"}))

(deftest ^:parallel type-info-test
  (testing "should let you get info"
    (is (= {:database-type "text"}
           (h2x/type-info typed-form)))
    (is (= nil
           (h2x/type-info :field)
           (h2x/type-info nil)))))

(deftest ^:parallel with-type-info-test
  (testing "should let you update info"
    (is (= (h2x/with-type-info :field {:database-type "date"})
           (h2x/with-type-info typed-form {:database-type "date"})))
    (testing "should normalize :database-type"
      (is (= (h2x/with-type-info :field {:database-type "date"})
             (h2x/with-type-info typed-form {:database-type "date"})))))
  (testing "Should compile with parentheses if the form it wraps would have been compiled with parens"
    (is (= ["(x - 1) + 2"]
           (sql/format-expr [:+
                             [:- :x [:inline 1]]
                             [:inline 2]])
           (sql/format-expr [:+
                             (h2x/with-database-type-info [:- :x [:inline 1]] "integer")
                             [:inline 2]])))))

(deftest ^:parallel with-database-type-info-test
  (testing "should be the same as calling `with-type-info` with `:database-type`"
    (is (= (h2x/with-type-info :field {:database-type "date"})
           (h2x/with-database-type-info :field "date"))))
  (testing "Passing `nil` should"
    (testing "return untyped clause as-is"
      (is (= :field
             (h2x/with-database-type-info :field nil))))
    (testing "unwrap a typed clause"
      (is (= :field
             (h2x/with-database-type-info (h2x/with-database-type-info :field "date") nil))))))

(deftest ^:parallel is-of-type?-test
  (are [expr tyype expected] (= expected (h2x/is-of-type? expr tyype))
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
           (h2x/unwrap-typed-honeysql-form typed-form)
           (h2x/unwrap-typed-honeysql-form :field)))
    (is (= nil
           (h2x/unwrap-typed-honeysql-form nil)))))

(deftest ^:parallel math-operators-propagate-type-info-test
  (testing "Math operators like `+` should propagate the type info of their args\n"
    ;; just pass along type info of the first arg with type info.
    (doseq [f [#'h2x/+ #'h2x/- #'h2x/* #'h2x// #'h2x/mod]
            x [(h2x/with-database-type-info 1 "int") 1]
            y [(h2x/with-database-type-info 2 "INT") 2]]
      (testing (str (pr-str (list f x y)) \newline)
        (let [expr (f x y)]
          (testing (pr-str expr)
            (is (= (if (some h2x/type-info [x y])
                     "int"
                     nil)
                   (h2x/type-info->db-type (h2x/type-info expr))))))))))

(deftest ^:parallel identifier->name-test
  (is (= ["public" "db" "table" "field"]
         (h2x/identifier->components
          (h2x/identifier :field :public :db :table :field))))

  (is (= ["public" "db" "table"]
         (h2x/identifier->components
          (h2x/identifier :table :public :db :table))))

  (is (= ["public" "db"]
         (h2x/identifier->components
          (h2x/identifier :database :public :db))))

  (is (=  ["count"]
         (h2x/identifier->components
          (h2x/identifier :field-alias :count)))))
