(ns metabase.funnysql.core-test
  (:require
   [clojure.test :refer :all :exclude [with-test]]
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
  (is (= ["WHERE CAST(\"field\" AS integer) = 1"]
         (funnysql/compile {:where [:= [:cast :field :integer] 1]} :postgres)))
  (is (thrown-with-msg?
       AssertionError
       #"Invalid type!"
       (funnysql/compile {:where [:= [:cast :field "X) OR SELECT * FROM another_table; --"] 1]} :postgres))))

(deftest ^:parallel case-test
  (is (= ["WHERE \"field\" = CASE WHEN \"other\" > 1 THEN ? ELSE ? END" "big" "small"]
         (funnysql/compile {:where [:= :field [:case [:> :other 1] "big" :else "small"]]} :postgres))))

(deftest ^:parallel lower-upper-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(?)") "X"]
                   (funnysql/compile {:where [:= :field [op "X"]]} :postgres))
    :lower "lower"
    :upper "upper"))

(deftest ^:parallel concat-test
  (is (= ["WHERE \"field\" = concat(\"a\", \"b\")"]
         (funnysql/compile {:where [:= :field [:concat :a :b]]} :postgres))))

(deftest ^:parallel coalesce-test
  (is (= ["WHERE \"field\" = coalesce(\"a\", 1)"]
         (funnysql/compile {:where [:= :field [:coalesce :a 1]]} :postgres))))

(deftest ^:parallel aggregate-function-test
  (are [op sql] (= [(str "WHERE \"field\" = " sql "(\"other\")")]
                   (funnysql/compile {:where [:= :field [op :other]]} :postgres))
    :count    "count"
    :sum      "sum"
    :avg      "avg"
    :min      "min"
    :max      "max"
    :distinct "distinct"))

(deftest ^:parallel select-distinct-test
  (is (= ["SELECT DISTINCT \"field\", \"other_field\""]
         (funnysql/compile {:select-distinct [:field :other_field]} :postgres))))

(deftest ^:parallel group-by-test
  (is (= ["GROUP BY \"field\", \"other_field\""]
         (funnysql/compile {:group-by [:field :other_field]} :postgres))))

(deftest ^:parallel having-test
  (is (= ["HAVING count(\"field\") > 1"]
         (funnysql/compile {:having [:> [:count :field] 1]} :postgres))))

(deftest ^:parallel order-by-test
  (are [order-by sql] (= [(str "ORDER BY " sql)]
                         (funnysql/compile {:order-by order-by} :postgres))
    [:field]                              "\"field\" ASC"
    [[:field :asc]]                       "\"field\" ASC"
    [[:field :desc]]                      "\"field\" DESC"
    [[:field :asc] [:other_field :desc]]  "\"field\" ASC, \"other_field\" DESC"))

(deftest ^:parallel limit-test
  (is (= ["LIMIT 10"]
         (funnysql/compile {:limit 10} :postgres))))

(deftest ^:parallel offset-test
  (is (= ["OFFSET 5"]
         (funnysql/compile {:offset 5} :postgres))))

(deftest ^:parallel limit-offset-test
  (is (= ["LIMIT 10 OFFSET 5"]
         (funnysql/compile {:limit 10, :offset 5} :postgres))))

(deftest ^:parallel join-test
  (are [clause sql] (= [(str sql " \"other\" ON \"a\".\"id\" = \"other\".\"a_id\"")]
                       (funnysql/compile {clause [:other [:= :a.id :other.a_id]]} :postgres))
    :join       "JOIN"
    :left-join  "LEFT JOIN"
    :right-join "RIGHT JOIN"
    :inner-join "INNER JOIN"))

(deftest ^:parallel join-with-alias-test
  (is (= ["JOIN \"dashboard\" AS \"d\" ON \"d\".\"id\" = \"dc\".\"dashboard_id\""]
         (funnysql/compile {:join [[:dashboard :d] [:= :d.id :dc.dashboard_id]]} :postgres))))

(deftest ^:parallel multiple-joins-test
  (is (= ["JOIN \"a\" ON \"a\".\"id\" = \"x\".\"a_id\" JOIN \"b\" ON \"b\".\"id\" = \"x\".\"b_id\""]
         (funnysql/compile {:join [:a [:= :a.id :x.a_id]
                                   :b [:= :b.id :x.b_id]]} :postgres))))

(deftest ^:parallel with-test
  (is (= ["WITH \"cte\" AS (SELECT \"id\" FROM \"table\"), \"cte2\" AS (SELECT * FROM \"cte\") SELECT \"id\" FROM \"cte\""]
         (funnysql/compile {:with   [[:cte  {:select [:id] :from [:table]}]
                                     [:cte2 {:select [:*] :from [:cte]}]]
                            :select [:id]
                            :from   [:cte]} :postgres))))

(deftest ^:parallel with-recursive-test
  (is (= ["WITH RECURSIVE \"cte\" AS (SELECT \"id\" FROM \"table\") SELECT \"id\" FROM \"cte\""]
         (funnysql/compile {:with-recursive [[:cte {:select [:id] :from [:table]}]]
                            :select         [:id]
                            :from           [:cte]} :postgres))))

(deftest ^:parallel union-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION SELECT \"id\" FROM \"b\""]
         (funnysql/compile {:union [{:select [:id] :from [:a]}
                                    {:select [:id] :from [:b]}]} :postgres))))

(deftest ^:parallel union-all-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION ALL SELECT \"id\" FROM \"b\""]
         (funnysql/compile {:union-all [{:select [:id] :from [:a]}
                                        {:select [:id] :from [:b]}]} :postgres))))

(deftest ^:parallel insert-into-values-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?)" "x" "y"]
         (funnysql/compile {:insert-into :my_table
                            :values      [{:a "x" :b "y"}]} :postgres))))

(deftest ^:parallel insert-into-multiple-rows-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?), (?, ?)" "x" "y" "z" "w"]
         (funnysql/compile {:insert-into :my_table
                            :values      [{:a "x" :b "y"} {:a "z" :b "w"}]} :postgres))))

(deftest ^:parallel on-conflict-do-update-set-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?) ON CONFLICT (\"a\") DO UPDATE SET \"b\" = ?, \"c\" = ?" "x" "y" "z" "a"]
         (funnysql/compile {:insert-into   :my_table
                            :values        [{:a "x" :b "y"}]
                            :on-conflict   [:a]
                            :do-update-set {:b "z", :c "a"}} :postgres))))

(deftest ^:parallel update-set-test
  (is (= ["UPDATE \"persisted_info\" SET \"state\" = ?, \"x\" = ? WHERE \"id\" = 1" "deletable" "y"]
         (funnysql/compile {:update [:persisted_info]
                            :set    {:state "deletable", :x "y"}
                            :where  [:= :id 1]} :postgres))))

(deftest ^:parallel delete-from-test
  (is (= ["DELETE FROM \"card\" WHERE \"database_id\" = 1"]
         (funnysql/compile {:delete-from :card
                            :where       [:= :database_id 1]} :postgres))))

(deftest ^:parallel returning-test
  (is (= ["DELETE FROM \"card\" WHERE \"database_id\" = 1 RETURNING \"id\", \"x\""]
         (funnysql/compile {:delete-from :card
                            :where       [:= :database_id 1]
                            :returning   [:id :x]} :postgres))))

(deftest ^:parallel for-update-test
  (is (= ["SELECT \"id\" FROM \"revision\" WHERE \"model\" = ? FOR UPDATE" "Card"]
         (funnysql/compile {:select [:id]
                            :from   [:revision]
                            :where  [:= :model "Card"]
                            :for    :update} :postgres))))

(deftest ^:parallel e2e-test
  (is (= ["SELECT \"X\", \"Y\" AS \"ALIAS\" FROM \"TABLE\" WHERE (\"FIELD\" = 100) AND (\"FIELD\" < ?) AND (\"TABLE\".\"FIELD\" IN (1, 2, 3))"
          "s"]
         (funnysql/compile {:select [:x [:y :alias]]
                            :from   [[:table]]
                            :where  [:and
                                     [:= :field 100]
                                     [:< :field "s"]
                                     [:in :table.field [1 2 3]]]}
                           :h2))))
