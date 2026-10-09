(ns metabase.funnysql.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [is are deftest testing]]
   [metabase.funnysql.core :as funnysql]
   [metabase.util.honey-sql-2 :as h2x]))

(deftest ^:parallel interpose-fn-test
  (letfn [(interpose-fn* [xs]
            (let [result (atom [])]
              (#'funnysql/interpose-fn
               xs
               (fn [x]
                 (swap! result conj x))
               (fn []
                 (swap! result conj "-")))
              @result))]
    (are [xs expected] (= expected
                          (interpose-fn* xs))
      nil        []
      []         []
      [:a]       [:a]
      [:a :b]    [:a "-" :b]
      [:a :b :c] [:a "-" :b "-" :c])
    (testing "anything other than nil or a collection is a bug"
      (is (thrown? AssertionError (interpose-fn* :a))))))

(deftest ^:parallel sequences-test
  (testing "Support compiling different types of sequences"
    (are [xs] (= ["SELECT (1, 2) AS \"ONE\""]
                 (funnysql/format {:select [[xs :one]]} :h2))
      [1 2]
      (list 1 2)
      (lazy-seq [1 2])
      #{1 2})))

(deftest ^:parallel equals-test
  (are [value expected] (= expected
                           (funnysql/format {:where [:= :field value]} :postgres))
    "x"         ["WHERE \"field\" = ?" "x"]
    nil         ["WHERE \"field\" IS NULL"]
    ;; booleans and numbers can be inlined
    true        ["WHERE \"field\" = true"]
    1           ["WHERE \"field\" = 1"]
    [:= :y nil] ["WHERE \"field\" = (\"y\" IS NULL)"])
  (is (= ["WHERE (\"x\" IS NULL) = \"y\""]
         (funnysql/format {:where [:= [:= :x nil] :y]} :postgres))))

(deftest ^:parallel equals-with-more-than-two-args-test
  (testing "throw if := or :!= have more than two args"
    (are [op] (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"\QWrong number of args to :=/:!=/:<>/:not= (expected 2 args)\E"
               (funnysql/format [op 1 2 3] :postgres))
      := :!= :not= :<>)))

(deftest ^:parallel nil-on-the-left-test
  (testing "`nil` on the LHS has to become `IS [NOT] NULL` too -- `NULL = x` is always NULL, so it matches no rows"
    (are [clause expected] (= [expected]
                              (funnysql/format {:where clause} :postgres))
      [:=    nil :field] "WHERE \"field\" IS NULL"
      [:<>   nil :field] "WHERE \"field\" IS NOT NULL"
      [:!=   nil :field] "WHERE \"field\" IS NOT NULL"
      [:not= nil :field] "WHERE \"field\" IS NOT NULL"))
  (testing "a bare predicate moved to the left of `IS NULL` still gets parenthesized, since `a AND b IS NULL` would
            otherwise parse as `a AND (b IS NULL)`"
    (is (= ["WHERE ((\"a\" = 1) AND (\"b\" = 2)) IS NULL"]
           (funnysql/format {:where [:= nil [:and [:= :a 1] [:= :b 2]]]} :postgres))))
  (testing "a self-delimiting LHS like a function call does not need the parens"
    (is (= ["WHERE lower(\"field\") IS NULL"]
           (funnysql/format {:where [:= nil [:lower :field]]} :postgres))))
  (testing "`nil` on both sides keeps a literal NULL"
    (is (= ["WHERE NULL IS NULL"]
           (funnysql/format {:where [:= nil nil]} :postgres)))
    (is (= ["WHERE NULL IS NOT NULL"]
           (funnysql/format {:where [:not= nil nil]} :postgres)))))

(deftest ^:parallel is-null-semantics-test
  (testing "[:is-not nil true] and [:is nil false] should compile correctly"
    (are [x expected] (= [expected]
                         (funnysql/format x :postgres))
      [:is nil true]      "NULL IS true"
      [:is nil false]     "NULL IS false"
      [:is-not nil true]  "NULL IS NOT true"
      [:is-not nil false] "NULL IS NOT false"
      [:is :x true]       "\"x\" IS true"
      [:is :x false]      "\"x\" IS false"
      [:is-not :x true]   "\"x\" IS NOT true"
      [:is-not :x false]  "\"x\" IS NOT false"
      ;; these seem wacky especially compared to what we do for `:=` and friends with LHS `nil` but this is how Honey
      ;; SQL handles this situation
      [:is nil :x]        "NULL IS \"x\""
      [:is-not nil :x]    "NULL IS NOT \"x\"")))

(deftest ^:parallel ratio-test
  (testing "a Ratio is bound as a parameter (set as a double by metabase.app-db.jdbc-protocols) rather than spliced as an exact NUMERIC literal (#9246)"
    (let [ratio (/ 1 10)]
      (is (instance? clojure.lang.Ratio ratio))
      (is (= ["SELECT ? AS \"one_tenth\"" ratio]
             (funnysql/format {:select [[ratio :one_tenth]]} :postgres))))))

(deftest ^:parallel non-integral-numbers-are-bound-test
  (testing (str "a non-integral number is bound rather than spliced: Postgres and H2 read a decimal literal back as a "
                "BigDecimal, and a Float spliced as `0.1` is not the value it holds (#9246)")
    (are [n] (= ["SELECT ? AS \"x\"" n]
                (funnysql/format {:select [[n :x]]} :postgres))
      0.5
      -0.5
      (float 0.1)
      0.1M
      1.0E+20M
      (/ 1 2))
    (testing "including where one is negated"
      (is (= ["?" -0.5]
             (funnysql/format [:- 0.5] :postgres))))))

(deftest ^:parallel integers-are-spliced-test
  (testing "every integer type is spliced, including the ones whose rendering the number regex has to accept"
    (are [n expected] (= [(str "WHERE \"field\" = " expected)]
                         (funnysql/format {:where [:= :field n]} :postgres))
      1                                   "1"
      -5                                  "-5"
      (int 7)                             "7"
      (short 7)                           "7"
      (byte -7)                           "-7"
      12345678901234567890N               "12345678901234567890"
      (biginteger -12345678901234567890N) "-12345678901234567890")))

(deftest ^:parallel inline-number-test
  (testing "`[:inline n]` splices any finite number, the non-integral ones that would otherwise be bound included"
    (are [n expected] (= [expected]
                         (funnysql/format [:inline n] :postgres))
      1         "1"
      -1        "-1"
      0.5       "0.5"
      -1.5      "-1.5"
      1.0E20    "1.0E20"
      1.0E-7    "1.0E-7"
      1.0E+20M  "1.0E+20"
      -1.25M    "-1.25"
      (/ 1 2)   "0.5"
      (float 2) "2.0"))
  (testing "a sequence of numbers is spliced element by element"
    (is (= ["(0.5, -1, 1.0E+20, true)"]
           (funnysql/format [:inline [0.5 -1 1.0E+20M true]] :postgres)))
    (is (= ["WHERE \"field\" IN (0.5, 1.5)"]
           (funnysql/format {:where [:in :field [:inline [0.5 1.5]]]} :postgres)))))

(deftest ^:parallel number-rejects-non-numeric-rendering-test
  (testing "splicing a Number must fail closed instead of splicing whatever `(str n)` happens to produce"
    (let [evil (proxy [Number] []
                 (toString [] "1); DROP TABLE users; --")
                 (intValue [] (int 1))
                 (longValue [] (long 1))
                 (floatValue [] (float 1))
                 (doubleValue [] (double 1)))]
      (testing "a hostile Number implementation's toString is not guaranteed to be numeric SQL syntax"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid number"
             (funnysql/format [:inline evil] :postgres))))
      (testing "an unknown Number type isn't an integer, so in a value position it is bound and its toString never reaches the SQL"
        (is (= ["WHERE \"field\" = ?" evil]
               (funnysql/format {:where [:= :field evil]} :postgres)))))
    (testing "Double's non-finite values don't render as valid numeric SQL literals either"
      (are [n] (thrown-with-msg?
                clojure.lang.ExceptionInfo
                #"Invalid number"
                (funnysql/format [:inline n] :postgres))
        Double/NaN
        Double/POSITIVE_INFINITY
        Double/NEGATIVE_INFINITY))))

(deftest ^:parallel not-equals-test
  (are [op expected] (= expected
                        (funnysql/format {:where [op :field "x"]} :postgres))
    :<>   ["WHERE \"field\" <> ?" "x"]
    :!=   ["WHERE \"field\" <> ?" "x"]
    :not= ["WHERE \"field\" <> ?" "x"])
  (testing "NOT NULL"
    (are [op expected] (= expected
                          (funnysql/format {:where [op :field nil]} :postgres))
      :<>   ["WHERE \"field\" IS NOT NULL"]
      :!=   ["WHERE \"field\" IS NOT NULL"]
      :not= ["WHERE \"field\" IS NOT NULL"]))
  (is (= ["WHERE (\"x\" IS NOT NULL) = \"y\""]
         (funnysql/format {:where [:= [:not= :x nil] :y]} :postgres)))
  (is (= ["WHERE \"x\" = (\"y\" IS NOT NULL)"]
         (funnysql/format {:where [:= :x [:not= :y nil]]} :postgres))))

(deftest ^:parallel and-or-test
  (are [op sql] (= [(str "WHERE (\"field\" = ?) " sql " (\"other_field\" = ?)") "x" "y"]
                   (funnysql/format {:where [op [:= :field "x"] [:= :other_field "y"]]} :postgres))
    :and "AND"
    :or  "OR"))

(deftest ^:parallel comparison-test
  (are [op sql] (= [(str "WHERE \"field\" " sql " ?") "s"]
                   (funnysql/format {:where [op :field "s"]} :postgres))
    :<  "<"
    :<= "<="
    :>  ">"
    :>= ">="))

(deftest ^:parallel in-test
  (is (= ["WHERE \"table\".\"field\" IN (1, 2, 3)"]
         (funnysql/format {:where [:in :table.field [1 2 3]]} :postgres)))
  (is (= ["WHERE \"table\".\"field\" IN (3)"]
         (funnysql/format {:where [:in :table.field [[:inline 3]]]} :postgres)
         (funnysql/format {:where [:in :table.field [:inline [3]]]} :postgres)))
  (testing "multiple sequences (used in combination with `:composite`)"
    (is (= ["WHERE \"table\".\"field\" IN ((1, 2, 3), (4, 5, 6))"]
           (funnysql/format {:where [:in :table.field [[1 2 3] [4 5 6]]]} :postgres)))))

(deftest ^:parallel not-in-test
  (is (= ["WHERE \"table\".\"field\" NOT IN (1, 2)"]
         (funnysql/format {:where [:not-in :table.field [1 2]]} :postgres))))

(deftest ^:parallel like-test
  (are [op sql] (= [(str "WHERE \"field\" " sql " ?") "%x%"]
                   (funnysql/format {:where [op :field "%x%"]} :postgres))
    :like     "LIKE"
    :not-like "NOT LIKE"))

(deftest ^:parallel not-test
  (is (= ["WHERE NOT (\"field\" = 1)"]
         (funnysql/format {:where [:not [:= :field 1]]} :postgres))))

(deftest ^:parallel is-test
  (are [op sql] (= [(str "WHERE \"field\" " sql)]
                   (funnysql/format {:where [op :field nil]} :postgres))
    :is     "IS NULL"
    :is-not "IS NOT NULL"))

(deftest ^:parallel and-ignore-nils-test
  (is (= ["SELECT * FROM \"metabase_table\" WHERE (\"schema\" IN (?)) AND (\"db_id\" = 429)" "PUBLIC"]
         (funnysql/format {:select [:*]
                           :from   [:metabase_table]
                           :where  [:and
                                    [:in :schema ["PUBLIC"]]
                                    nil
                                    [:= :db_id 429]]}
                          :postgres))))

(deftest ^:parallel between-test
  (is (= ["WHERE \"field\" BETWEEN 1 AND 10"]
         (funnysql/format {:where [:between :field 1 10]} :postgres))))

(deftest ^:parallel exists-test
  (are [op sql] (= [(str "WHERE " sql " (SELECT 1 FROM \"table\")")]
                   (funnysql/format {:where [op ^:allow-subquery {:select [1] :from [:table]}]} :postgres))
    :exists     "EXISTS"
    :not-exists "NOT EXISTS"))

(deftest ^:parallel exists-unmarked-map-is-not-a-subquery-test
  (testing "an unmarked map under `:exists`/`:not-exists` is never compiled as a subquery"
    (are [op expected] (= [expected {:from [:table], :select [1]}]
                          (funnysql/format {:where [op {:from [:table], :select [1]}]} :postgres))
      :exists     "WHERE EXISTS ?"
      :not-exists "WHERE NOT EXISTS ?")))

(deftest ^:parallel cast-test
  (is (= ["WHERE CAST(\"field\" AS integer) = 1"]
         (funnysql/format {:where [:= [:cast :field :integer] 1]} :postgres)))
  (testing "type validation"
    (testing "valid types"
      (are [type-name] (some? (funnysql/format {:where [:= [:cast :field type-name] 1]} :postgres))
        :integer
        "integer"
        "timestamp"
        (keyword "timestamp(6)")
        "timestamp(6)"
        "datetime2"
        :datetime2))
    (testing "invalid types"
      (are [type-name] (thrown-with-msg?
                        clojure.lang.ExceptionInfo
                        #"Invalid type"
                        (funnysql/format {:where [:= [:cast :field type-name] 1]} :postgres))
        "X) OR SELECT * FROM another_table; --"
        (keyword "X) OR SELECT * FROM another_table; --")
        :2
        "2"))))

(deftest ^:parallel cast-type-name-dashes-test
  (testing "a keyword type name spells its spaces as dashes"
    (are [type-name expected] (= [(str "CAST(\"x\" AS " expected ")")]
                                 (funnysql/format [:cast :x type-name] :postgres))
      :timestamp-with-time-zone "timestamp with time zone"
      :double-precision         "double precision"
      [:character-varying 32]   "character varying(32)"))
  (testing "a string type name is used exactly as given, so a dash inside a quoted argument survives"
    (are [type-name] (= [(str "CAST(\"x\" AS " type-name ")")]
                        (funnysql/format [:cast :x type-name] :postgres)
                        (funnysql/format (h2x/cast type-name :x) :postgres))
      "DateTime64(3, 'America/Port-au-Prince')"
      "Nullable(DateTime64(3, 'America/Port-au-Prince'))")))

(deftest ^:parallel case-test
  (is (= ["WHERE \"field\" = CASE WHEN \"other\" > 1 THEN ? ELSE ? END" "big" "small"]
         (funnysql/format {:where [:= :field [:case [:> :other 1] "big" :else "small"]]} :postgres))))

(deftest ^:parallel lower-upper-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(?)") "X"]
                   (funnysql/format {:where [:= :field [op "X"]]} :postgres))
    :lower "lower"
    :upper "upper"))

(deftest ^:parallel concat-test
  (is (= ["WHERE \"field\" = concat(\"a\", \"b\")"]
         (funnysql/format {:where [:= :field [:concat :a :b]]} :postgres))))

(deftest ^:parallel coalesce-test
  (is (= ["WHERE \"field\" = coalesce(\"a\", 1)"]
         (funnysql/format {:where [:= :field [:coalesce :a 1]]} :postgres))))

(deftest ^:parallel aggregate-function-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(\"other\")")]
                   (funnysql/format {:where [:= :field [op :other]]} :postgres))
    :count    "count"
    :sum      "sum"
    :avg      "avg"
    :min      "min"
    :max      "max"
    :distinct "distinct"))

(deftest ^:parallel select-distinct-test
  (is (= ["SELECT DISTINCT \"field\", \"other_field\""]
         (funnysql/format {:select-distinct [:field :other_field]} :postgres))))

(deftest ^:parallel group-by-test
  (is (= ["GROUP BY \"field\", \"other_field\""]
         (funnysql/format {:group-by [:field :other_field]} :postgres))))

(deftest ^:parallel having-test
  (is (= ["HAVING count(\"field\") > 1"]
         (funnysql/format {:having [:> [:count :field] 1]} :postgres))))

(deftest ^:parallel order-by-test
  (are [order-by sql] (= [(str "ORDER BY " sql)]
                         (funnysql/format {:order-by order-by} :postgres))
    [:field]                             "\"field\" ASC"
    [[:field]]                           "\"field\" ASC"
    [[:field :asc]]                      "\"field\" ASC"
    [[:field] [:other_field :desc]]      "\"field\" ASC, \"other_field\" DESC"
    [[:field :desc]]                     "\"field\" DESC"
    [[:field] [:other_field :desc]]      "\"field\" ASC, \"other_field\" DESC"
    [[:field :asc] [:other_field :desc]] "\"field\" ASC, \"other_field\" DESC"))

(deftest ^:parallel order-by-invalid-direction-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Invalid order by direction"
       (funnysql/format {:order-by [[:field :sideways]]} :postgres))))

(deftest ^:parallel order-by-nulls-ordering-test
  (are [k expected] (= [(str "SELECT \"a\" FROM \"t\" ORDER BY \"a\" " expected)]
                       (funnysql/format {:select [:a], :from [:t], :order-by [[:a k]]} :postgres))
    :nulls-last       "NULLS LAST"
    :nulls-first      "NULLS FIRST"
    :asc-nulls-last   "ASC NULLS LAST"
    :desc-nulls-last  "DESC NULLS LAST"
    :asc-nulls-first  "ASC NULLS FIRST"
    :desc-nulls-first "DESC NULLS FIRST")
  (testing (str "Error on Honey SQL 1-style [<field> <direction> <nulls-behavior>] (Honey SQL 2 just silently ignores"
                " this 😢, but we can be nice)")
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\Q`:order-by` only supports [<expression> <direction>], but got more than 2 args\E"
         (funnysql/format {:select [:a], :from [:t], :order-by [[:a :asc :nulls-first]]} :postgres)))))

(deftest ^:parallel order-by-nulls-ordering-mysql-test
  (testing (str "MySQL and MariaDB don't support NULLS FIRST/NULLS LAST. They sort NULL first ascending and last "
                "descending, so sort on `IS NULL` first only when that isn't what we want")
    (are [k expected] (= [(str "SELECT `a` FROM `t` ORDER BY " expected)]
                         (funnysql/format {:select [:a], :from [:t], :order-by [[:a k]]} :mysql))
      :asc              "`a` ASC"
      :desc             "`a` DESC"
      :nulls-last       "(`a`) IS NULL ASC, `a` ASC"
      :nulls-first      "`a` ASC"
      :asc-nulls-last   "(`a`) IS NULL ASC, `a` ASC"
      :desc-nulls-last  "`a` DESC"
      :asc-nulls-first  "`a` ASC"
      :desc-nulls-first "(`a`) IS NULL DESC, `a` DESC"))
  (testing "the expression is emitted twice, so its parameters are bound twice"
    (is (= ["SELECT `a` FROM `t` ORDER BY (coalesce(`a`, ?)) IS NULL DESC, coalesce(`a`, ?) DESC" "x" "x"]
           (funnysql/format {:select [:a], :from [:t], :order-by [[[:coalesce :a "x"] :desc-nulls-first]]} :mysql)))))

(deftest ^:parallel limit-test
  (is (= ["LIMIT 10"]
         (funnysql/format {:limit 10} :postgres)))
  (testing "should validate limit"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid limit"
         (funnysql/format {:limit -10} :postgres)))))

(deftest ^:parallel offset-test
  (is (= ["OFFSET 5"]
         (funnysql/format {:offset 5} :postgres)))
  (testing "should validate offset"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid offset"
         (funnysql/format {:offset "s"} :postgres)))))

(deftest ^:parallel limit-offset-test
  (is (= ["LIMIT 10 OFFSET 5"]
         (funnysql/format {:limit 10, :offset 5} :postgres))))

(deftest ^:parallel join-test
  (are [clause sql] (= [(str sql " \"other\" ON \"a\".\"id\" = \"other\".\"a_id\"")]
                       (funnysql/format {clause [:other [:= :a.id :other.a_id]]} :postgres))
    :join       "JOIN"
    :left-join  "LEFT JOIN"
    :right-join "RIGHT JOIN"
    :inner-join "INNER JOIN"))

(deftest ^:parallel join-with-alias-test
  (is (= ["JOIN \"dashboard\" AS \"d\" ON \"d\".\"id\" = \"dc\".\"dashboard_id\""]
         (funnysql/format {:join [[:dashboard :d] [:= :d.id :dc.dashboard_id]]} :postgres))))

(deftest ^:parallel multiple-joins-test
  (is (= ["JOIN \"a\" ON \"a\".\"id\" = \"x\".\"a_id\" JOIN \"b\" ON \"b\".\"id\" = \"x\".\"b_id\""]
         (funnysql/format {:join [:a [:= :a.id :x.a_id]
                                  :b [:= :b.id :x.b_id]]} :postgres))))

(deftest ^:parallel join-subquery-test
  (testing "a subquery in a `:join` needs to be wrapped in parens, just like one in `:from`"
    (is (= [(str "SELECT \"f\".\"table_id\""
                 " FROM \"metabase_field\" AS \"f\""
                 " JOIN (SELECT \"id\", \"db_id\" FROM \"metabase_table\") AS \"t\" ON \"t\".\"id\" = \"f\".\"table_id\"")]
           (funnysql/format {:select [:f.table_id]
                             :from   [[:metabase_field :f]]
                             :join   [[^:allow-subquery {:select [:id :db_id]
                                                         :from   [:metabase_table]} :t]
                                      [:= :t.id :f.table_id]]}
                            :postgres)))))

(deftest ^:parallel join-missing-condition-test
  (testing "a join without a condition throws instead of compiling to `ON NULL`, which silently returns no rows"
    (are [joins] (thrown-with-msg?
                  clojure.lang.ExceptionInfo
                  #"Every join needs a condition"
                  (funnysql/format {:select [:*] :from [:a] :join joins} :postgres))
      [:b]
      [:b [:= :a.id :b.a_id] :c]))
  (testing "likewise a `nil` condition, which is what a `(when ...)` around one gives you"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"A join condition cannot be nil"
         (funnysql/format {:select [:*] :from [:a] :join [:b nil]} :postgres))))
  (testing "`false` is a condition like any other"
    (is (= ["SELECT * FROM \"a\" JOIN \"b\" ON false"]
           (funnysql/format {:select [:*] :from [:a] :join [:b false]} :postgres)))))

(deftest ^:parallel empty-join-test
  (testing "Handle `nil`/empty joins; we still spit out an extra space because of the way things work but that's ok I guess"
    (is (= ["SELECT 1 AS \"v\" "]
           (funnysql/format {:select [[1 :v]] :left-join nil} :postgres)))))

(deftest ^:parallel with-test
  (is (= ["WITH \"cte\" AS (SELECT \"id\" FROM \"table\"), \"cte2\" AS (SELECT * FROM \"cte\") SELECT \"id\" FROM \"cte\""]
         (funnysql/format {:with   [[:cte  ^:allow-subquery {:select [:id] :from [:table]}]
                                    [:cte2 ^:allow-subquery {:select [:*] :from [:cte]}]]
                           :select [:id]
                           :from   [:cte]} :postgres))))

(deftest ^:parallel with-not-marked-allow-subquery-test
  (is (= ["WITH \"cte\" AS (?), \"cte2\" AS (?) SELECT \"id\" FROM \"cte\""
          {:select [:id], :from [:table]}
          {:select [:*], :from [:cte]}]
         (funnysql/format {:with   [[:cte  {:select [:id] :from [:table]}]
                                    [:cte2 {:select [:*] :from [:cte]}]]
                           :select [:id]
                           :from   [:cte]} :postgres))))

(deftest ^:parallel with-recursive-test
  (is (= ["WITH RECURSIVE \"cte\" AS (SELECT \"id\" FROM \"table\") SELECT \"id\" FROM \"cte\""]
         (funnysql/format {:with-recursive [[:cte ^:allow-subquery {:select [:id] :from [:table]}]]
                           :select         [:id]
                           :from           [:cte]} :postgres))))

(deftest ^:parallel with-recursive-not-marked-allow-subquery-test
  (is (= ["WITH RECURSIVE \"cte\" AS (?) SELECT \"id\" FROM \"cte\"" {:select [:id], :from [:table]}]
         (funnysql/format {:with-recursive [[:cte {:select [:id] :from [:table]}]]
                           :select         [:id]
                           :from           [:cte]} :postgres))))

(deftest ^:parallel with-recursive-columns-test
  (is (= [(str "WITH RECURSIVE \"parents\" (\"id\", \"name\") AS (SELECT \"id\", \"name\" FROM \"metabase_field\")"
               " SELECT \"id\" FROM \"parents\"")]
         (funnysql/format {:with-recursive [[[:parents {:columns [:id :name]}]
                                             ^:allow-subquery {:select [:id :name]
                                                               :from   [:metabase_field]}]]
                           :select         [:id]
                           :from           [:parents]}
                          :postgres))))

(deftest ^:parallel non-vector-identifier-with-options-test
  (testing "as everywhere else, only a vector is `[<identifier> <options>]` -- any other sequence is not an identifier"
    (are [form] (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Expected an identifier"
                 (funnysql/format form :postgres))
      {:with   [[(list :cte {:columns [:a]}) ^:allow-subquery {:select [:a] :from [:t]}]]
       :select [:*]
       :from   [:cte]}
      {:insert-into (list :t [:a])
       :values      [[1]]})))

(deftest ^:parallel with-materialized-test
  (is (= ["WITH \"cte\" AS MATERIALIZED (SELECT \"id\" FROM \"t\") SELECT \"id\" FROM \"cte\""]
         (funnysql/format {:with   [[:cte ^:allow-subquery {:select [:id] :from [:t]} :materialized]]
                           :select [:id]
                           :from   [:cte]}
                          :postgres))))

(deftest ^:parallel union-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION SELECT \"id\" FROM \"b\""]
         (funnysql/format {:union [^:allow-subquery {:select [:id] :from [:a]}
                                   ^:allow-subquery {:select [:id] :from [:b]}]}
                          :postgres))))

(deftest ^:parallel union-not-marked-allow-subquery-test
  (is (= ["? UNION ?" {:select [:id], :from [:a]} {:select [:id], :from [:b]}]
         (funnysql/format {:union [{:select [:id] :from [:a]}
                                   {:select [:id] :from [:b]}]}
                          :postgres))))

(deftest ^:parallel union-all-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION ALL SELECT \"id\" FROM \"b\""]
         (funnysql/format {:union-all [^:allow-subquery {:select [:id] :from [:a]}
                                       ^:allow-subquery {:select [:id] :from [:b]}]} :postgres))))

(deftest ^:parallel union-all-not-marked-allow-subquery-test
  (is (= ["? UNION ALL ?" {:select [:id], :from [:a]} {:select [:id], :from [:b]}]
         (funnysql/format {:union-all [{:select [:id] :from [:a]}
                                       {:select [:id] :from [:b]}]}
                          :postgres))))

(deftest ^:parallel insert-into-values-test
  (are [table] (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?)" "x" "y"]
                  (funnysql/format {:insert-into table
                                    :values      [{:a "x" :b "y"}]}
                                   :postgres))
    :my_table
    [:my_table]
    [[:my_table]]))

(deftest ^:parallel insert-into-multiple-rows-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\", \"c\") VALUES (?, ?, NULL), (?, ?, ?)" "a1" "b1" "a2" "b2" "c2"]
         (funnysql/format {:insert-into :my_table
                           :values      [{:a "a1", :b "b1"} {:a "a2", :b "b2", :c "c2"}]}
                          :postgres))))

(deftest ^:parallel insert-into-columns-test
  (testing "`:columns` specified as separate top-level key"
    (is (= ["INSERT INTO \"permissions\" (\"object\", \"group_id\") VALUES (?, 1)" "/db/1/"]
           (funnysql/format {:insert-into :permissions
                             :columns     [:object :group_id]
                             :values      [["/db/1/" 1]]}
                            :postgres)))))

(deftest ^:parallel insert-from-table-with-columns-test
  (testing "columns specified in `:insert-into` itself"
    (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\", \"c\") VALUES (1, 2, 3), (4, 5, 6)"]
           (funnysql/format {:insert-into [:my_table [:a :b :c]]
                             :values      [[1 2 3] [4 5 6]]}
                            :postgres)))))

(deftest ^:parallel insert-from-select-test
  (testing "INSERT ... SELECT must not silently drop the column list and the SELECT"
    (is (= [(str "INSERT INTO \"permissions_group_membership\" (\"group_id\", \"user_id\", \"is_group_manager\")"
                 " SELECT \"g\".\"id\", \"u\".\"id\" FROM \"permissions_group\" AS \"g\""
                 " JOIN \"core_user\" AS \"u\" ON \"u\".\"id\" = 1")]
           (funnysql/format {:insert-into
                             [[:permissions_group_membership [:group_id :user_id :is_group_manager]]
                              ^:allow-subquery
                              {:select [:g.id :u.id]
                               :from   [[:permissions_group :g]]
                               :join   [[:core_user :u] [:= :u.id [:inline 1]]]}]}
                            :postgres)))))

(deftest ^:parallel insert-from-select-not-marked-allow-subquery-test
  (is (= ["INSERT INTO \"permissions_group_membership\" (\"group_id\", \"user_id\", \"is_group_manager\") ?"
          {:from [[:permissions_group :g]], :join [[:core_user :u] [:= :u.id [:inline 1]]], :select [:g.id :u.id]}]
         (funnysql/format {:insert-into
                           [[:permissions_group_membership [:group_id :user_id :is_group_manager]]
                            {:select [:g.id :u.id]
                             :from   [[:permissions_group :g]]
                             :join   [[:core_user :u] [:= :u.id [:inline 1]]]}]}
                          :postgres))))

(deftest ^:parallel degenerate-insert-test
  (testing "an INSERT with nothing to insert must fail closed rather than emit invalid SQL"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":values cannot have empty or nil rows"
         (funnysql/format {:insert-into :permissions, :values []} :postgres)))))

(deftest ^:parallel update-with-table-alias-test
  (is (= ["UPDATE \"table\" \"t\" SET \"t\".\"field\" = 1"]
         (funnysql/format {:update [:table :t], :set {:t.field 1}} :postgres))))

(deftest ^:parallel on-conflict-do-update-set-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?) ON CONFLICT (\"a\") DO UPDATE SET \"b\" = ?, \"c\" = ?" "x" "y" "z" "a"]
         (funnysql/format {:insert-into   :my_table
                           :values        [{:a "x" :b "y"}]
                           :on-conflict   [:a]
                           :do-update-set {:b "z", :c "a"}} :postgres))))

(deftest ^:parallel update-set-test
  (is (= ["UPDATE \"persisted_info\" SET \"state\" = ?, \"x\" = ? WHERE \"id\" = 1" "deletable" "y"]
         (funnysql/format {:update [:persisted_info]
                           :set    {:state "deletable", :x "y"}
                           :where  [:= :id 1]} :postgres))))

(deftest ^:parallel update-set-null-test
  (testing "UPDATE <table> SET <field> = NULL should compile correctly"
    (is (= ["UPDATE `setting` SET `value` = NULL WHERE `key` = ?" "query-caching-ttl-ratio"]
           (funnysql/format {:update [:setting]
                             :set    {:value nil}
                             :where  [:= :key "query-caching-ttl-ratio"]}
                            :mysql)))))

(deftest ^:parallel delete-from-test
  (is (= ["DELETE FROM \"card\" WHERE \"database_id\" = 1"]
         (funnysql/format {:delete-from :card
                           :where       [:= :database_id 1]} :postgres))))

(deftest ^:parallel delete-from-with-alias-test
  (is (= ["DELETE FROM \"card\" \"c\" WHERE \"c\".\"database_id\" = 1"]
         (funnysql/format {:delete-from [:card :c]
                           :where       [:= :c/database_id 1]} :postgres))))

(deftest ^:parallel returning-test
  (is (= ["DELETE FROM \"card\" WHERE \"database_id\" = 1 RETURNING \"id\", \"x\""]
         (funnysql/format {:delete-from :card
                           :where       [:= :database_id 1]
                           :returning   [:id :x]} :postgres))))

(deftest ^:parallel expected-identifier-test
  (testing "table/column-name positions must reject a value that isn't an identifier (a keyword or `h2x/identifier`
            form), instead of silently falling through to `object!`'s `?`-parameter handling and producing a
            confusing runtime error from the database instead of a clear one from the compiler"
    (testing "insert-into"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:insert-into "my_table"
                             :values      [{:a "x"}]} :postgres))))
    (testing "update"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:update ["persisted_info"]
                             :set    {:state "deletable"}} :postgres))))
    (testing "delete-from"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:delete-from 1}
                            :postgres))))
    (testing "values columns"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:insert-into :my_table
                             :values      [{"a" "x"}]} :postgres))))
    (testing "set"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:update [:persisted_info]
                             :set    {"state" "deletable"}} :postgres))))
    (testing "do-update-set"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:insert-into   :my_table
                             :values        [{:a "x"}]
                             :on-conflict   [:a]
                             :do-update-set {"b" "z"}} :postgres))))
    (testing "on-conflict"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:insert-into   :my_table
                             :values        [{:a "x"}]
                             :on-conflict   ["a"]
                             :do-update-set {:b "z"}} :postgres))))
    (testing "with (CTE name)"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Expected an identifier"
           (funnysql/format {:with   [["cte" {:select [:id] :from [:table]}]]
                             :select [:id]
                             :from   [:cte]} :postgres))))))

(deftest ^:parallel for-update-test
  (is (= ["SELECT \"id\" FROM \"revision\" WHERE \"model\" = ? FOR UPDATE" "Card"]
         (funnysql/format {:select [:id]
                           :from   [:revision]
                           :where  [:= :model "Card"]
                           :for    :update} :postgres))))

(deftest ^:parallel for-lock-options-test
  (are [engine expected] (= expected
                            (funnysql/format {:select [:id] :from [:t] :for [:update :skip-locked]} engine))
    :postgres ["SELECT \"id\" FROM \"t\" FOR UPDATE SKIP LOCKED"]
    :mysql    ["SELECT `id` FROM `t` FOR UPDATE SKIP LOCKED"]))

(deftest ^:parallel for-throws-on-unknown-options-test
  (testing "other `:for` options compile or throw; they are never dropped"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QError compiling Honey SQL: No matching clause: :nowait\E"
         (funnysql/format {:select [:id], :from [:t], :for [:update :nowait]} :postgres)))))

(deftest ^:parallel percent-keyword-niladic-function-test
  (are [k sql] (= [(str "WHERE \"field\" = " sql)]
                  (funnysql/format {:where [:= :field k]} :postgres))
    :%now              "now()"
    :%current_schema   "current_schema()"
    :%current_database "current_database()"
    :%database         "database()"))

(deftest ^:parallel percent-keyword-function-with-arg-test
  (are [k sql] (= [(str "WHERE \"field\" = " sql)]
                  (funnysql/format {:where [:= :field k]} :postgres))
    :%count.*                    "count(*)"
    :%count.id                   "count(\"id\")"
    :%lower.email                "lower(\"email\")"
    :%lower.name                 "lower(\"name\")"
    :%max.id                     "max(\"id\")"
    :%max.started_at             "max(\"started_at\")"
    :%min.date_joined            "min(\"date_joined\")"
    :%min.executor_id            "min(\"executor_id\")"
    :%avg.running_time           "avg(\"running_time\")"
    :%sum.total_tokens           "sum(\"total_tokens\")"
    :%isnull.last_edit_timestamp "isnull(\"last_edit_timestamp\")"))

(deftest ^:parallel percent-keyword-with-qualified-arg-test
  (testing "the `:%fn.arg` shorthand accepts a `/`-qualified argument, as Honey SQL does -- the keyword is a qualified
            keyword whose namespace starts with `%`, which must not be mistaken for an identifier"
    (are [k sql] (= [(str "WHERE " sql " = 1")]
                    (funnysql/format {:where [:= k 1]} :postgres))
      :%lower.metabase_field/name "lower(\"metabase_field\".\"name\")"
      :%lower.name                "lower(\"name\")"
      :%count.*                   "count(*)"
      :%now                       "now()"
      ;; a `.` separates arguments, so this is a two-argument call
      :%coalesce.a.b              "coalesce(\"a\", \"b\")")))

(deftest ^:parallel percent-keyword-rejects-unknown-function-test
  (testing "the `:%function` shorthand must not let an arbitrary, attacker-derived function name reach the SQL --
            an unrecognized name must be rejected, not passed through raw"
    (are [k] (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"Function :.* is not currently supported"
              (funnysql/format {:where [:= :field k]} :postgres))
      (keyword "%'; DROP TABLE users; --")
      (keyword "%count); DROP TABLE users; --"))))

(deftest ^:parallel e2e-test
  (is (= ["SELECT \"X\", \"Y\" AS \"ALIAS\" FROM \"TABLE\" WHERE (\"FIELD\" = 100) AND (\"FIELD\" < ?) AND (\"TABLE\".\"FIELD\" IN (1, 2, 3))"
          "s"]
         (funnysql/format {:select [:x [:y :alias]]
                           :from   [[:table]]
                           :where  [:and
                                    [:= :field 100]
                                    [:< :field "s"]
                                    [:in :table.field [1 2 3]]]}
                          :h2))))

(deftest ^:parallel star-keyword-test
  (are [k expected] (= [expected]
                       (funnysql/format {:select [k]} :postgres))
    :*       "SELECT *"
    :table.* "SELECT \"table\".*"
    :table/* "SELECT \"table\".*"))

(deftest ^:parallel h2x-identifier-test
  (is (= ["WHERE \"a\".\"b\" = 1"]
         (funnysql/format {:where [:= (h2x/identifier :field "a" "b") 1]} :postgres)))
  (testing "should strictly validate identifier parts; the app DB doesn't use crazy column names"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid identifier"
         (funnysql/format {:where [:= (h2x/identifier :field "a" "b\" UNION ALL another_table; --") 1]} :postgres)))))

(deftest ^:parallel h2x-literal-test
  (are [s expected] (= [expected]
                       (funnysql/format {:where [:= :field (h2x/literal s)]} :postgres))
    "foo"
    "WHERE \"field\" = 'foo'"

    ;; should escape single quotes
    "foo' OR 1 = 1; --"
    "WHERE \"field\" = 'foo'' OR 1 = 1; --'"))

(deftest ^:parallel h2x-literal-escaping-on-every-engine-test
  (testing "single quotes are doubled on every engine, whether the literal started out as a string or a keyword"
    (are [engine s expected] (= [expected]
                                (funnysql/format [::h2x/literal s] engine))
      :postgres "it's"                        "'it''s'"
      :h2       "it's"                        "'it''s'"
      :mysql    "it's"                        "'it''s'"
      :h2       "foo' OR 1 = 1; --"           "'foo'' OR 1 = 1; --'"
      :mysql    "foo' OR 1 = 1; --"           "'foo'' OR 1 = 1; --'"
      ;; `h2x/literal` takes a keyword too, and keeps its namespace
      :postgres (keyword "it's")              "'it''s'"
      :h2       (keyword "it's")              "'it''s'"
      :mysql    (keyword "it's")              "'it''s'"
      :postgres :provider/password            "'provider/password'"
      :h2       (keyword "a'b" "c'd")         "'a''b/c''d'"))
  (testing "`h2x/literal` builds the same form"
    (are [engine] (= ["'it''s'"]
                     (funnysql/format (h2x/literal (keyword "it's")) engine))
      :postgres :h2 :mysql)))

(deftest ^:parallel h2x-literal-backslash-injection-test
  (testing "on MySQL, backslashes must be escaped too, not just quotes"
    (testing "MySQL reads `\\'` inside a string literal as an escaped quote, not the end of the string (unless
              NO_BACKSLASH_ESCAPES is set) -- a trailing backslash right before the closing quote lets the
              doubled quote that follows become the *real* terminator, and everything after it becomes raw SQL
              instead of part of the literal"
      (is (= ["WHERE `field` = 'foo\\\\'' OR 1=1; --'"]
             (funnysql/format {:where [:= :field (h2x/literal "foo\\' OR 1=1; --")]} :mysql))))))

(deftest ^:parallel h2x-literal-does-not-mangle-backslash-on-ansi-engines-test
  (testing "on Postgres and H2, a backslash is an ordinary character inside a plain '...' literal (as long as
            standard_conforming_strings is on, the default) -- doubling it there would corrupt a value that
            legitimately contains one, instead of protecting anything, since there's no backslash/quote
            interaction to guard against on these engines"
    (are [engine expected] (= [expected]
                              (funnysql/format {:where [:= :field (h2x/literal "C:\\temp")]} engine))
      :postgres "WHERE \"field\" = 'C:\\temp'"
      ;; h2 uppercases identifiers, hence "FIELD" not "field"
      :h2       "WHERE \"FIELD\" = 'C:\\temp'")))

(deftest ^:parallel h2x-extract-test
  (is (= ["WHERE \"field\" = extract(epoch FROM \"created_at\")"]
         (funnysql/format {:where [:= :field (h2x/extract :epoch :created_at)]} :postgres)))
  (testing "should validate unit"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid unit"
         (funnysql/format {:where [:= :field [::h2x/extract "epoch FROM whatever) OR 1 = 1; --" :created_at]]} :postgres)))))

(deftest ^:parallel h2x-distinct-count-test
  (is (= ["WHERE \"field\" = count(DISTINCT \"id\")"]
         (funnysql/format {:where [:= :field [::h2x/distinct-count :id]]} :postgres))))

(deftest ^:parallel h2x-percentile-cont-test
  (is (= ["WHERE \"field\" = percentile_cont(0.9) WITHIN GROUP (ORDER BY \"x\")"]
         (funnysql/format {:where [:= :field [::h2x/percentile-cont :x 0.9]]} :postgres)))
  (testing "should work with clojure.lang.Ratio"
    (let [ratio (/ 9 10)]
      (is (instance? clojure.lang.Ratio ratio))
      (is (= ["WHERE \"field\" = percentile_cont(0.9) WITHIN GROUP (ORDER BY \"x\")"]
             (funnysql/format {:where [:= :field [::h2x/percentile-cont :x ratio]]} :postgres))))))

(deftest ^:parallel h2x-collate-test
  (is (= ["WHERE \"field\" = \"x\" COLLATE utf8mb4_unicode_ci"]
         (funnysql/format {:where [:= :field [::h2x/collate :x :utf8mb4_unicode_ci]]} :postgres)))
  (testing "should validate collation"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid collation"
         (funnysql/format {:where [:= :field [::h2x/collate :x "utf8mb4_unicode_ci UNION ALL SELECT * FROM sensitive_table; --"]]} :postgres)))))

(deftest ^:parallel h2x-at-time-zone-test
  (are [zone] (= [(format "WHERE \"field\" = (\"x\" AT TIME ZONE '%s')" zone)]
                 (funnysql/format {:where [:= :field (h2x/at-time-zone :x zone)]} :postgres))
    "UTC"
    "America/New_York"
    "Etc/GMT+5"
    "America/Indiana/Indianapolis"
    "+05:00")
  (testing "Invalid time zone"
    (are [zone] (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Invalid time zone"
                 (funnysql/format {:where [:= :field (h2x/at-time-zone :x zone)]} :postgres))
      "UTC') OR 1 = 1; --"
      ;; well-formed, but not a real zone
      "America/Atlantis")))

(deftest ^:parallel h2x-typed-test
  (is (= ["WHERE \"field\" = \"x\""]
         (funnysql/format {:where [:= :field (h2x/with-type-info :x {:database-type "date"})]} :postgres))))

(deftest ^:parallel h2x-postgres-interval-test
  (is (= ["WHERE \"field\" = INTERVAL '2 day'"]
         (funnysql/format {:where [:= :field [::h2x/postgres-interval 2 :day]]} :postgres)))
  (testing "Should validate amount"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid amount"
         (funnysql/format {:where [:= :field [::h2x/postgres-interval "2" :day]]} :postgres))))
  (testing "Should validate unit"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid unit"
         (funnysql/format {:where [:= :field [::h2x/postgres-interval 2 :raw]]} :postgres)))))

(deftest ^:parallel h2x-interval-non-integral-amount-test
  (testing (str "a non-integral amount is spliced too: bound, its `?` would land inside the quoted Postgres literal, "
                "where JDBC ignores it")
    (are [form engine expected] (= [expected]
                                   (funnysql/format form engine))
      [::h2x/postgres-interval (/ 1 2) :day]   :postgres "INTERVAL '0.5 day'"
      [::h2x/postgres-interval 0.5 :day]       :postgres "INTERVAL '0.5 day'"
      [::h2x/postgres-interval 1.5M :hour]     :postgres "INTERVAL '1.5 hour'"
      [::h2x/postgres-interval -2 :day]        :postgres "INTERVAL '-2 day'"
      [::h2x/mysql-interval (/ 1 2) :second]   :mysql    "INTERVAL 0.5 second"
      [::h2x/mysql-interval 0.25 :second]      :mysql    "INTERVAL 0.25 second"))
  (testing "including the forms `h2x/add-interval-honeysql-form` builds"
    (is (= ["date_add(`x`, INTERVAL 0.5 second)"]
           (funnysql/format (h2x/add-interval-honeysql-form :mysql :x 500 :millisecond) :mysql)))))

(deftest ^:parallel h2x-mysql-interval-test
  (is (= ["WHERE `field` = INTERVAL 2 day"]
         (funnysql/format {:where [:= :field [::h2x/mysql-interval 2 :day]]} :mysql)))
  (testing "Should validate amount"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid amount"
         (funnysql/format {:where [:= :field [::h2x/mysql-interval "2" :day]]} :mysql))))
  (testing "Should validate unit"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid unit"
         (funnysql/format {:where [:= :field [::h2x/mysql-interval 2 :raw]]} :postgres)))))

(deftest ^:parallel validate-identifier-valid-test
  (testing "valid identifiers"
    (are [identifier engine expected] (= [(str "SELECT " expected)]
                                         (funnysql/format {:select [identifier]} engine))
      :field          :postgres "\"field\""
      :field_x        :postgres "\"field_x\""
      :field-y        :postgres "\"field-y\""
      :_field         :postgres "\"_field\""
      :field?         :postgres "\"field?\""
      :t.field        :postgres "\"t\".\"field\""
      :t/field        :postgres "\"t\".\"field\""
      :s.t.field      :postgres "\"s\".\"t\".\"field\""
      :field          :h2       "\"FIELD\""
      :t.field        :h2       "\"T\".\"FIELD\""
      :field          :mysql    "`field`"
      :t.field        :mysql    "`t`.`field`")))

(deftest ^:parallel validate-identifier-invalid-test
  (testing "invalid identifiers"
    (are [identifier] (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Invalid identifier"
                       (funnysql/format {:select [identifier]} :postgres))
      :2field
      (keyword "field()")
      (keyword "field;")
      (keyword "\" OR 1 = 1; --")))
  (testing "invalid identifiers are rejected on every engine, whichever quote character it uses"
    (are [engine identifier] (thrown-with-msg?
                              clojure.lang.ExceptionInfo
                              #"Invalid identifier"
                              (funnysql/format {:select [identifier]} engine))
      :h2    (keyword "\" OR 1 = 1; --")
      :h2    (keyword "field;")
      :mysql (keyword "` OR 1 = 1; --")
      :mysql (keyword "field;")
      :mysql (keyword "t.` OR 1 = 1; --"))))

(deftest ^:parallel validate-identifier-outside-of-select-test
  (testing "invalid identifiers (and aliases) are rejected in every identifier position, not just `:select`"
    (are [form] (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Invalid (identifier|alias)"
                 (funnysql/format form :postgres))
      {:select [:*], :from [(keyword "t; --")]}
      {:select [:*], :from [[:t (keyword "a; --")]]}
      {:select [:*], :from [:t], :join [(keyword "u; --") [:= :t.id :u.id]]}
      {:select [:*], :from [:t], :where [:= (keyword "a; --") 1]}
      {:select [:*], :from [:t], :group-by [(keyword "a; --")]}
      {:select [:*], :from [:t], :order-by [[(keyword "a; --") :desc]]}
      {:update (keyword "t; --"), :set {:a 1}}
      {:update :t, :set {(keyword "a; --") 1}}
      {:delete-from (keyword "t; --")}
      {:insert-into (keyword "t; --"), :values [{:a 1}]}
      {:insert-into :t, :values [{(keyword "a; --") 1}]}
      {:insert-into :t, :columns [(keyword "a; --")], :values [[1]]}
      {:insert-into :t, :values [{:a 1}], :on-conflict [(keyword "a; --")], :do-update-set {:a 2}}
      {:select [:*], :from [:t], :returning [(keyword "a; --")]}
      {:with [[(keyword "cte; --") ^:allow-subquery {:select [:id], :from [:t]}]], :select [:*], :from [:cte]}
      {:create-table [(keyword "t; --")], :with-columns [[:a :text]]}
      {:create-table [:t], :with-columns [[(keyword "a; --") :text]]}
      {:drop-table [(keyword "t; --")]}
      [::h2x/identifier :field ["a" "b; --"]])))

(deftest ^:parallel h2x-current-datetime-form-test
  (are [engine expected] (= [expected]
                            (funnysql/format (h2x/current-datetime-honeysql-form engine) engine))
    :mysql    "now(6)"
    :postgres "now()"
    :h2       "now()"))

(deftest ^:parallel inline-test
  (are [x expected] (= [expected]
                       (funnysql/format [:inline x] :mysql))
    6    "6"
    true "true")
  (testing "a value that can't be inlined is not inlined: `inline!` logs a warning and the value falls through to the
            ordinary `?`-parameter handling, so nothing is spliced into the SQL. See the TODO on
            metabase.funnysql.core/inline!, which plans to make this an error instead of a warning."
    (is (= ["?" "s"]
           (funnysql/format [:inline "s"] :mysql)))))

(deftest ^:parallel map-recursion-blocked-test
  (testing "a map used as an ordinary value must never be compiled/recursed into as SQL -- only the top-level
            entry point (or an explicit subquery-accepting clause) treats a map as a query to compile; anywhere
            else it must fall through to the generic Object handling and get bound as an opaque `?` parameter,
            per the comment above the `Compile` protocol's `extend-protocol` in metabase.funnysql.core"
    (let [subquery-shaped-map {:select [:*] :from [:secrets]}
          [sql & args]        (funnysql/format {:where [:= :field subquery-shaped-map]} :postgres)]
      (is (= "WHERE \"field\" = ?" sql)
          "the map must not be expanded into subquery SQL text")
      (is (= [subquery-shaped-map] args)
          "the map must be passed through as an opaque bound parameter"))))

(deftest ^:parallel rewrite-empty-in-clauses-test
  (testing "rewrites nested empty IN clauses"
    (are [expected clause] (= [expected]
                              (funnysql/format clause :postgres))
      "false"         [:in :id []]
      "false"         [:in :id nil]
      "false"         [:in :id '()]
      "false"         [:in :id #{}]
      "false"         [:in :id (lazy-seq [])]
      "false"         [:in :id {}]
      "true"          [:not-in :id []]
      "true"          [:not-in :id nil]
      "true"          [:not-in :id '()]
      "true"          [:not-in :id #{}]
      "true"          [:not-in :id (lazy-seq [])]
      "\"id\" IN (1)" [:in :id [1]]
      "\"id\" IN (1)" [:in :id #{1}]
      "\"id\" IN (1)" [:in :id (lazy-seq [1])])))

(deftest ^:parallel in-param-collection-test
  (testing "a `:param` naming a collection expands into a list, the way a literal collection does"
    ;; `IN` takes a list of values rather than one value, so compiling the param as a single `?`
    ;; would bind the whole collection and emit `IN ?`, which no database accepts.
    (are [expected clause params] (= expected
                                     (funnysql/format clause :postgres {:params params}))
      ["\"id\" IN (1, 2)"]         [:in     :id [:param :p]] {:p [1 2]}
      ["\"id\" NOT IN (1, 2)"]     [:not-in :id [:param :p]] {:p [1 2]}
      ["\"id\" IN (1)"]            [:in     :id [:param :p]] {:p #{1}}
      ["\"id\" IN (1)"]            [:in     :id [:param :p]] {:p (lazy-seq [1])}
      ;; a non-numeric element still binds, one `?` per element
      ["\"id\" IN (?, ?)" "a" "b"] [:in     :id [:param :p]] {:p ["a" "b"]}))
  (testing "an empty one is rewritten like an empty literal collection, rather than emitting `IN ()`"
    (are [expected clause params] (= expected
                                     (funnysql/format clause :postgres {:params params}))
      ["false"] [:in     :id [:param :p]] {:p []}
      ["true"]  [:not-in :id [:param :p]] {:p []}))
  (testing "a `:param` naming something that is not a sequence or set is left alone"
    ;; One value is not a list of them, so there is nothing to expand. A map stays one opaque bound
    ;; value here, as it would in any other value slot -- an unmarked one is refused upstream by
    ;; `metabase.app-db.honeysql-guard`.
    (are [expected clause params] (= expected
                                     (funnysql/format clause :postgres {:params params}))
      ["\"id\" IN ?" 1]               [:in :id [:param :p]] {:p 1}
      ["\"id\" IN ?" {:select [:id]}] [:in :id [:param :p]] {:p {:select [:id]}}))
  (testing "error on missing parameter"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Missing value for :param"
         (funnysql/format [:in :id [:param :p]] :postgres)))))

(deftest ^:parallel in-param-collection-binds-elements-test
  (testing "the elements of a collection bound to a `:param` are bound as values, never compiled as SQL"
    (are [xs expected] (= expected
                          (funnysql/format [:in :email [:param :xs]] :postgres {:params {:xs xs}}))
      ["a@x" :email]          ["\"email\" IN (?, ?)" "a@x" :email]
      ["a@x" [:lower :email]] ["\"email\" IN (?, ?)" "a@x" [:lower :email]]
      ;; this SQL is wrong but we always want to parameterize a `:param`, and
      ;; never let you inject an identifier or function call
      :email                  ["\"email\" IN ?" :email]
      [:lower :email]         ["\"email\" IN ?" [:lower :email]])))

(deftest ^:parallel in-subquery-test
  (is (= ["WHERE \"dp\".\"group_id\" IN (SELECT \"group_id\" FROM \"permissions_group_membership\" WHERE \"user_id\" = 1)"]
         (funnysql/format {:where [:in :dp.group_id ^:allow-subquery {:select [:group_id]
                                                                      :from   [:permissions_group_membership]
                                                                      :where  [:= :user_id [:inline 1]]}]}
                          :postgres)))
  (testing "throw exception if subselect is not marked `^:allow-subquery`"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QInvalid sequence of values (maps must be marked with ^:allow-subquery)\E"
         (funnysql/format {:where [:in :dp.group_id {:select [:group_id]
                                                     :from   [:permissions_group_membership]
                                                     :where  [:= :user_id [:inline 1]]}]}
                          :postgres)))))

(deftest ^:parallel timestamp-diff-test
  (is (= ["timestampdiff(second, \"col_a\", \"col_b\")"]
         (funnysql/format [:timestampdiff :second :col_a :col_b]
                          :postgres)
         (funnysql/format [::h2x/timestampdiff :second :col_a :col_b]
                          :postgres)))
  (testing "the unit is spliced, so it has to be validated"
    (are [unit] (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Invalid unit"
                 (funnysql/format [:timestampdiff unit :col_a :col_b] :mysql))
      "second, `col_a`, `col_b`) OR 1 = 1; --"
      (keyword "second, x) OR 1 = 1; --")
      "micro second"
      1
      nil)))

(deftest ^:parallel h2x-timestamp-diff-test
  (testing (str "metabase.util.honey-sql-2 is shared by Funny SQL (the app DB) and Honey SQL (warehouses, pgvector), "
                "so its helpers have to produce working SQL under both")
    (testing "calculate-interval-honeysql-form for MySQL needs `TIMESTAMPDIFF`'s unit to be a bare keyword"
      (let [form {:select [[(h2x/calculate-interval-honeysql-form :mysql :end_time :start_time)]]}]
        (is (= ["SELECT timestampdiff(microsecond, `start_time`, `end_time`)"]
               (funnysql/format form :mysql)))))
    (testing "a string type name passed to cast keeps its spelling"
      (let [form {:select [[(h2x/cast "DateTime64(3, 'America/Port-au-Prince')" :x)]]}]
        (is (= ["SELECT CAST(\"x\" AS DateTime64(3, 'America/Port-au-Prince'))"]
               (funnysql/format form :postgres)))))))

(deftest ^:parallel date-part-test
  (is (= ["date_part(?, \"started_at\")" "year"]
         (funnysql/format [:date_part "year" :started_at] :postgres))))

(deftest ^:parallel empty-condition-clause-test
  (testing "a nil or empty `:where`/`:having` is dropped, the way Honey SQL drops it"
    ;; `[]` would otherwise compile to `()`, which H2 reads as an empty ROW
    (are [form] (= ["SELECT \"id\" FROM \"t\""]
                   (update (funnysql/format form :postgres) 0 str/trim))
      {:select :id, :from :t, :where []}
      {:select :id, :from :t, :where nil}
      {:select :id, :from :t, :having []}
      {:select :id, :from :t, :having nil}))
  (testing "only nil and `[]` mean no condition -- dropping a `WHERE` fails open, so other empty values are kept"
    (are [condition] (str/includes? (first (funnysql/format {:select :id, :from :t, :where condition} :postgres))
                                    "WHERE")
      {}
      #{}
      ()))
  (testing "a real condition is still compiled"
    (is (= ["SELECT \"id\" FROM \"t\" WHERE \"a\" = 1"]
           (funnysql/format {:select :id, :from :t, :where [:= :a 1]} :postgres)))))

(deftest ^:parallel bare-value-clause-test
  (testing "a clause that takes a list also accepts a single bare value, the way Honey SQL does"
    (are [form expected] (= [expected]
                            (funnysql/format form :postgres))
      {:select :id, :from :t, :group-by :id}             "SELECT \"id\" FROM \"t\" GROUP BY \"id\""
      {:select [:id], :from [:t], :group-by [:id]}       "SELECT \"id\" FROM \"t\" GROUP BY \"id\""
      {:select :id, :from :t, :order-by :id}             "SELECT \"id\" FROM \"t\" ORDER BY \"id\" ASC"
      {:select :id, :from :t, :group-by :a, :order-by :b} "SELECT \"id\" FROM \"t\" GROUP BY \"a\" ORDER BY \"b\" ASC"))
  (testing "`:order-by` with an explicit direction still works, and is not mistaken for two columns"
    (is (= ["SELECT \"id\" FROM \"t\" ORDER BY \"id\" DESC"]
           (funnysql/format {:select :id, :from :t, :order-by [[:id :desc]]} :postgres))))
  (testing "nil and empty mean the clause is absent, not `GROUP BY NULL`"
    ;; `map!` emits its \" \" clause separator between every key whether or not the clause itself writes anything, so
    ;; an absent clause leaves behind whitespace. That is cosmetic and predates this test; what matters is that no
    ;; dangling `GROUP BY`/`ORDER BY` is emitted.
    (let [[sql & args] (funnysql/format {:select :id, :from :t, :group-by nil, :order-by []} :postgres)]
      (is (= "SELECT \"id\" FROM \"t\"" (str/trim sql)))
      (is (empty? args))
      (is (not (str/includes? sql "GROUP BY")))
      (is (not (str/includes? sql "ORDER BY"))))))

(deftest ^:parallel union-with-order-by-and-paging-test
  (testing "a `UNION`'s body comes before the `ORDER BY`/`LIMIT`/`OFFSET` that apply to the combined result"
    (is (= [(str "(SELECT \"id\" FROM \"a\") UNION ALL (SELECT \"id\" FROM \"b\")"
                 " ORDER BY \"id\" DESC LIMIT 50 OFFSET 10")]
           (funnysql/format {:union-all [^:allow-subquery {:nest ^:allow-subquery {:select [:id] :from [:a]}}
                                         ^:allow-subquery {:nest ^:allow-subquery {:select [:id] :from [:b]}}]
                             :order-by  [[:id :desc]]
                             :limit     50
                             :offset    10}
                            :postgres))))
  (testing "same for plain `:union`"
    (is (= ["SELECT \"id\" FROM \"a\" UNION SELECT \"id\" FROM \"b\" ORDER BY \"id\" ASC"]
           (funnysql/format {:union    [^:allow-subquery {:select [:id] :from [:a]}
                                        ^:allow-subquery {:select [:id] :from [:b]}]
                             :order-by [:id]}
                            :postgres)))))

(deftest ^:parallel ilike-test
  (testing "`:ilike` is an infix operator like `:like`, not a function call"
    (is (= ["WHERE \"name\" ILIKE ?" "%foo%"]
           (funnysql/format {:where [:ilike :name "%foo%"]} :postgres)))))

(deftest ^:parallel concat-operator-test
  (testing "`:||` is an infix operator, e.g. for concatenating `tsvector`s"
    (is (= ["SELECT \"a\" || \"b\" || \"c\""]
           (funnysql/format {:select [[[:|| :a :b :c]]]} :postgres)))))

(deftest ^:parallel scalar-subquery-test
  (testing "a subquery in a `SELECT` list or function argument has to be parenthesized"
    (is (= [(str "SELECT \"id\", (SELECT count(*) FROM \"b\" WHERE \"b\".\"a_id\" = \"a\".\"id\") AS \"n\","
                 " coalesce((SELECT max(\"x\") FROM \"b\"), 0) AS \"m\" FROM \"a\"")]
           (funnysql/format {:select [:id
                                      [^:allow-subquery {:select [:%count.*]
                                                         :from   [:b]
                                                         :where  [:= :b.a_id :a.id]}
                                       :n]
                                      [[:coalesce ^:allow-subquery {:select [[:%max.x]] :from [:b]} 0]
                                       :m]]
                             :from   [:a]}
                            :postgres))))
  (testing "but not double-parenthesized where the position already brings its own parens"
    (is (= ["SELECT * FROM (SELECT \"id\" FROM \"b\") AS \"sub\" WHERE (\"x\" IN (SELECT \"id\" FROM \"c\")) AND ((SELECT max(\"y\") FROM \"d\") = 1)"]
           (funnysql/format {:select [:*]
                             :from   [[^:allow-subquery {:select [:id] :from [:b]} :sub]]
                             :where  [:and
                                      [:in :x ^:allow-subquery {:select [:id] :from [:c]}]
                                      [:= ^:allow-subquery {:select [[:%max.y]] :from [:d]} 1]]}
                            :postgres))))
  (testing "`INSERT INTO ... SELECT` doesn't parenthesize the `SELECT`"
    (is (= ["INSERT INTO \"a\" (\"id\") SELECT \"id\" FROM \"b\""]
           (funnysql/format {:insert-into [[:a [:id]] ^:allow-subquery {:select [:id] :from [:b]}]} :postgres)))))

(deftest ^:parallel unknown-function-is-rejected-test
  (testing "a function that isn't whitelisted in `fn-call!` must throw rather than being spliced into the SQL"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Function :nope-not-a-real-function is not currently supported"
         (funnysql/format {:where [:= :field [:nope-not-a-real-function :x]]} :postgres)))))

(deftest ^:parallel escape-test
  (testing "`:escape` is a postfix operator on a LIKE pattern, not a function call"
    (is (= ["WHERE \"NAME\" LIKE ? ESCAPE '!'" "foo%"]
           (funnysql/format {:where [:like :name [:escape "foo%" (h2x/literal "!")]]}
                            :h2))))
  (testing "the pattern itself can be an arbitrary expression"
    (is (= ["WHERE \"name\" LIKE lower(\"other\") ESCAPE '!'"]
           (funnysql/format {:where [:like :name [:escape [:lower :other] (h2x/literal "!")]]}
                            :postgres)))))

(deftest ^:parallel create-table-test
  (is (= [(str "CREATE TABLE \"table\" ("
               "\"id\" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY, "
               "\"created_at\" timestamp with time zone DEFAULT current_timestamp NOT NULL, "
               "\"model\" varchar(32) NOT NULL"
               ")")]
         (funnysql/format {:create-table [:table]
                           :with-columns [[:id :bigint [:primary-key] [:generated-by-default-as-identity]]
                                          [:created_at :timestamp-with-time-zone
                                           [:default :%current-timestamp]
                                           :not-null]
                                          [:model [:varchar 32] :not-null]]}
                          :postgres))))

(deftest ^:parallel create-table-auto-increment-test
  (testing ":auto-increment keeps its underscore -- it is one SQL keyword, not two words"
    (is (= [(str "CREATE TABLE \"SEARCH_INDEX\" ("
                 "\"ID\" bigint AUTO_INCREMENT PRIMARY KEY, "
                 "\"SEARCH_TERMS\" text"
                 ")")]
           (funnysql/format {:create-table [:search_index]
                             :with-columns [[:id :bigint :auto-increment :primary-key]
                                            [:search_terms :text]]}
                            :h2)))))

(deftest ^:parallel create-table-falsey-default-test
  (testing "`false` is a legitimate column default and must not be mistaken for a missing one"
    (is (= ["CREATE TABLE \"T\" (\"ARCHIVED\" boolean NOT NULL DEFAULT false)"]
           (funnysql/format {:create-table [:t]
                             :with-columns [[:archived :boolean :not-null [:default false]]]}
                            :h2))))
  (testing "a `:default` with no value at all is still an error"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QMissing value for :default\E"
         (funnysql/format {:create-table [:t]
                           :with-columns [[:archived :boolean [:default]]]}
                          :h2)))))

(deftest ^:parallel create-table-default-is-never-a-parameter-test
  (testing "DDL takes no parameters, so a column default has to be written into the SQL text"
    (are [default expected] (= [(str "CREATE TABLE \"t\" (\"c\" text DEFAULT " expected ")")]
                               (funnysql/format {:create-table [:t]
                                                 :with-columns [[:c :text [:default default]]]}
                                                :postgres))
      nil                  "NULL"
      true                 "true"
      1                    "1"
      ;; spliced here even though a non-integral number is bound everywhere else
      0.5                  "0.5"
      (/ 1 4)              "0.25"
      (h2x/literal "x")    "'x'"
      :%current-timestamp  "current_timestamp"))
  (testing "anything that would compile to a `?` throws instead of producing a CREATE TABLE the database rejects"
    (are [default] (thrown-with-msg?
                    clojure.lang.ExceptionInfo
                    #"\QA column default cannot be a parameter; use h2x/literal for a string default\E"
                    (funnysql/format {:create-table [:t]
                                      :with-columns [[:c :text [:default default]]]}
                                     :postgres
                                     {:params {:p "x"}}))
      "x"
      [:lower "x"]
      [:param :p])))

(deftest ^:parallel create-table-unknown-column-option-test
  (testing "an unrecognized column option should throw a clear error rather than falling off the end of a `case`"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QUnknown column option\E"
         (funnysql/format {:create-table [:table]
                           :with-columns [[:id :bigint :totally-bogus-option]]}
                          :h2)))))

(deftest ^:parallel create-table-if-not-exists-test
  (is (= ["CREATE TABLE IF NOT EXISTS \"t\" (\"id\" integer)"]
         (funnysql/format {:create-table [:t :if-not-exists], :with-columns [[:id :integer]]} :postgres))))

(deftest ^:parallel from-subquery-test
  (is (= [(str "SELECT EXISTS ("
               "SELECT 1 FROM ("
               "SELECT * FROM \"metabase_field\" AS \"f\""
               ") AS \"metabase_field\" "
               "WHERE \"table_id\" IN ("
               "SELECT \"id\" FROM \"metabase_table\" WHERE \"db_id\" = 415"
               ")) AS \"exists\"")]
         (funnysql/format {:select
                           [[[:exists
                              ^:allow-subquery
                              {:select [[[:inline 1]]]
                               :from
                               [[^:allow-subquery
                                 {:select [:*]
                                  :from   [[:metabase_field :f]]}
                                 :metabase_field]]
                               :where  [:in :table_id ^:allow-subquery {:select [:id]
                                                                        :from   [:metabase_table]
                                                                        :where  [:= :db_id 415]}]}]
                             :exists]]}
                          :postgres))))

(deftest ^:parallel param-test
  (testing ":param should look up value from options :parameters; should always compile as `?`"
    (is (= ["UPDATE \"SETTING\" SET \"VALUE\" = ?, \"VALUE_WITH_AAD\" = ? WHERE \"KEY\" = ?"
            "2026-10-01 18:37:49.894829"
            "2026-10-01 18:37:49.894829"
            100]
           (funnysql/format {:update [:setting]
                             :set    {:value          "2026-10-01 18:37:49.894829"
                                      :value_with_aad "2026-10-01 18:37:49.894829"}
                             :where  [:= :key [:param :p17uc4hjfp068j]]}
                            :h2
                            {:params {:p17uc4hjfp068j 100}})))
    (testing "error on missing parameter"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Missing value for :param"
           (funnysql/format {:update [:setting]
                             :set    {:value          "2026-10-01 18:37:49.894829"
                                      :value_with_aad "2026-10-01 18:37:49.894829"}
                             :where  [:= :key [:param :p17uc4hjfp068j]]}
                            :h2))))
    (testing "`false` and `nil` are legitimate parameter values, not missing ones"
      ;; assert on the parameters rather than the whole SQL string so this does not also depend on the
      ;; (separate, pre-existing) extra-parens behavior around a compiled `:param`.
      (are [v] (= [v]
                  (rest (funnysql/format {:where [:= :key [:param :p]]} :h2 {:params {:p v}})))
        false
        nil)
      (testing "including in an `:in` list"
        (are [v] (= ["WHERE \"KEY\" IN ?" v]
                    (funnysql/format {:where [:in :key [:param :p]]} :h2 {:params {:p v}}))
          false
          nil)))))

(deftest ^:parallel over-test
  (are [form expected] (= expected
                          (funnysql/format form :postgres))
    {:select [:*
              [[:over [[:row_number]
                       {:partition-by :transform_id
                        :order-by     [[:start_time :desc]]}]]
               :rn]]
     :from   [:transform_run]}
    ["SELECT *, row_number() OVER (PARTITION BY \"transform_id\" ORDER BY \"start_time\" DESC) AS \"rn\" FROM \"transform_run\""]

    {:select [[[:over [[:row_number]
                       {:partition-by [:run_id]
                        :order-by     [[:started_at :desc]]}]]
               :rn]]
     :from   [:task_history]}
    ["SELECT row_number() OVER (PARTITION BY \"run_id\" ORDER BY \"started_at\" DESC) AS \"rn\" FROM \"task_history\""]

    {:select [:* [[:over [[:count :*] {}]]
                  :total_count]]
     :from   [:collection]}
    ["SELECT *, count(*) OVER () AS \"total_count\" FROM \"collection\""]))

(deftest ^:parallel dotted-alias-test
  (testing "like Honey SQL, an alias containing a `.` is a single identifier, not a qualified one"
    (are [engine expected] (= [expected]
                              (funnysql/format {:select [[:card.name :report_card.name]]
                                                :from   [[:report_card :card]]}
                                               engine))
      :postgres "SELECT \"card\".\"name\" AS \"report_card.name\" FROM \"report_card\" AS \"card\""
      :h2       "SELECT \"CARD\".\"NAME\" AS \"REPORT_CARD.NAME\" FROM \"REPORT_CARD\" AS \"CARD\""
      :mysql    "SELECT `card`.`name` AS `report_card.name` FROM `report_card` AS `card`"))
  (testing "an alias is still validated"
    (is (thrown? clojure.lang.ExceptionInfo
                 (funnysql/format {:select [[:x (keyword "y\" FROM users; --")]]} :postgres)))))

(deftest ^:parallel qualified-alias-test
  (testing "an alias names a single thing, so a qualified one throws rather than compiling to `AS \"a\".\"b\"`"
    (are [alias] (thrown-with-msg?
                  clojure.lang.ExceptionInfo
                  #"Invalid alias: an alias cannot be qualified"
                  (funnysql/format {:select [[:x alias]]} :postgres))
      :a/b
      (h2x/identifier :field-alias "a" "b")))
  (testing "a single-part `h2x/identifier` alias is fine"
    (is (= ["SELECT \"x\" AS \"a\""]
           (funnysql/format {:select [[:x (h2x/identifier :field-alias "a")]]} :postgres)))))

(deftest ^:parallel over-alias-inside-over-form-test
  (testing "Honey SQL's alias-inside-`:over` form should fail loudly rather than silently dropping the alias"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"put the alias outside"
         (funnysql/format {:select [[[:over [[:row_number] {:order-by [[:id :desc]]} :rn]]]]
                           :from   [:query_execution]}
                          :postgres)))))

(deftest ^:parallel over-unsupported-window-keys-test
  (testing "anything in the window besides `:partition-by` and `:order-by` throws rather than being silently dropped"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"`:over` only supports :partition-by and :order-by"
         (funnysql/format {:select [[[:over [[:row_number] {:partition-by [:a], :where [:= :a 1]}]] :rn]]
                           :from   [:t]}
                          :postgres)))))

(deftest ^:parallel nest-test
  (testing ":nest wraps a subquery in parens"
    (is (= [(str "(SELECT \"dc\".\"card_id\" AS \"card_id\" FROM \"report_dashboardcard\" AS \"dc\")"
                 " UNION ALL "
                 "(SELECT \"dcs\".\"card_id\" AS \"card_id\" FROM \"dashboardcard_series\" AS \"dcs\")")]
           (funnysql/format {:union-all [^:allow-subquery
                                         {:nest ^:allow-subquery {:select [[:dc.card_id :card_id]]
                                                                  :from   [[:report_dashboardcard :dc]]}}
                                         ^:allow-subquery
                                         {:nest ^:allow-subquery {:select [[:dcs.card_id :card_id]]
                                                                  :from   [[:dashboardcard_series :dcs]]}}]}
                            :postgres)))
    (testing "don't splice in subqueries unless they are marked `^:allow-subquery`"
      (is (= ["(?) UNION ALL (?)"
              {:select [[:dc.card_id :card_id]], :from [[:report_dashboardcard :dc]]}
              {:select [[:dcs.card_id :card_id]], :from [[:dashboardcard_series :dcs]]}]
             (funnysql/format {:union-all [^:allow-subquery
                                           {:nest {:select [[:dc.card_id :card_id]]
                                                   :from   [[:report_dashboardcard :dc]]}}
                                           ^:allow-subquery
                                           {:nest {:select [[:dcs.card_id :card_id]]
                                                   :from   [[:dashboardcard_series :dcs]]}}]}
                              :postgres))))))

(deftest ^:parallel composite-test
  (testing ":composite builds a row constructor"
    (are [form expected] (= expected
                            (funnysql/format form :postgres))
      {:select [[:f.id]]
       :from   [:metabase_field]
       :where  [:in
                [:composite [:coalesce :t.schema "__null__"] :t.name :f.name]
                [["public" "orders" "id"]]]}
      [(str "SELECT \"f\".\"id\" FROM \"metabase_field\""
            " WHERE (coalesce(\"t\".\"schema\", ?), \"t\".\"name\", \"f\".\"name\") IN ((?, ?, ?))")
       "__null__" "public" "orders" "id"]

      {:select [[[:count [:distinct [:composite :error_type :error_detail]]]]]
       :from   [:analysis_finding_error]}
      ["SELECT count(distinct((\"error_type\", \"error_detail\"))) FROM \"analysis_finding_error\""])))

(deftest ^:parallel to-regclass-test
  (is (= ["SELECT \"reltuples\", \"relpages\" FROM \"pg_class\" WHERE \"oid\" = to_regclass(?)" "search_index"]
         (funnysql/format {:select [:reltuples :relpages]
                           :from   [:pg_class]
                           :where  [:= :oid [:to_regclass "search_index"]]}
                          :postgres))))

(deftest ^:parallel call-test
  (testing "the h2x helpers built on sql/call emit [:call <fn> ...]"
    (are [form expected] (= expected
                            (funnysql/format form :postgres))
      {:update :query
       :set    {:average_execution_time (h2x/cast :integer
                                                  (h2x/round (h2x/+ (h2x/* 2 :average_execution_time) 1)
                                                             [:inline 0]))}
       :where  [:= :id [:inline 1]]}
      ["UPDATE \"query\" SET \"average_execution_time\" = CAST(round((2 * \"average_execution_time\") + 1, 0) AS integer) WHERE \"id\" = 1"]

      {:select [[(h2x/abs :x)]] :from [:t]}   ["SELECT abs(\"x\") FROM \"t\""]
      {:select [[(h2x/ceil :x)]] :from [:t]}  ["SELECT ceil(\"x\") FROM \"t\""]
      {:select [[(h2x/floor :x)]] :from [:t]} ["SELECT floor(\"x\") FROM \"t\""]
      {:select [[(h2x/year :x)]] :from [:t]}  ["SELECT year(\"x\") FROM \"t\""])))

(deftest ^:parallel mod-test
  (is (= ["SELECT \"x\" % 2 FROM \"t\""]
         (funnysql/format {:select [[(h2x/mod :x 2)]] :from [:t]} :postgres))))

(deftest ^:parallel for-test
  (testing ":for accepts a vector as well as a bare keyword"
    (are [for-clause] (= ["SELECT \"id\" FROM \"exploration_thread\" WHERE \"id\" = 1 FOR UPDATE"]
                         (funnysql/format {:select [:id]
                                           :from   [:exploration_thread]
                                           :where  [:= :id [:inline 1]]
                                           :for    for-clause}
                                          :postgres))
      :update
      [:update])))

(deftest ^:parallel drop-table-test
  (is (= ["DROP TABLE \"table\""]
         (funnysql/format {:drop-table [:table]} :postgres)))
  (is (= ["DROP TABLE IF EXISTS \"table\""]
         (funnysql/format {:drop-table [:if-exists :table]} :postgres))))

(deftest ^:parallel postgres-full-text-search-match-test
  (is (= ["\"search_vector\" @@ \"query\""]
         (funnysql/format [::funnysql/postgres-full-text-search-match :search_vector :query] :postgres)))
  (testing "an argument that is not an identifier is rejected"
    (are [lhs rhs] (thrown? clojure.lang.ExceptionInfo
                            (funnysql/format [::funnysql/postgres-full-text-search-match lhs rhs] :postgres))
      "abc"             :query
      :search_vector    "abc"
      [:to_tsvector :a] :query)))

(deftest ^:parallel unary-plus-minus-test
  (testing "`:+` or `:-` with a single arg should do what we expect"
    (are [x expected] (= expected
                         (funnysql/format x :postgres))
      [:- 1]        ["-1"]
      [:- -1]       ["1"]
      [:+ 1]        ["1"]
      [:- [:- 1 2]] ["-(1 - 2)"]
      [:+ [:- 1 2]] ["1 - 2"]
      [:- :x]       ["-(\"x\")"]))
  (testing "negating something that compiles to a negative number must not emit `--`, which starts a SQL comment"
    (are [x expected] (= expected
                         (funnysql/format x :postgres {:params {:p -1}}))
      {:select [[[:- [:inline -1]] :x]] :from [:t]} ["SELECT -(-1) AS \"x\" FROM \"t\""]
      [:- [:- -1]]                                 ["-(1)"]
      [:- [:- [:inline -1]]]                       ["-(-(-1))"]
      [:- [:param :p]]                             ["-(?)" -1]
      [:- 1 [:inline -1]]                          ["1 - -1"])
    (are [x] (not (str/includes? (first (funnysql/format x :postgres {:params {:p -1}}))
                                 "--"))
      [:- [:inline -1]]
      [:- [:inline -1.5]]
      [:- [:- [:inline -1]]]
      [:- [:abs -1]]
      [:- [:param :p]]))
  (testing "other operators should error"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"No matching clause: :/"
         (funnysql/format [:/ 1] :postgres)))))

(deftest ^:parallel nested-arithmetic-test
  (testing "Wrap nested arithmetic expressions in parens"
    (is (= ["1 * (2 + 3)"]
           (funnysql/format [:* 1 [:+ 2 3]] :postgres)))))

(deftest ^:parallel no-raw-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Function :raw is not currently supported"
       (funnysql/format [:raw "x"] :postgres)))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Top-level map key :raw is not currently supported"
       (funnysql/format {:raw "x"} :postgres))))
