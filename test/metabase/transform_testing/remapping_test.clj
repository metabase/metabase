(ns ^:mb/driver-tests metabase.transform-testing.remapping-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.runner :as transform-testing.runner]
   [metabase.transform-testing.validator :as transform-testing.validator]
   [metabase.util :as u]))

;; `sql.normalize/default-schema`, which decides whether a bare table key is registered, dispatches
;; on an initialized driver. These tests parse and rewrite SQL only — no connection is needed.
(use-fixtures :once (fn [f] (driver/the-initialized-driver :h2) (f)))

;;; -------------------------------------------- Harness --------------------------------------------

(defn- rewrite
  "`sql` with `replacements` applied, through the same call a test run makes."
  [sql replacements]
  (transform-testing.compile/replace-tables :h2 sql replacements))

(defn- table-refs
  "The tables `sql` reads, case-folded, as `{:schema :table}` tuples. Once a query has been
  rewritten, every table in this set should be one of the run's temp tables."
  [sql]
  (into #{}
        (map (fn [{:keys [schema table]}]
               {:schema (some-> schema u/lower-case-en)
                :table  (u/lower-case-en table)}))
        (sql-tools/referenced-tables-raw :h2 sql)))

(defn- declared-refs
  "The tables `sql` reads, uncased, as `{:schema :name}` maps — the shape `missing-inputs` compares
  declared inputs against."
  [sql]
  (into #{}
        (map (fn [{:keys [schema table]}] {:schema schema :name table}))
        (sql-tools/referenced-tables-raw :h2 sql)))

(defn- transform-under-test
  "A transform whose target name appears in none of the SQL below, so its own replacement entry
  never interferes with an input's."
  []
  {:source {:type "query"}
   :target {:type "table" :schema nil :name "UNREFERENCED_TARGET"}})

(defn- declared-input
  "A declared input of `:format :sql` standing in for the table `schema`.`table-name`."
  [schema table-name]
  {:table  {:schema schema :name table-name}
   :format :sql
   :sql    "SELECT 1 AS x"})

(defn- replacements-for
  "The replacement map for `inputs`, whose temp tables are named TMP_IN_1, TMP_IN_2, … and whose
  transform output is TMP_OUT."
  [inputs]
  (transform-testing.compile/table-replacements
   :h2
   (transform-under-test)
   (into {} (map-indexed (fn [i input] [input (str "TMP_IN_" (inc i))])) inputs)
   "TMP_OUT"))

(defn- only-temp-tables?
  "True iff every table in `refs` is one of the temp tables named by [[replacements-for]]."
  [refs]
  (every? #(re-matches #"tmp_(in_\d+|out)" (:table %)) refs))

(defn- missing-inputs
  "The tables `sql` reads that `inputs` does not declare."
  [inputs sql]
  (transform-testing.validator/missing-inputs :h2 inputs (declared-refs sql)))

;;; ------------------------------------- Rewrite completeness -------------------------------------

(deftest declared-input-is-redirected-to-its-temp-table-test
  (let [inputs    [(declared-input "PUBLIC" "PEOPLE")]
        rewritten (rewrite "SELECT ID FROM PEOPLE" (replacements-for inputs))]
    (is (= #{{:schema nil :table "tmp_in_1"}}
           (table-refs rewritten)))))

(def ^:private coverage-cases
  "Ways a query can name a declared input, paired with the declaration it should satisfy."
  [{:desc     "exact-case match, both qualified"
    :declared {:schema "PUBLIC" :name "PEOPLE"}
    :sql      "SELECT ID FROM PUBLIC.PEOPLE"}
   {:desc     "lowercase reference against an uppercase declaration"
    :declared {:schema "PUBLIC" :name "PEOPLE"}
    :sql      "select id from people"}
   {:desc     "declared schema differing in case from the reference"
    :declared {:schema "public" :name "PEOPLE"}
    :sql      "SELECT ID FROM PUBLIC.PEOPLE"}
   {:desc     "bare reference against a declaration in the default schema"
    :declared {:schema "PUBLIC" :name "PEOPLE"}
    :sql      "SELECT ID FROM PEOPLE"}
   {:desc     "qualified reference against a bare declaration"
    :declared {:schema nil :name "PEOPLE"}
    :sql      "SELECT ID FROM PUBLIC.PEOPLE"}])

(deftest accepted-input-coverage-implies-a-complete-rewrite-test
  (testing "a run whose inputs validate as complete must not go on to read a real table"
    (doseq [{:keys [desc declared sql]} coverage-cases]
      (let [{:keys [schema name]} declared
            inputs    [(declared-input schema name)]
            rewritten (rewrite sql (replacements-for inputs))
            accepted? (empty? (missing-inputs inputs sql))
            rewrote?  (only-temp-tables? (table-refs rewritten))]
        (is (or (not accepted?) rewrote?)
            (str desc ": inputs validated as complete, but the rewritten query still reads "
                 (pr-str (remove #(re-matches #"tmp_(in_\d+|out)" (:table %)) (table-refs rewritten)))))))))

(deftest undeclared-table-is-reported-missing-test
  (testing "a table the transform reads with no declared input is reported, so the run can be refused"
    (let [sql     "SELECT P.ID FROM PEOPLE P JOIN ORDERS O ON O.USER_ID = P.ID"
          inputs  [(declared-input "PUBLIC" "PEOPLE")]
          missing (missing-inputs inputs sql)]
      (is (some #(= "ORDERS" (:name %)) missing)
          (str "ORDERS is undeclared and must be reported; missing=" (pr-str missing))))))

;;; ---------------------------------------- Identifier case ----------------------------------------

(deftest case-folded-table-reference-test
  (testing "an unquoted reference resolves to the declared table regardless of the case it is written in"
    ;; Unquoted `people` names the table PEOPLE on H2.
    (let [sql       "select id from people"
          inputs    [(declared-input "PUBLIC" "PEOPLE")]
          rewritten (rewrite sql (replacements-for inputs))]
      (is (= #{{:schema nil :table "tmp_in_1"}} (table-refs rewritten))
          "the reference should have been redirected to the input's temp table")
      (is (empty? (missing-inputs inputs sql))
          "the reference should have counted as covered by the declared input"))))

(deftest case-folded-schema-in-declaration-test
  (testing "a declaration whose schema differs in case from the reference still matches it"
    (let [sql       "SELECT ID FROM PUBLIC.PEOPLE"
          inputs    [(declared-input "public" "PEOPLE")]
          rewritten (rewrite sql (replacements-for inputs))]
      (is (= #{{:schema nil :table "tmp_in_1"}} (table-refs rewritten))
          "the reference should have been redirected to the input's temp table")
      (is (empty? (missing-inputs inputs sql))
          "the reference should have counted as covered by the declared input"))))

;;; --------------------------- References the rewrite does not account for ---------------------------

(deftest cte-named-after-a-declared-input-test
  (testing "a CTE keeps its own name: a query reading it must not be redirected to a temp table"
    ;; Table-reference parsing resolves scopes and so excludes CTE names, but the rewrite walks
    ;; every table node. A CTE sharing a declared input's name is therefore orphaned — the query
    ;; reads the fixture instead of the CTE, and nothing upstream can see that it happened.
    (let [sql       "WITH PEOPLE AS (SELECT 1 AS ID) SELECT ID FROM PEOPLE"
          inputs    [(declared-input "PUBLIC" "PEOPLE")]
          rewritten (rewrite sql (replacements-for inputs))]
      (is (empty? (table-refs rewritten))
          (str "the only PEOPLE here is the CTE, so the query should read no table at all; "
               "rewritten=" (pr-str rewritten))))))

(deftest table-qualified-column-reference-test
  (testing "a column qualified by table name is redirected along with the FROM clause"
    ;; Table-reference parsing reports FROM and JOIN sources only, so a qualifier left behind is
    ;; invisible to it; the rewritten query names a table that is no longer in scope.
    (let [sql       "SELECT PEOPLE.ID FROM PEOPLE"
          inputs    [(declared-input "PUBLIC" "PEOPLE")]
          rewritten (rewrite sql (replacements-for inputs))
          errors    (:errors (sql-tools/field-references :h2 rewritten))]
      (is (not-any? #(= :missing-table-alias (:type %)) errors)
          (str "rewritten=" (pr-str rewritten) " errors=" (pr-str errors))))))

(deftest expectation-sql-reads-only-temp-tables-test
  (testing "an expectation naming an undeclared table must not reach the real one"
    ;; Expectations are rewritten with the same replacement map as the transform, but input
    ;; completeness is checked against the transform's references alone — never an expectation's.
    ;; ORDERS is undeclared, so no temp table stands in for it and this assertion cannot pass; it
    ;; records the reference surviving into a query that then runs against the warehouse.
    (let [inputs    [(declared-input "PUBLIC" "PEOPLE")]
          rewritten (rewrite "SELECT * FROM ORDERS" (replacements-for inputs))]
      (is (only-temp-tables? (table-refs rewritten))
          (str "expectation still reads " (pr-str (table-refs rewritten))
               "; rewritten=" (pr-str rewritten))))))

;;; ----------------------------------- Replacement-map construction -----------------------------------

(deftest same-table-name-in-two-schemas-test
  (let [inputs       [(declared-input "SALES" "ORDERS") (declared-input "ARCHIVE" "ORDERS")]
        replacements (replacements-for inputs)]
    (testing "an unqualified reference is ambiguous and must not be resolved to either schema"
      (let [refs (table-refs (rewrite "SELECT * FROM ORDERS" replacements))]
        (is (not (contains? refs {:schema nil :table "tmp_in_1"})) (str "refs=" (pr-str refs)))
        (is (not (contains? refs {:schema nil :table "tmp_in_2"})) (str "refs=" (pr-str refs)))))
    (testing "a qualified reference resolves to its own schema's temp table"
      (is (= #{{:schema nil :table "tmp_in_1"}}
             (table-refs (rewrite "SELECT * FROM SALES.ORDERS" replacements))))
      (is (= #{{:schema nil :table "tmp_in_2"}}
             (table-refs (rewrite "SELECT * FROM ARCHIVE.ORDERS" replacements)))))))

(deftest catalog-qualified-reference-test
  (testing "a catalog-qualified reference loses its catalog along with its schema"
    ;; A replacement carries a table and a schema but no catalog, so a three-part reference keeps
    ;; the catalog it came with and ends up naming a table that exists under no such catalog.
    (let [inputs    [(declared-input "PUBLIC" "ORDERS")]
          rewritten (rewrite "SELECT * FROM MYDB.PUBLIC.ORDERS" (replacements-for inputs))]
      (is (not (str/includes? (u/lower-case-en rewritten) "mydb"))
          (str "rewritten=" (pr-str rewritten))))))

(deftest colliding-replacement-keys-test
  (testing "every declared input gets a replacement entry, even when two share a key"
    ;; With PUBLIC the default schema, a bare declaration and an explicit-PUBLIC declaration of the
    ;; same table both register the key {:table "ORDERS"}. Whichever loses the collision keeps its
    ;; fixture loaded but unreferenced, and the query reads the other one's data.
    (let [inputs       [(declared-input nil "ORDERS") (declared-input "PUBLIC" "ORDERS")]
          replacements (replacements-for inputs)]
      (is (= #{"TMP_IN_1" "TMP_IN_2" "TMP_OUT"}
             (set (map :table (vals replacements))))
          (str "replacements=" (pr-str replacements))))))

;;; ------------------------------- Occurrences that are not references -------------------------------

(deftest non-reference-occurrences-are-left-alone-test
  (testing "a declared table's name in a column, literal or alias is not a reference and must survive"
    ;; Table and column names collide routinely — status, type, source, state. A rewrite that
    ;; matched names rather than references would corrupt all of these.
    (let [inputs       [(declared-input "PUBLIC" "PEOPLE") (declared-input "PUBLIC" "ORDERS")]
          replacements (replacements-for inputs)]
      (doseq [[desc sql] [["a column named like another declared table" "SELECT PEOPLE FROM ORDERS"]
                          ["a column whose name contains one"           "SELECT PEOPLE_COUNT FROM ORDERS"]
                          ["a string literal"                           "SELECT * FROM ORDERS WHERE SRC = 'PEOPLE'"]
                          ["an alias"                                   "SELECT X AS PEOPLE FROM ORDERS"]]]
        (testing desc
          (let [rewritten (rewrite sql replacements)]
            (is (= #{{:schema nil :table "tmp_in_2"}} (table-refs rewritten))
                (str "only ORDERS is a reference here; rewritten=" (pr-str rewritten)))
            (is (str/includes? rewritten "PEOPLE")
                (str "PEOPLE is not a reference here and should survive; rewritten="
                     (pr-str rewritten)))))))))

;;; ------------------------------------------- End to end -------------------------------------------

(deftest case-mismatched-run-must-not-report-on-real-data-test
  (testing "a run whose rewrite misses must refuse rather than report a result read from real tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      (let [mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))
            target                        "mb_remapping_probe_case_mismatch"]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query
                                         mp (str "SELECT id, name FROM " schema "." (u/lower-case-en table)))}
                        :target {:type     "table"
                                 :schema   schema
                                 :name     target
                                 :database (mt/id)}}]
          (mt/with-temp [:model/TransformTest transform-test
                         {:transform_id transform-id
                          :inputs       [{:table  {:schema schema :name table}
                                          :format :sql
                                          :sql    "SELECT -1 AS id, 'fixture' AS name"}]
                          :expectations [{:type :empty
                                          :name "the output holds only the fixture row"
                                          :sql  (str "SELECT * FROM " schema "." target " WHERE id <> -1")}]}]
            ;; The declared input names the table as sync reports it; the transform names it in
            ;; lower case. Refusing the run is a fine answer. Reporting :failed is not — it means
            ;; the fixture was ignored and the expectation was measured against real rows.
            (let [outcome (try
                            (transform-testing.runner/run-transform-test! transform-test)
                            (catch Exception e
                              {:refused (ex-message e)}))]
              (is (not= {:status :failed} outcome)
                  (str "driver=" driver/*driver* " outcome=" (pr-str outcome))))))))))

(deftest target-table-is-never-created-test
  (testing "a run leaves no trace in the warehouse: the transform's target is never materialized"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
      (let [mp                            (mt/metadata-provider)
            {schema :schema, table :name} (lib.metadata/table mp (mt/id :people))
            target                        "mb_remapping_probe_target"]
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/native-query mp (str "SELECT id, name FROM " schema "." table))}
                        :target {:type     "table"
                                 :schema   schema
                                 :name     target
                                 :database (mt/id)}}
                       :model/TransformTest transform-test
                       {:transform_id transform-id
                        :inputs       [{:table  {:schema schema :name table}
                                        :format :sql
                                        :sql    "SELECT -1 AS id, 'fixture' AS name"}]
                        :expectations [{:type :empty
                                        :name "the output holds only the fixture row"
                                        :sql  (str "SELECT * FROM " schema "." target " WHERE id <> -1")}]}]
          (is (= :passed (:status (transform-testing.runner/run-transform-test! transform-test))))
          (is (not (driver/table-exists? driver/*driver* (mt/db) {:schema schema :name target}))))))))
