(ns metabase-enterprise.data-testing.validator-test
  "The checks of [[validator/validate]]: declared and unused inputs, leftover references after the rewrite, table labels
  and the required expectation. Pure — no warehouse."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as errors]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
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

;;; ------------------------------------------------ Single SELECT ------------------------------------------------

(defn- single-select
  "What [[validator/ensure-single-select]] returns for `sql` on `driver`, or its refusal with `:reason` and `:detail`."
  [driver sql source]
  (driver/the-initialized-driver driver)
  (try
    (validator/ensure-single-select driver sql source)
    (catch ExceptionInfo e
      (data-testing.test-util/refusal #(throw e) :reason :detail))))

(deftest ensure-single-select-test
  (testing "a single SELECT comes back as SQLGlot rebuilt it, the string a run executes"
    (is (= "SELECT 1 AS id /* one */"
           (single-select :postgres "SELECT 1 AS id -- one" nil))))
  (testing "a second statement is refused, naming the SQL's source"
    (is (= {:error-type ::errors/not-a-single-select
            :message    (str "The SQL of input public.orders must be one SELECT statement, with nothing the SQL check "
                             "refuses: no second statement, nothing that writes or locks, no SQL hidden from the parser, "
                             "and no function that changes the session or runs SQL text.")
            :reason     "multiple-statements"}
           (single-select :postgres "SELECT 1 AS id; RESET ROLE" [:input {:schema "public" :name "orders"}]))))
  (testing "a single statement that is not a SELECT is refused"
    (is (=? {:error-type ::errors/not-a-single-select
             :message    #"^The SQL of the query under test must be one SELECT statement.*"}
            (single-select :postgres "DELETE FROM orders" nil))))
  (testing "a SELECT whose rebuild Postgres reads as two statements is refused"
    (is (= {:error-type ::errors/not-a-single-select
            :reason     "backslash-quote"}
           (select-keys (single-select :postgres "SELECT E'a\\\\' || $q$; RESET ROLE; --$q$ AS id"
                                       [:expectation "check"])
                        [:error-type :reason]))))
  (testing "a SELECT with a backslash before a quote, which Postgres reads as two statements with standard_conforming_strings off, is refused"
    (is (=? {:error-type ::errors/not-a-single-select
             :reason     "backslash-quote"}
            (single-select :postgres "SELECT replace(path, '\\', '/') AS p, ';' AS sep FROM files" nil))))
  (testing "control: an E'' string with an escaped quote is rebuilt so that it reads the same"
    (is (= "SELECT e'it''s' AS id"
           (single-select :postgres "SELECT E'it\\'s' AS id" nil))))
  (testing "a SELECT whose rebuilt E'' string ends one quote later, running `setval` that the parser read as text, is refused"
    (is (=? {:error-type ::errors/not-a-single-select
             :reason     "rebuild-differs"
             :detail     "writes-or-locks"}
            (single-select :postgres
                           "SELECT E'\\\\' || $q$' || (SELECT setval($z$s$z$, 4242))::text --$q$ AS id"
                           [:input {:schema "public" :name "orders"}]))))
  (testing "a SELECT whose CTE writes is refused"
    (is (=? {:error-type ::errors/not-a-single-select
             :reason     "writes-or-locks"}
            (single-select :postgres "WITH d AS (DELETE FROM orders RETURNING id) SELECT id FROM d" nil))))
  (testing "a SELECT calling a function that changes the session is refused"
    (is (=? {:error-type ::errors/not-a-single-select
             :reason     "session-function"}
            (single-select :postgres "SELECT set_config('role', 'postgres', false)" nil))))
  (testing "SQL that does not parse is refused, naming its source"
    (is (=? {:error-type ::errors/unparseable-source
             :message    #"(?s)^The SQL of expectation \"check\" could not be parsed: .*"}
            (single-select :postgres "SELECT (" [:expectation "check"]))))
  (testing "SQL holding a list too long to parse whole is refused, not run unchecked"
    (is (=? {:error-type ::errors/uncheckable-sql}
            (single-select :postgres
                           (str "SELECT 1 AS id WHERE 1 IN (" (str/join ", " (range 3000)) ")")
                           nil))))
  (testing "a driver with no SQLGlot dialect"
    (testing "runs a single SELECT as written"
      (is (= "SELECT 1 AS id -- one"
             (single-select :h2 "SELECT 1 AS id -- one" nil))))
    (testing "is refused a second statement"
      (is (=? {:error-type ::errors/not-a-single-select}
              (single-select :h2 "SELECT 1 AS id; DROP TABLE orders" nil))))))

(defn- parser-internals
  "The parser's own workings in `message`: SQLGlot's class names and terminal escape codes."
  [message]
  (re-seq #"<class 'sqlglot|\u001b" message))

(deftest unparseable-sql-refusal-reads-as-the-parser-diagnostic-test
  (let [sql "SELECT a FROM t WHERE ("]
    (testing "control: an expectation that does not parse is refused with the diagnostic cleaned of the parser's internals"
      (driver/the-initialized-driver :postgres)
      (let [{:keys [error-type message]}
            (data-testing.test-util/refusal
             #(validator/validate :postgres (assoc complete-test
                                                   :expectations [{:type :empty :name "check" :sql sql}])))]
        (is (= ::errors/unparseable-source error-type))
        (is (nil? (parser-internals message)) (pr-str message))))
    (testing "input SQL that does not parse is refused with the diagnostic cleaned of the parser's internals"
      (let [{:keys [error-type message]} (single-select :postgres sql [:input {:schema "public" :name "orders"}])]
        (is (= ::errors/unparseable-source error-type))
        (is (nil? (parser-internals message)) (pr-str message))))))

(deftest validate-refuses-expectation-sql-of-more-than-one-statement-test
  (testing "control: an expectation of one SELECT is accepted"
    (is (nil? (refusal (assoc complete-test :expectations [{:type :empty :name "none" :sql "SELECT * FROM PEOPLE"}])))))
  (testing "an expectation of two statements is refused as it is authored"
    (is (= ::errors/not-a-single-select
           (refusal (assoc complete-test :expectations [{:type :empty :name "none"
                                                         :sql  "SELECT * FROM PEOPLE; DROP TABLE PEOPLE"}]))))))
