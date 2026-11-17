(ns metabase-enterprise.data-testing.validator-test
  "The checks of [[validator/validate]]: declared and unused inputs, leftover references after the rewrite, table labels
  and the required expectation. Pure — no warehouse."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as errors]
   [metabase-enterprise.data-testing.validator :as validator]
   [metabase.driver :as driver])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- sql-input [schema name]
  {:table {:schema schema :name name} :format :sql :sql "SELECT 1"})

(deftest missing-inputs-complete-test
  (testing "no missing inputs when every referenced table is declared"
    (is (= [] (#'validator/missing-inputs
               [(sql-input "PUBLIC" "PEOPLE") (sql-input "PUBLIC" "ORDERS")]
               #{{:schema "PUBLIC" :name "PEOPLE"} {:schema "PUBLIC" :name "ORDERS"}} "PUBLIC")))))

(deftest missing-inputs-undeclared-test
  (testing "an undeclared referenced table is reported"
    (is (= [{:schema "PUBLIC" :name "ORDERS"}]
           (#'validator/missing-inputs
            [(sql-input "PUBLIC" "PEOPLE")]
            #{{:schema "PUBLIC" :name "PEOPLE"} {:schema "PUBLIC" :name "ORDERS"}} "PUBLIC"))))
  (testing "with nothing declared, every referenced table is reported"
    (is (= #{{:schema nil :name "PEOPLE"} {:schema nil :name "ORDERS"}}
           (set (#'validator/missing-inputs [] #{{:schema nil :name "PEOPLE"} {:schema nil :name "ORDERS"}} "PUBLIC"))))))

(deftest missing-inputs-schema-defaulting-test
  (testing "a bare reference is covered by a declared input in the driver's default schema"
    ;; H2 default-schema is PUBLIC: bare PEOPLE ⇔ PUBLIC.PEOPLE. This is the case Alex's runner
    ;; test hits (transform reads bare PEOPLE, input declares {:schema PUBLIC}).
    (is (= [] (#'validator/missing-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema nil :name "PEOPLE"}} "PUBLIC"))))
  (testing "a bare reference is NOT covered by a declared input in a non-default schema"
    (is (= [{:schema nil :name "PEOPLE"}]
           (#'validator/missing-inputs [(sql-input "OTHER" "PEOPLE")] #{{:schema nil :name "PEOPLE"}} "PUBLIC"))))
  (testing "an explicitly-schemaed reference requires an exact schema match"
    (is (= [{:schema "ANALYTICS" :name "PEOPLE"}]
           (#'validator/missing-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema "ANALYTICS" :name "PEOPLE"}} "PUBLIC")))))

(deftest unused-inputs-test
  (testing "no unused inputs when every declared input is read"
    (is (= [] (#'validator/unused-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema nil :name "PEOPLE"}} "PUBLIC"))))
  (testing "a declared input the transform does not read is reported (stale/typo'd fake)"
    (is (= [{:schema "PUBLIC" :name "ORDERZ"}]
           (#'validator/unused-inputs [(sql-input "PUBLIC" "PEOPLE") (sql-input "PUBLIC" "ORDERZ")]
                                      #{{:schema nil :name "PEOPLE"}} "PUBLIC"))))
  (testing "matching is one rule shared with missing-inputs: bare read ⇔ default-schema input"
    (is (= [] (#'validator/unused-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema nil :name "PEOPLE"}} "PUBLIC")))))

(deftest surviving-references-test
  (testing "Guard B: empty when every rewritten reference is a temp table and nothing dangles"
    (is (= [] (#'validator/surviving-references
               #{{:schema nil :name "MB_T1"} {:schema nil :name "MB_T2"}}
               #{"MB_T1" "MB_T2"} #{}))))
  (testing "a real table the rewrite missed is reported, labelled schema.name"
    (is (= ["github_mart.stg_x"]
           (#'validator/surviving-references
            #{{:schema nil :name "MB_T1"} {:schema "github_mart" :name "stg_x"}}
            #{"MB_T1"} #{}))))
  (testing "a dangling column-qualifier (missing-table-alias) is reported"
    (is (= ["people"]
           (#'validator/surviving-references #{{:schema nil :name "MB_T1"}} #{"MB_T1"} #{"people"}))))
  (testing "both survivor kinds combine, deduped and sorted"
    (is (= ["a_table" "people"]
           (#'validator/surviving-references
            #{{:schema nil :name "MB_T1"} {:schema nil :name "a_table"}}
            #{"MB_T1"} #{"people" "a_table"})))))

(deftest table-label-test
  (testing "table-label renders schema.name, or bare name when schema unknown — never a raw map"
    (is (= "PEOPLE" (validator/table-label {:schema nil :name "PEOPLE"})))
    (is (= "PUBLIC.PEOPLE" (validator/table-label {:schema "PUBLIC" :name "PEOPLE"})))))

(deftest missing-inputs-schema-direction-test
  (testing "a qualified reference matches a declared input in the same explicit schema"
    (is (= [] (#'validator/missing-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema "PUBLIC" :name "PEOPLE"}} "PUBLIC"))))
  (testing "schema defaulting is one-directional and fails closed: a DEFAULT-SCHEMA-qualified
            reference is NOT covered by a bare-declared input — the author must qualify the input.
            Safe (errs toward rejection, never a false pass); strict by design for LLM authors."
    (is (= [{:schema "PUBLIC" :name "PEOPLE"}]
           (#'validator/missing-inputs [(sql-input nil "PEOPLE")] #{{:schema "PUBLIC" :name "PEOPLE"}} "PUBLIC")))))

(deftest missing-inputs-name-mismatch-test
  (testing "same schema, different name is not a match"
    (is (= [{:schema "PUBLIC" :name "ORDERS"}]
           (#'validator/missing-inputs [(sql-input "PUBLIC" "PEOPLE")] #{{:schema "PUBLIC" :name "ORDERS"}} "PUBLIC")))))

(defn- refusal
  "The `:error-type` that [[validator/validate]] throws for `args` on H2, or nil when it accepts them."
  [args]
  (driver/the-initialized-driver :h2)
  (try
    (validator/validate :h2 args)
    nil
    (catch ExceptionInfo e
      (:error-type (ex-data e)))))

(def ^:private complete-test
  "A test whose inputs cover what its query reads and whose query reads only temp tables."
  {:inputs              [(sql-input "PUBLIC" "PEOPLE")]
   :referenced-tables   #{{:schema "PUBLIC" :name "PEOPLE"}}
   :rewritten-query "SELECT ID FROM MB_T1"
   :replacements        {{:schema "PUBLIC" :table "PEOPLE"} {:db nil :schema nil :table "MB_T1"}
                         {:table "PEOPLE"}                  {:db nil :schema nil :table "MB_T1"}}
   :default-schema      "PUBLIC"})

(deftest no-expectations-test
  (testing "a test that checks nothing is refused"
    (is (= ::errors/no-expectations
           (refusal (assoc complete-test :expectations [])))))
  (testing "the same test with one expectation is accepted"
    (is (nil? (refusal (assoc complete-test :expectations [{:type :empty :name "none" :sql "SELECT * FROM PEOPLE"}])))))
  (testing "missing inputs are reported before missing expectations"
    (is (= ::errors/missing-inputs
           (refusal (assoc complete-test :inputs [] :expectations []))))))

(deftest output-token-test
  (let [test-reading-output (-> complete-test
                                (assoc :expectations [{:type :empty :name "none" :sql "SELECT * FROM {{output}}"}])
                                (assoc-in [:replacements {:table data-testing.compile/output-name}]
                                          {:db nil :schema nil :table "MB_OUT"}))]
    (testing "with the output token set, an expectation reading `{{output}}` reads only temp tables"
      (is (nil? (refusal (assoc test-reading-output :output-token "{{output}}")))))
    (testing "without the output token, the same expectation's SQL cannot be parsed"
      (is (= ::errors/unparseable-source
             (refusal test-reading-output))))))

(deftest unknown-placeholder-test
  (let [card-test (-> complete-test
                      (assoc-in [:replacements {:table data-testing.compile/output-name}]
                                {:db nil :schema nil :table "MB_OUT"})
                      (assoc :output-token "{{output}}"))
        with-sql  (fn [args sql] (assoc args :expectations [{:type :empty :name "check" :sql sql}]))
        refused   (fn [args]
                    (try
                      (validator/validate :h2 args)
                      nil
                      (catch ExceptionInfo e
                        {:error-type (:error-type (ex-data e)) :message (ex-message e)})))]
    (driver/the-initialized-driver :h2)
    (testing "control: the output token, with or without spaces inside its braces, is accepted"
      (is (nil? (refused (with-sql card-test "SELECT * FROM {{output}} JOIN {{ output }} o2 ON 1 = 1")))))
    (testing "any other placeholder is refused, naming it and the expectation"
      (is (= {:error-type ::errors/unknown-placeholder
              :message    (str "Expectation \"check\" uses placeholders a test does not know: {{OUTPUT}}, {{ other }}. "
                               "Write {{output}} for the output of the query under test.")}
             (refused (with-sql card-test "SELECT * FROM {{OUTPUT}} WHERE x = '{{ other }}'")))))
    (testing "a transform test has no placeholders: braces in a string literal are its SQL's own"
      (is (nil? (refused (with-sql complete-test "SELECT '{{x}}' AS a FROM PEOPLE")))))))
