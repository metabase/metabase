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
  (reason #(sql/expression->mbql "postgres" sql resolve-name {:condition? true})))

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
           (reason #(sql/expression->mbql "postgres" "name" (fn [_identifier]
                                                               (unsupported/throw-reason "no such column")))))))
  (testing "SQL that converts comes back as the converter returns it"
    (is (= :upper (first (sql/expression->mbql "postgres" "upper(name)" resolve-name))))))
