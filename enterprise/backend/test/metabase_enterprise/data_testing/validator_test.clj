(ns metabase-enterprise.data-testing.validator-test
  "The checks of [[validator/validate]]: declared and unused inputs, leftover references after the rewrite, table labels
  and the required expectation; and the write check, [[validator/ensure-single-write]]. Pure — no warehouse."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as errors]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.data-testing.validator :as validator]
   [metabase.driver :as driver]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt])
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

(defn- write-refusal
  "The `:error-type`, `:reason` and `:detail` of the refusal [[validator/ensure-single-write]] throws for the Postgres
  `sql`, or the SQL it returns when it throws none."
  [sql]
  (try
    (validator/ensure-single-write :postgres sql)
    (catch ExceptionInfo e
      (select-keys (ex-data e) [:error-type :reason :detail]))))

(deftest refused-write-says-why-test
  (testing "a write that calls a function that waits is refused, and the refusal's data names the function"
    (is (= {:error-type ::errors/not-a-single-write :reason "session-function" :detail "pg_sleep"}
           (write-refusal "UPDATE t SET name = pg_sleep(1)::text WHERE id = 1"))))
  (testing "a write whose rebuild reads differently is refused for its rebuild, not for what the author wrote"
    ;; No input known to the parser's SQLGlot version reaches this refusal, so the verdict is stubbed.
    (mt/with-dynamic-fn-redefs [sql-tools/validate-executable-stmt (constantly {:verdict      :disallowed
                                                                                :single-stmt? true
                                                                                :reason       "rebuild-differs"})]
      (is (= {:error-type ::errors/not-a-single-write
              :message    (str "The test cannot run this SQL: the parser rebuilds it as SQL that reads differently. "
                               "Write the statement another way.")
              :reason     "rebuild-differs"}
             (data-testing.test-util/refusal #(validator/ensure-single-write :postgres "UPDATE t SET name = 'x'")
                                             :reason))))))

(deftest write-calling-a-known-writing-function-is-refused-test
  (testing "control: a plain UPDATE comes back as the SQL to run"
    (is (= "UPDATE t SET name = 'x' WHERE id = 1"
           (write-refusal "UPDATE t SET name = 'x' WHERE id = 1"))))
  (testing "a write that sets a sequence with `setval` is refused, naming the function"
    (is (= {:error-type ::errors/not-a-single-write :reason "write-function" :detail "setval"}
           (write-refusal "UPDATE t SET name = (SELECT setval('s', 1))::text"))))
  (testing "a write that advances a sequence with `nextval` is refused, naming the function"
    (is (= {:error-type ::errors/not-a-single-write :reason "write-function" :detail "nextval"}
           (write-refusal "INSERT INTO t (id) VALUES (nextval('s'))"))))
  (testing "a write that deletes a large object is refused, naming the function"
    (is (= {:error-type ::errors/not-a-single-write :reason "write-function" :detail "lo_unlink"}
           (write-refusal "DELETE FROM t WHERE lo_unlink(id) = 1"))))
  (testing "a write that reads a table named in a string is refused, naming the function"
    (is (= {:error-type ::errors/not-a-single-write :reason "unconfined-function" :detail "table_to_xml"}
           (write-refusal "UPDATE t SET name = table_to_xml('secrets', true, false, '')::text WHERE id = 1")))))

(deftest write-with-an-e-string-runs-as-written-test
  (testing "an E'' string with an escaped quote is rebuilt as written"
    (is (= "UPDATE t SET name = e'it\\'s' WHERE id = 1"
           (write-refusal "UPDATE t SET name = E'it\\'s' WHERE id = 1"))))
  (testing "control: an E'' string ending in a doubled backslash is rebuilt as written, keeping both backslashes"
    (is (= "UPDATE t SET name = e'a\\\\' WHERE id = 1"
           (write-refusal "UPDATE t SET name = E'a\\\\' WHERE id = 1"))))
  (testing "the text after such a string stays a string though it holds `setval`, so the write passes and calls nothing"
    (is (= "UPDATE t SET name = e'\\\\' || ''' || (SELECT setval($z$s$z$, 1))::text --' WHERE id = 1"
           (write-refusal (str "UPDATE t SET name = E'\\\\' || $q$' || (SELECT setval($z$s$z$, 1))::text --$q$"
                               " WHERE id = 1"))))))

;;; ------------------------------------------------ Missing input columns ------------------------------------------------

(def ^:private people-test
  "A test of a query that reads `ID` and `SOURCE` of `PUBLIC.PEOPLE`, with one expectation."
  (assoc complete-test
         :expectations [{:type :empty :name "none" :sql "SELECT * FROM PEOPLE"}]
         :columns-read #{{:schema "PUBLIC" :name "PEOPLE" :column "ID"}
                         {:schema "PUBLIC" :name "PEOPLE" :column "SOURCE"}}
         :ignore-case? false))

(defn- validation-refusal
  "The refusal of `validator/validate` on H2 with `args`, with its `:columns`, or nil."
  [args]
  (driver/the-initialized-driver :h2)
  (data-testing.test-util/refusal #(validator/validate :h2 args) :columns))

(def ^:private people-rows-input data-testing.test-util/people-rows-input)

(deftest missing-input-columns-test
  (testing "control: a rows input declaring every column the query reads is accepted"
    (is (nil? (validation-refusal (assoc people-test :inputs [(people-rows-input "ID" "SOURCE")])))))
  (testing "a rows input lacking a column the query reads is refused, naming the table and the column"
    (is (=? {:error-type ::errors/missing-input-columns
             :columns    {"PUBLIC.PEOPLE" ["SOURCE"]}
             :message    #"(?s).*PUBLIC\.PEOPLE: SOURCE.*"}
            (validation-refusal (assoc people-test :inputs [(people-rows-input "ID" "NAME")])))))
  (testing "on a database that keeps case, a name that differs only in case is missing; `columns` gives the table's spelling, and the message gives the input's"
    (is (=? {:error-type ::errors/missing-input-columns
             :columns    {"PUBLIC.PEOPLE" ["ID"]}
             :message    #"(?s).*ID \(declared as id, which differs in case\).*"}
            (validation-refusal (assoc people-test :inputs [(people-rows-input "id" "SOURCE")])))))
  (testing "on a database that ignores case, a name that differs only in case is the column"
    (is (nil? (validation-refusal (assoc people-test :inputs [(people-rows-input "id" "source")] :ignore-case? true)))))
  (testing "on a database that ignores case, a declared name with upper- and lower-case letters is the column"
    (is (nil? (validation-refusal (assoc people-test :inputs [(people-rows-input "Id" "Source")] :ignore-case? true)))))
  (testing "an input given as SQL declares no columns, so nothing is checked"
    (is (nil? (validation-refusal (assoc people-test :inputs [(sql-input "PUBLIC" "PEOPLE")])))))
  (testing "with no columns read, as when the parser reports an error, nothing is checked"
    (is (nil? (validation-refusal (assoc people-test :inputs [(people-rows-input "ID")] :columns-read nil))))))

(def ^:private mixed-case-test
  "A test of a query that reads `id` and `CreatedAt` of `public.events`, on a database that keeps case, such as
  Postgres."
  (assoc complete-test
         :inputs            []
         :referenced-tables #{{:schema "public" :name "events"}}
         :expectations      [{:type :empty :name "none" :sql "SELECT * FROM PEOPLE"}]
         :columns-read      #{{:schema "public" :name "events" :column "id"}
                              {:schema "public" :name "events" :column "CreatedAt"}}
         :default-schema    "public"
         :ignore-case?      false))

(defn- events-input
  [& column-names]
  (assoc (apply people-rows-input column-names) :table {:schema "public" :name "events"}))

(deftest missing-input-columns-with-mixed-case-names-test
  (testing "a column whose name has an upper-case letter is required, by the table's spelling"
    (is (=? {:error-type ::errors/missing-input-columns
             :columns    {"public.events" ["CreatedAt"]}}
            (validation-refusal (assoc mixed-case-test :inputs [(events-input "id")])))))
  (testing "control: an input that spells `CreatedAt` as the table does is accepted"
    (is (nil? (validation-refusal (assoc mixed-case-test :inputs [(events-input "id" "CreatedAt")])))))
  (testing "an input that spells its table in another case is checked against that table"
    (is (=? {:error-type ::errors/missing-input-columns
             :columns    {"PUBLIC.Events" ["CreatedAt"]}}
            (validation-refusal (assoc mixed-case-test
                                       :inputs [(assoc (events-input "id") :table {:schema "PUBLIC" :name "Events"})])))))
  (testing "of two tables read whose names differ only in case, an input is checked against both, as the rewrite replaces both with it"
    (is (=? {:error-type ::errors/missing-input-columns
             :columns    {"public.Events" ["CreatedAt"]}}
            (validation-refusal (assoc mixed-case-test
                                       :inputs       [(assoc (events-input "id") :table {:schema "public" :name "Events"})]
                                       :columns-read #{{:schema "public" :name "Events" :column "id"}
                                                       {:schema "public" :name "events" :column "CreatedAt"}}))))))
