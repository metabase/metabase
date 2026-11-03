(ns metabase-enterprise.semantic-layer-import.sql-test
  "[[metabase-enterprise.semantic-layer-import.sql]]: Jinja left in the SQL, and what [[metabase.sql-to-mbql.core]]
  cannot convert reported as the import's own unsupported reasons. The conversion is tested on its own in
  [[metabase.sql-to-mbql.expression-test]], and through the pipeline in
  [[metabase-enterprise.semantic-layer-import.dbt.resolve-test]]."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(defn- resolve-name
  "The column callback: every identifier is `venues.name`."
  [_identifier]
  (lib/ref (meta/field-metadata :venues :name)))

(defn- reason
  "The message of the exception `thunk` throws, when it is one the import reports (see [[unsupported/exception?]])."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if (unsupported/exception? e)
        (ex-message e)
        (throw e)))))

(defn- condition-reason
  "Why the SQL condition `sql` is reported, or the filter clause it converts to."
  [sql]
  (reason #(sql/condition->mbql "postgres" sql resolve-name)))

(deftest ^:parallel jinja-test
  (testing "Jinja anywhere in the SQL, a string literal included: dbt renders the template before the warehouse sees it"
    (are [sql] (sql/jinja? sql)
      "{{ var('x') }} = 1"
      "name = '{{ var(\"x\") }}'"
      "{% if true %}name = 1{% endif %}"
      "name = 1 {# a comment #}"
      "name = '{{'"))
  (testing "braces that are not Jinja"
    (are [sql] (not (sql/jinja? sql))
      "name = '{'"
      "name = '{ \"a\": 1 }'"
      "name = '}}'"))
  (testing "a condition with Jinja is reported as that"
    (is (re-find #"could not parse .*: it still contains Jinja" (condition-reason "name = '{{ var(\"x\") }}'")))))

(deftest ^:parallel unsupported-test
  (testing "what the converter cannot convert is the import's unsupported reason, so the resolve stage reports it"
    (is (= "the function greatest is not supported" (condition-reason "greatest(name, 'a') = 'a'")))
    (is (re-find #"^could not parse \"name =\"" (condition-reason "name ="))))
  (testing "an unsupported reason the column callback throws propagates as it is"
    (is (= "no such column"
           (reason #(sql/value->mbql "postgres" "name" (fn [_identifier]
                                                         (unsupported/throw-reason "no such column")))))))
  (testing "SQL that converts comes back as the converter returns it"
    (is (= :upper (first (sql/value->mbql "postgres" "upper(name)" resolve-name))))))

(deftest ^:parallel parse-expr-test
  (testing "a bare column name, quoted or not, qualified or not, says whether its column part was quoted"
    (are [expr parsed] (= parsed (sql/parse-expr expr))
      "amount"                 {:kind :column, :name "amount", :quoted? false}
      "t.amount"               {:kind :column, :name "amount", :quoted? false}
      "\"Mixed Case\""         {:kind :column, :name "Mixed Case", :quoted? true}
      "t.\"Mixed Case\""       {:kind :column, :name "Mixed Case", :quoted? true}
      "`ticked`"               {:kind :column, :name "ticked", :quoted? true}
      "[Bracketed]"            {:kind :column, :name "Bracketed", :quoted? true}
      "[t].[Bracketed]"        {:kind :column, :name "Bracketed", :quoted? true}
      "\n  amount\n"           {:kind :column, :name "amount", :quoted? false}
      "1"                      {:kind :literal, :value "1"}
      "NULL"                   {:kind :literal, :value "NULL"}
      "*"                      {:kind :wildcard}
      "amount * 2"             {:kind :sql}
      "a.b.c"                  {:kind :sql}
      "1.0"                    {:kind :sql}))
  (testing "column-name is the column a bare column name is, nil for anything else"
    (is (= "amount" (sql/column-name "t.amount")))
    (is (nil? (sql/column-name "amount * 2")))
    (is (nil? (sql/column-name "1")))))

(deftest ^:parallel relation-parts-test
  (testing "the parts of a dotted relation name, each with its quotes stripped and whether it had any"
    (are [relation-name parts] (= parts (sql/relation-parts relation-name))
      "db.schema.table"            [{:name "db", :quoted? false} {:name "schema", :quoted? false} {:name "table", :quoted? false}]
      "\"dbt_bi\".\"public\".\"t\"" [{:name "dbt_bi", :quoted? true} {:name "public", :quoted? true} {:name "t", :quoted? true}]
      "`db`.t"                     [{:name "db", :quoted? true} {:name "t", :quoted? false}]
      "[db].[s].[t]"               [{:name "db", :quoted? true} {:name "s", :quoted? true} {:name "t", :quoted? true}]
      "\"a\"\"b\".t"               [{:name "a\"b", :quoted? true} {:name "t", :quoted? false}]
      " db.s.t "                   [{:name "db", :quoted? false} {:name "s", :quoted? false} {:name "t", :quoted? false}]
      "a.b.c.d"                    [{:name "a", :quoted? false} {:name "b", :quoted? false} {:name "c", :quoted? false} {:name "d", :quoted? false}]))
  (testing "BigQuery's one pair of backticks around the whole path is split at the dots, each part quoted"
    (is (= [{:name "proj", :quoted? true} {:name "ds", :quoted? true} {:name "tbl", :quoted? true}]
           (sql/relation-parts "`proj.ds.tbl`")))
    (is (= [{:name "ds", :quoted? true} {:name "tbl", :quoted? true}] (sql/relation-parts "`ds.tbl`")))
    (is (nil? (sql/relation-parts "`a.`"))))
  (testing "a query, an empty string or two dots in a row is no dotted name"
    (are [relation-name] (nil? (sql/relation-parts relation-name))
      "SELECT * FROM orders"
      "select 1"
      "db..t"
      "")))
