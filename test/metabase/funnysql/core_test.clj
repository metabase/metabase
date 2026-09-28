(ns metabase.funnysql.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.funnysql.core :as funnysql]))

(deftest ^:parallel equals-test
  (are [value expected] (= expected
                            (funnysql/compile {:where [:= :field value]} :postgres))
    "x" ["WHERE \"field\" = ?" "x"]
    nil ["WHERE \"field\" IS NULL"]))

(deftest ^:parallel not-equals-test
  (are [op expected] (= expected
                         (funnysql/compile {:where [op :field "x"]} :postgres))
    :<>   ["WHERE \"field\" <> ?" "x"]
    :!=   ["WHERE \"field\" <> ?" "x"]
    :not= ["WHERE \"field\" <> ?" "x"])
  (testing "NOT NULL"
    (are [op expected] (= expected
                          (funnysql/compile {:where [op :field nil]} :postgres))
      :<>   ["WHERE \"field\" IS NOT NULL"]
      :!=   ["WHERE \"field\" IS NOT NULL"]
      :not= ["WHERE \"field\" IS NOT NULL"])))

(deftest ^:parallel and-or-test
  (are [op sql] (= [(str "WHERE (\"field\" = ?) " sql " (\"other_field\" = ?)") "x" "y"]
                    (funnysql/compile {:where [op [:= :field "x"] [:= :other_field "y"]]} :postgres))
    :and "AND"
    :or  "OR"))

(deftest ^:parallel comparison-test
  (are [op sql] (= [(str "WHERE \"field\" " sql " ?") "s"]
                    (funnysql/compile {:where [op :field "s"]} :postgres))
    :<  "<"
    :<= "<="
    :>  ">"
    :>= ">="))

(deftest ^:parallel in-test
  (is (= ["WHERE \"table\".\"field\" IN (1, 2, 3)"]
         (funnysql/compile {:where [:in :table.field [1 2 3]]} :postgres))))

(deftest ^:parallel not-in-test
  (is (= ["WHERE \"table\".\"field\" NOT IN (1, 2)"]
         (funnysql/compile {:where [:not-in :table.field [1 2]]} :postgres))))

(deftest ^:parallel like-test
  (are [op sql] (= [(str "WHERE \"field\" " sql " ?") "%x%"]
                    (funnysql/compile {:where [op :field "%x%"]} :postgres))
    :like     "LIKE"
    :not-like "NOT LIKE"))

(deftest ^:parallel not-test
  (is (= ["WHERE NOT (\"field\" = 1)"]
         (funnysql/compile {:where [:not [:= :field 1]]} :postgres))))

(deftest ^:parallel is-test
  (are [op sql] (= [(str "WHERE \"field\" " sql)]
                    (funnysql/compile {:where [op :field nil]} :postgres))
    :is     "IS NULL"
    :is-not "IS NOT NULL"))

(deftest ^:parallel between-test
  (is (= ["WHERE \"field\" BETWEEN 1 AND 10"]
         (funnysql/compile {:where [:between :field 1 10]} :postgres))))

(deftest ^:parallel exists-test
  (are [op sql] (= [(str "WHERE " sql " (SELECT 1 FROM \"table\")")]
                    (funnysql/compile {:where [op {:select [1] :from [:table]}]} :postgres))
    :exists     "EXISTS"
    :not-exists "NOT EXISTS"))

(deftest ^:parallel cast-test
  (is (= ["WHERE CAST(\"field\" AS INTEGER) = 1"]
         (funnysql/compile {:where [:= [:cast :field :integer] 1]} :postgres))))

(deftest ^:parallel case-test
  (is (= ["WHERE \"field\" = CASE WHEN \"other\" > 1 THEN ? ELSE ? END" "big" "small"]
         (funnysql/compile {:where [:= :field [:case [:> :other 1] "big" :else "small"]]} :postgres))))

(deftest ^:parallel lower-upper-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(?)") "X"]
                    (funnysql/compile {:where [:= :field [op "X"]]} :postgres))
    :lower "lower"
    :upper "upper"))

(deftest ^:parallel concat-test
  (is (= ["WHERE \"field\" = concat(\"a\", ?)" "b"]
         (funnysql/compile {:where [:= :field [:concat :a "b"]]} :postgres))))

(deftest ^:parallel coalesce-test
  (is (= ["WHERE \"field\" = coalesce(\"a\", 1)"]
         (funnysql/compile {:where [:= :field [:coalesce :a 1]]} :postgres))))

(deftest ^:parallel aggregate-function-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(\"other\")")]
                    (funnysql/compile {:where [:= :field [op :other]]} :postgres))
    :count    "COUNT"
    :sum      "SUM"
    :avg      "AVG"
    :min      "MIN"
    :max      "MAX"
    :distinct "DISTINCT"))

(deftest ^:parallel e2e-test
  (is (= :wow
         (funnysql/compile {:select [:x [:y :alias]]
                            :from   [[:table]]
                            :where  [:and
                                     [:= :field 100]
                                     [:< :field "s"]
                                     [:in :table.field [1 2 3]]]}
                           :h2))))
