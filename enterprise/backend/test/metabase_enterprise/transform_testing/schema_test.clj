(ns metabase-enterprise.transform-testing.schema-test
  "The `::expectations` schema and the records built from what it passes. The schema is the only
  gate: it normalizes the wire form, dispatches on `:type`, and refuses a repeated name. Pure — no
  warehouse, no app DB."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.expectations.empty :as expectations.empty]
   [metabase-enterprise.transform-testing.expectations.equals :as expectations.equals]
   [metabase-enterprise.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.lib.core :as lib]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- Harness --------------------------------------------

(defn- equals-rows
  "The wire form of an `equals`/`rows` expectation: string keys and string values, as JSON delivers it."
  ([nm]
   (equals-rows nm [{"name" "id" "cast_type" "INTEGER"}] [{"id" 1}]))
  ([nm columns rows]
   {"type" "equals" "name" nm "format" "rows" "columns" columns "rows" rows}))

(defn- empty-sql
  "The wire form of an `empty` expectation."
  [nm]
  {"type" "empty" "name" nm "sql" "SELECT 1 FROM out WHERE id IS NULL"})

(defn- normalized
  "`raw` normalized as the model's `:in` transform normalizes it."
  [raw]
  (lib/normalize ::transform-testing.schema/expectations raw))

(defn- valid?
  "Whether `raw` is an acceptable `:expectations` value once normalized."
  [raw]
  (mr/validate ::transform-testing.schema/expectations (normalized raw)))

(defn- explained
  "Every message the explanation of `value` against `schema` carries, wherever in the structure it sits, without
  the value each one echoes back."
  [schema value]
  (into #{}
        (comp (filter string?)
              (map #(first (str/split % #", received: "))))
        (tree-seq coll? seq (mu/explain schema value))))

(defn- normalized-inputs
  "`raw` normalized as the model's `:in` transform normalizes an `:inputs` value."
  [raw]
  (lib/normalize ::transform-testing.schema/inputs raw))

(defn- records
  "The expectation records `raw` builds into, as the runner builds them."
  [raw]
  (mapv expectations.protocol/build (normalized raw)))

(defn- record-name
  "The simple class name of `x` — how a test names the record type it expected."
  [x]
  (.getSimpleName (class x)))

;;; ------------------------------------------- Normalization -------------------------------------------

(deftest normalizes-the-wire-form-test
  (testing "string keys and values become keywords where the schema says so"
    (is (= [{:type :equals :name "n" :format :rows
             :columns [{:name "id" :cast_type "INTEGER"}]
             :rows    [{"id" 1}]}]
           (normalized [(equals-rows "n")]))))
  (testing "row keys stay strings — a warehouse column can be named 2024 or order-id"
    (let [[e] (normalized [(equals-rows "n" [{"name" "2024" "cast_type" "INTEGER"}] [{"2024" 1}])])]
      (is (= [{"2024" 1}] (:rows e)))
      (is (every? string? (mapcat keys (:rows e))))))
  (testing "declared order is kept, across types"
    (is (= ["one" "two" "three"]
           (mapv :name (normalized [(equals-rows "one") (empty-sql "two") (equals-rows "three")]))))))

;;; --------------------------------------------- What passes ---------------------------------------------

(deftest accepts-every-known-type-test
  (is (valid? [(equals-rows "a") (empty-sql "b")]))
  (testing "no expectations at all is fine"
    (is (valid? []))
    (is (= [] (records []))))
  (testing "an `equals` comparing against SQL is a shape the schema knows, though no run can use it"
    (is (valid? [{"type" "equals" "name" "n" "format" "sql" "sql" "SELECT 1"}]))))

(deftest builds-the-type-that-owns-each-branch-test
  (is (= ["EqualsRows" "Empty"]
         (mapv record-name (records [(equals-rows "a") (empty-sql "b")]))))
  (is (= ["EqualsSql"]
         (mapv record-name (records [{"type" "equals" "name" "n" "format" "sql" "sql" "SELECT 1"}])))))

;;; --------------------------------------------- What it refuses ---------------------------------------------

(deftest refuses-a-repeated-name-test
  ;; Uniqueness is a property of the whole sequence rather than of one expectation, and a failure
  ;; report leads with the name, so two expectations sharing one would be unreadable.
  (testing "two expectations with the same name are refused, however they are typed"
    (is (not (valid? [(equals-rows "dup") (empty-sql "dup")])))
    (is (not (valid? [(empty-sql "dup") (empty-sql "other") (empty-sql "dup")]))))
  (testing "names differing in case are different names"
    (is (valid? [(empty-sql "dup") (empty-sql "DUP")]))))

(deftest rows-must-carry-exactly-the-declared-columns-test
  (testing "a row naming a column that was not declared is refused"
    (is (not (valid? [(equals-rows "n" [{"name" "id" "cast_type" "INTEGER"}] [{"id" 1 "nope" 2}])])))
    (is (= #{"every row must carry exactly the declared columns; not declared: \"nope\""}
           (explained ::transform-testing.schema/expectations
                      (normalized [(equals-rows "n" [{"name" "id" "cast_type" "INTEGER"}]
                                                [{"id" 1 "nope" 2}])])))))
  (testing "a row leaving a declared column out is refused, rather than becoming a null cell"
    (is (= #{"every row must carry exactly the declared columns; missing \"name\""}
           (explained ::transform-testing.schema/expectations
                      (normalized [(equals-rows "n"
                                                [{"name" "id" "cast_type" "INTEGER"}
                                                 {"name" "name" "cast_type" "VARCHAR(5)"}]
                                                [{"id" 1}])])))))
  (testing "the message names what one offending row got wrong, both ways at once"
    (is (= #{"every row must carry exactly the declared columns; missing \"name\"; not declared: \"nope\""}
           (explained ::transform-testing.schema/expectations
                      (normalized [(equals-rows "n"
                                                [{"name" "id" "cast_type" "INTEGER"}
                                                 {"name" "name" "cast_type" "VARCHAR(5)"}]
                                                [{"id" 1 "nope" 2}])])))))
  (testing "a declared column holding a null is carried by the row, not left out"
    (is (valid? [(equals-rows "n" [{"name" "id" "cast_type" "INTEGER"}] [{"id" nil}])])))
  (testing "no rows at all declares columns and stands for an empty table"
    (is (valid? [(equals-rows "n" [{"name" "id" "cast_type" "INTEGER"}] [])])))
  (testing "and an input's rows answer to its columns the same way"
    (is (mr/validate ::transform-testing.schema/inputs
                     (normalized-inputs [{"table" {"name" "PEOPLE"} "format" "rows"
                                          "columns" [{"name" "ID" "cast_type" "INTEGER"}]
                                          "rows" [{"ID" 1}]}])))
    (is (= #{"every row must carry exactly the declared columns; not declared: \"NOPE\""}
           (explained ::transform-testing.schema/inputs
                      (normalized-inputs [{"table" {"name" "PEOPLE"} "format" "rows"
                                           "columns" [{"name" "ID" "cast_type" "INTEGER"}]
                                           "rows" [{"ID" 1 "NOPE" 2}]}]))))))

(deftest refuses-a-malformed-expectation-test
  (testing "an unknown type matches no branch"
    (is (not (valid? [{"type" "nope" "name" "n"}]))))
  (testing "a missing or blank name"
    (is (not (valid? [{"type" "empty" "sql" "SELECT 1"}])))
    (is (not (valid? [{"type" "empty" "name" "" "sql" "SELECT 1"}]))))
  (testing "a missing body, an undeclared key, and a non-map"
    (is (not (valid? [{"type" "empty" "name" "n"}])))
    (is (not (valid? [{"type" "empty" "name" "n" "sql" "SELECT 1" "nope" 1}])))
    (is (not (valid? ["SELECT 1"])))))

;;; ----------------------------------- Checks deferred to run time -----------------------------------

(deftest equals-sql-is-accepted-but-cannot-run-test
  ;; Passing the schema says the shape is storable, not that a run can use it. Refusing it at read
  ;; time would instead make every already-stored test of this shape unreadable.
  (testing "equals/sql builds, then refuses at probe time as not implemented"
    (let [[r] (records [{"type" "equals" "name" "n" "format" "sql" "sql" "SELECT 1"}])]
      (is (satisfies? expectations.protocol/Expectation r))
      (is (= ::transform-testing.errors/unsupported-format
             (try (expectations.protocol/probes r nil)
                  ::no-refusal
                  (catch clojure.lang.ExceptionInfo e (:error-type (ex-data e)))))))))

(deftest database-type-and-column-name-are-not-checked-here-test
  ;; Neither is checked anywhere: `compile/rows-query` writes a column name as one quoted identifier
  ;; and quotes a cast target that is not a plain type name, leaving the database to refuse it.
  (testing "a type that could escape its cast, and a name SQL could not carry unquoted, both store"
    (is (valid? [(equals-rows "n" [{"name" "id" "cast_type" "INT) FROM x; --"}] [{"id" 1}])]))
    (is (valid? [(equals-rows "n" [{"name" "a.b" "cast_type" "INTEGER"}] [{"a.b" 1}])]))))

;;; ---------------------------------- Every type owns both of its schemas ----------------------------------

(def ^:private expected-types
  "The schemas every expectation type must own. Exhaustive over the aggregates by assertion below, so
  a type added with no result schema fails here rather than reaching a client as an undescribed
  result map."
  {:equals {:schema ::transform-testing.schema/expectation.equals
            :result ::expectations.equals/result}
   :empty  {:schema ::transform-testing.schema/expectation.empty
            :result ::expectations.empty/result}})

(defn- branches
  "The dispatch values the `:multi` registered as `schema` has branches for, and the schema each names."
  [schema]
  (into {} (map (juxt first last)) (mc/children (mr/schema schema))))

(deftest aggregates-are-exhaustive-over-the-types-test
  (testing "the schema a client sends has a branch per known type, naming that type's own schema"
    (is (= (update-vals expected-types :schema)
           (update-vals (branches ::transform-testing.schema/expectation) mc/form))))
  (testing "the aggregate a run reports too — a type with no result schema cannot ship"
    (is (= (update-vals expected-types :result)
           (update-vals (branches ::transform-testing.schema/expectation-result) mc/form))))
  (testing "and every one of those schemas is registered"
    (doseq [[type {:keys [schema result]}] expected-types]
      (testing (str type)
        (is (some? (mr/registered-schema schema)))
        (is (some? (mr/registered-schema result)))))))

(deftest every-type-can-be-built-test
  (testing "every branch of the aggregate has a `build` method, so nothing storable is unrunnable"
    (is (= (conj (set (keys expected-types)) :default)
           (set (keys (methods expectations.protocol/build)))))))

(deftest every-build-validates-before-constructing-test
  (testing "every known type's build method puts its value through the schema before constructing anything"
    (doseq [type (keys expected-types)]
      (testing type
        (let [e (try (expectations.protocol/build {:type type}) nil (catch Exception e e))]
          (is (some? e))
          (testing "and the refusal is the schema's own explanation"
            (is (some? (:error (ex-data e))))))))))

(deftest the-schema-explains-its-own-refusals-test
  (testing "an unknown type names the types there are"
    (is (= #{"unknown type \"nope\", must be one of: empty, equals"}
           (explained ::transform-testing.schema/expectations (normalized [{"type" "nope" "name" "n"}])))))
  (testing "an unknown format names the formats there are"
    (is (= #{"unknown format \"nope\", must be one of: rows, sql"}
           (explained ::transform-testing.schema/expectations
                      (normalized [{"type" "equals" "name" "n" "format" "nope"}])))))
  (testing "something that is not a map at all"
    (is (= #{"must be a map whose type is one of: empty, equals"}
           (explained ::transform-testing.schema/expectations (normalized ["SELECT 1"])))))
  (testing "a repeated name explains itself over the whole sequence"
    (is (= #{"expectation names must be unique within a test"}
           (explained ::transform-testing.schema/expectations
                      (normalized [(empty-sql "dup") (empty-sql "dup")])))))
  (testing "and an input's format, which is the same kind of dispatch"
    (is (= #{"unknown format :nope, must be one of: rows, sql"}
           (explained ::transform-testing.schema/inputs [{:table {:name "PEOPLE"} :format :nope}])))))
