(ns metabase.funnysql.core-test
  (:require
   [clojure.test :refer :all :exclude [with-test]]
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
      []         []
      [:a]       [:a]
      [:a :b]    [:a "-" :b]
      [:a :b :c] [:a "-" :b "-" :c])))

(deftest ^:parallel equals-test
  (are [value expected] (= expected
                           (funnysql/format {:where [:= :field value]} :postgres))
    "x"  ["WHERE \"field\" = ?" "x"]
    nil  ["WHERE \"field\" IS NULL"]
    ;; booleans and numbers can be inlined
    true ["WHERE \"field\" = true"]
    1    ["WHERE \"field\" = 1"]))

(deftest ^:parallel number-rejects-non-numeric-rendering-test
  (testing "compiling a Number must fail closed instead of splicing whatever `(str n)` happens to produce"
    (testing "a hostile Number implementation's toString is not guaranteed to be numeric SQL syntax"
      (let [evil (proxy [Number] []
                   (toString [] "1); DROP TABLE users; --")
                   (intValue [] (int 1))
                   (longValue [] (long 1))
                   (floatValue [] (float 1))
                   (doubleValue [] (double 1)))]
        (is (thrown? Exception
                     (funnysql/format {:where [:= :field evil]} :postgres)))))
    (testing "Double's non-finite values don't render as valid numeric SQL literals either"
      (are [n] (thrown? Exception
                        (funnysql/format {:where [:= :field n]} :postgres))
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
      :not= ["WHERE \"field\" IS NOT NULL"])))

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
         (funnysql/format {:where [:in :table.field [1 2 3]]} :postgres))))

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

(deftest ^:parallel between-test
  (is (= ["WHERE \"field\" BETWEEN 1 AND 10"]
         (funnysql/format {:where [:between :field 1 10]} :postgres))))

(deftest ^:parallel exists-test
  (are [op sql] (= [(str "WHERE " sql " (SELECT 1 FROM \"table\")")]
                   (funnysql/format {:where [op {:select [1] :from [:table]}]} :postgres))
    :exists     "EXISTS"
    :not-exists "NOT EXISTS"))

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
    [[:field :asc]]                      "\"field\" ASC"
    [[:field :desc]]                     "\"field\" DESC"
    [[:field :asc] [:other_field :desc]] "\"field\" ASC, \"other_field\" DESC"))

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

(deftest ^:parallel with-test
  (is (= ["WITH \"cte\" AS (SELECT \"id\" FROM \"table\"), \"cte2\" AS (SELECT * FROM \"cte\") SELECT \"id\" FROM \"cte\""]
         (funnysql/format {:with   [[:cte  {:select [:id] :from [:table]}]
                                    [:cte2 {:select [:*] :from [:cte]}]]
                           :select [:id]
                           :from   [:cte]} :postgres))))

(deftest ^:parallel with-recursive-test
  (is (= ["WITH RECURSIVE \"cte\" AS (SELECT \"id\" FROM \"table\") SELECT \"id\" FROM \"cte\""]
         (funnysql/format {:with-recursive [[:cte {:select [:id] :from [:table]}]]
                           :select         [:id]
                           :from           [:cte]} :postgres))))

(deftest ^:parallel union-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION SELECT \"id\" FROM \"b\""]
         (funnysql/format {:union [{:select [:id] :from [:a]}
                                   {:select [:id] :from [:b]}]} :postgres))))

(deftest ^:parallel union-all-test
  (is (= ["SELECT \"id\" FROM \"a\" UNION ALL SELECT \"id\" FROM \"b\""]
         (funnysql/format {:union-all [{:select [:id] :from [:a]}
                                       {:select [:id] :from [:b]}]} :postgres))))

(deftest ^:parallel insert-into-values-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?)" "x" "y"]
         (funnysql/format {:insert-into :my_table
                           :values      [{:a "x" :b "y"}]} :postgres))))

(deftest ^:parallel insert-into-multiple-rows-test
  (is (= ["INSERT INTO \"my_table\" (\"a\", \"b\") VALUES (?, ?), (?, ?)" "x" "y" "z" "w"]
         (funnysql/format {:insert-into :my_table
                           :values      [{:a "x" :b "y"} {:a "z" :b "w"}]} :postgres))))

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

(deftest ^:parallel returning-test
  (is (= ["DELETE FROM \"card\" WHERE \"database_id\" = 1 RETURNING \"id\", \"x\""]
         (funnysql/format {:delete-from :card
                           :where       [:= :database_id 1]
                           :returning   [:id :x]} :postgres))))

(deftest ^:parallel for-update-test
  (is (= ["SELECT \"id\" FROM \"revision\" WHERE \"model\" = ? FOR UPDATE" "Card"]
         (funnysql/format {:select [:id]
                           :from   [:revision]
                           :where  [:= :model "Card"]
                           :for    :update} :postgres))))

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

(deftest ^:parallel percent-keyword-rejects-unknown-function-test
  (testing "the `:%function` shorthand must not let an arbitrary, attacker-derived function name reach the SQL --
            an unrecognized name must be rejected, not passed through raw"
    (are [k] (thrown? Exception
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

;;; FunnySQL does not yet support any of the custom `h2x/`-namespaced tagged forms that
;;; `metabase.util.honey-sql-2` registers with HoneySQL (`::h2x/identifier`, `::h2x/literal`, etc.). These forms show
;;; up in real HoneySQL maps built elsewhere in the codebase, so FunnySQL needs to compile them the same way HoneySQL
;;; does. The following tests are expected to fail until that support is added.

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

(deftest ^:parallel h2x-literal-backslash-injection-test
  (testing "backslashes must be escaped too, not just quotes"
    (testing "MySQL and ClickHouse read `\\'` inside a string literal as an escaped quote, not the end of the
              string (unless NO_BACKSLASH_ESCAPES is set) -- a trailing backslash right before the closing quote
              lets the doubled quote that follows become the *real* terminator, and everything after it becomes
              raw SQL instead of part of the literal"
      (is (= ["WHERE \"field\" = 'foo\\\\'' OR 1=1; --'"]
             (funnysql/format {:where [:= :field (h2x/literal "foo\\' OR 1=1; --")]} :postgres))))))

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
    "America/Indiana/Indianapolis")
  (testing "Valid time zone"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid time zone"
         (funnysql/format {:where [:= :field (h2x/at-time-zone :x "UTC') OR 1 = 1; --")]} :postgres)))))

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

(deftest ^:parallel validate-identifier-test
  (testing "valid identifiers"
    (are [identifier] (some? (funnysql/format {:select [identifier]} :postgres))
      :field
      :field_x
      :field-y))
  (testing "invalid identifiers"
    (are [identifier] (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Invalid identifier"
                       (funnysql/format {:select [identifier]} :postgres))
      :2field
      (keyword "field()")
      (keyword "field;")
      (keyword "\" OR 1 = 1; --"))))

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
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #":inline is only allowed for numbers and booleans"
       (funnysql/format [:inline "s"] :mysql))))

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
