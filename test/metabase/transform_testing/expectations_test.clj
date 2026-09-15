(ns metabase.transform-testing.expectations-test
  "The front door: `expectations` is the only sanctioned way to build an expectation, and holding a
  record is supposed to be proof that normalization, schema validation, type dispatch and the
  unique-name check all ran. These tests pin that claim and mark where it leaks. Pure — no
  warehouse, no app DB."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.expectations :as expectations]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.schema :as transform-testing.schema]))

;;; -------------------------------------------- Harness --------------------------------------------

(defn- equals-rows
  "The wire form of an `equals`/`rows` expectation: string keys and string values, as JSON delivers it."
  ([nm]
   (equals-rows nm [{"name" "id" "database_type" "INTEGER"}] [{"id" 1}]))
  ([nm columns rows]
   {"type" "equals" "name" nm "format" "rows" "columns" columns "rows" rows}))

(defn- empty-sql
  "The wire form of an `empty` expectation."
  [nm]
  {"type" "empty" "name" nm "sql" "SELECT 1 FROM out WHERE id IS NULL"})

(defn- refusal
  "What building `raw` threw: `{:error-type :message :data}`, or `::no-refusal` when it built."
  [raw]
  (try
    (expectations/expectations raw)
    ::no-refusal
    (catch clojure.lang.ExceptionInfo e
      {:error-type (:error-type (ex-data e))
       :message    (ex-message e)
       :data       (ex-data e)})))

(defn- record-name
  "The simple class name of `x` — how a test names the record type it expected."
  [x]
  (.getSimpleName (class x)))

;;; ------------------------------------- Building from the wire form -------------------------------------

(deftest build-from-wire-form-test
  (testing "a string-keyed, string-valued equals/rows map builds an EqualsRows"
    (let [[r] (expectations/expectations [(equals-rows "n")])]
      (is (record? r))
      (is (= "EqualsRows" (record-name r)))))
  (testing "an empty expectation builds an Empty"
    (let [[r] (expectations/expectations [(empty-sql "n")])]
      (is (= "Empty" (record-name r)))))
  (testing "an equals/sql expectation builds an EqualsSql"
    (let [[r] (expectations/expectations [{"type" "equals" "name" "n" "format" "sql"
                                           "sql"  "SELECT 1"}])]
      (is (= "EqualsSql" (record-name r))))))

(deftest normalization-test
  (let [[r] (expectations/expectations
             [(equals-rows "n"
                           [{"name" "2024" "database_type" "INTEGER"}
                            {"name" "order-id" "database_type" "VARCHAR(255)"}]
                           [{"2024" 1 "order-id" "abc"}
                            {"2024" 2 "order-id" nil}])])]
    (testing ":type and :format become keywords"
      (is (= :equals (:type r)))
      (is (= :rows (:format r)))
      (is (= "n" (:name r))))
    (testing "column map keys become keywords, and :database_type keeps its snake_case spelling"
      (is (= [{:name "2024" :database_type "INTEGER"}
              {:name "order-id" :database_type "VARCHAR(255)"}]
             (:columns r))))
    (testing "row keys stay STRINGS — a warehouse column can be named 2024 or order-id, and
              keywordizing them would corrupt the data being compared"
      (is (= [{"2024" 1 "order-id" "abc"}
              {"2024" 2 "order-id" nil}]
             (:rows r)))
      (is (every? string? (mapcat keys (:rows r)))))))

(deftest row-keys-restringified-test
  (testing "rows read back keywordized from the app DB's JSON column are re-stringified"
    (let [[r] (expectations/expectations
               [{"type"    "equals" "name" "n" "format" "rows"
                 "columns" [{"name" "id" "database_type" "INTEGER"}]
                 "rows"    [{:id 1}]}])]
      (is (= [{"id" 1}] (:rows r))))))

;;; ------------------------------------ The protocol as discriminator ------------------------------------

(deftest satisfies-protocol-test
  (testing "every record the front door builds satisfies Expectation"
    (doseq [raw [(equals-rows "n")
                 (empty-sql "n")
                 {"type" "equals" "name" "n" "format" "sql" "sql" "SELECT 1"}]]
      (let [[r] (expectations/expectations [raw])]
        (is (satisfies? expectations.protocol/Expectation r)
            (record-name r)))))
  (testing "the equivalent plain map does not — this is what business logic asserts on"
    (doseq [raw [(equals-rows "n") (empty-sql "n")]]
      (let [[r] (expectations/expectations [raw])]
        (is (not (satisfies? expectations.protocol/Expectation (into {} r))))))))

;;; ----------------------------------- Ways the record type is lost -----------------------------------

(deftest record-type-loss-test
  ;; Known behavior, pinned rather than endorsed. `lib/normalize` strips the type the same way,
  ;; which is why normalization runs BEFORE construction and nowhere after it.
  (let [[r] (expectations/expectations [(equals-rows "n")])]
    (testing "(into {} rec) yields a plain map"
      (is (not (record? (into {} r))))
      (is (not (satisfies? expectations.protocol/Expectation (into {} r)))))
    (testing "select-keys yields a plain map"
      (is (not (satisfies? expectations.protocol/Expectation (select-keys r [:type :name])))))
    (testing "dissoc of a DECLARED field yields a plain map"
      (is (not (record? (dissoc r :rows))))
      (is (not (satisfies? expectations.protocol/Expectation (dissoc r :rows)))))
    (testing "assoc of an UNDECLARED key keeps the record"
      (is (record? (assoc r :something-else 1)))
      (is (satisfies? expectations.protocol/Expectation (assoc r :something-else 1))))
    (testing "assoc over a declared field also keeps it"
      (is (satisfies? expectations.protocol/Expectation (assoc r :name "other"))))))

(deftest normalize-strips-the-record-test
  (testing "normalizing an already-built expectation silently downgrades it to a plain map"
    (let [[r]        (expectations/expectations [(equals-rows "n")])
          normalized (lib/normalize ::transform-testing.schema/expectation r)]
      (is (map? normalized))
      (is (not (record? normalized)))
      (is (not (satisfies? expectations.protocol/Expectation normalized))))))

;;; --------------------------------------------- Refusals ---------------------------------------------

(deftest duplicate-name-test
  (testing "two expectations sharing a name are refused, and the message names the repeat"
    (let [{:keys [error-type message data]} (refusal [(equals-rows "dup") (empty-sql "dup")])]
      (is (= ::transform-testing.errors/duplicate-expectation-name error-type))
      (is (= ["dup"] (:duplicate-names data)))
      (is (str/includes? message "dup")))))

(deftest duplicate-name-among-three-test
  (testing "with three expectations, only the repeated name is listed"
    (let [{:keys [error-type message data]} (refusal [(equals-rows "solo-a")
                                                      (equals-rows "dup")
                                                      (empty-sql "dup")])]
      (is (= ::transform-testing.errors/duplicate-expectation-name error-type))
      (is (= ["dup"] (:duplicate-names data)))
      (is (not (str/includes? message "solo-a"))))))

(deftest unknown-type-test
  ;; The type is checked ahead of the schema. Left to malli, an unrecognized :type fails the
  ;; multi-schema — which has no default branch — and the author gets an explain blob describing
  ;; every branch it did not match, rather than the one fact that helps.
  (testing "an unknown :type is named, and the known ones are listed"
    (let [{:keys [error-type message]} (refusal [{"type" "bogus" "name" "n" "sql" "SELECT 1"}])]
      (is (= ::transform-testing.errors/unknown-expectation-type error-type))
      (is (re-find #"bogus" message))
      (is (re-find #"Known types: empty, equals" message))))
  (testing "an unknown :format within a known :type is likewise a schema refusal"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [{"type" "equals" "name" "n" "format" "csv" "sql" "SELECT 1"}]))))))

(deftest schema-invalid-test
  (testing "equals/rows without :columns"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [{"type" "equals" "name" "n" "format" "rows" "rows" [{"id" 1}]}])))))
  (testing "a blank :name"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [(equals-rows "")])))))
  (testing "a missing :name"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [(dissoc (equals-rows "n") "name")])))))
  (testing "an empty expectation without :sql"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [(dissoc (empty-sql "n") "sql")])))))
  (testing "an undeclared extra key — the schemas are closed"
    (is (= ::transform-testing.errors/invalid-expectation
           (:error-type (refusal [(assoc (equals-rows "n") "limit" 10)])))))
  (testing "something that is not a map at all"
    (let [{:keys [error-type message data]} (refusal ["SELECT 1"])]
      (is (= ::transform-testing.errors/invalid-expectation error-type))
      ;; The message names what the author wrote. Normalizing a non-map yields nil, so explaining
      ;; the normalized value would report that `nil` is invalid and leave them hunting.
      (is (re-find #"SELECT 1" message))
      (is (not (re-find #"received: nil" message)))
      (is (= "SELECT 1" (:expectation data))))))

(deftest database-type-is-not-checked-at-construction-test
  ;; A cast target cannot be a bound parameter, so `database_type` is the one piece of author text
  ;; that reaches the SQL as text — but it is checked where it becomes SQL, in
  ;; `compile/rows-relation`, not here. Two reasons, and the second is why this test exists rather
  ;; than the opposite one: a check at the splice cannot be bypassed by a future caller, and
  ;; reading a stored test IS construction, so refusing here would make an already-saved test
  ;; unreadable rather than merely unrunnable.
  (testing "a type that could escape its cast still builds; the refusal comes later"
    (doseq [db-type ["INT) FROM x; --" "INTEGER; DROP TABLE t" "INT\"" "INT/*x*/"]]
      (is (record? (first (expectations/expectations
                           [(equals-rows "n" [{"name" "id" "database_type" db-type}] [{"id" 1}])])))
          db-type)))
  (testing "and an ordinary type name builds too"
    (doseq [db-type ["INTEGER" "varchar(255)" "DECIMAL(10, 2)" "TIMESTAMP WITH TIME ZONE" "INT[]"]]
      (is (record? (first (expectations/expectations
                           [(equals-rows "n" [{"name" "id" "database_type" db-type}] [{"id" 1}])])))
          db-type))))

;;; ------------------------------------------ Shape of the result ------------------------------------------

(deftest order-preserved-test
  (testing "the returned vector is in declared order"
    (let [raw (mapv equals-rows ["c" "a" "b"])]
      (is (= ["c" "a" "b"] (mapv :name (expectations/expectations raw))))))
  (testing "order holds across mixed types"
    (is (= ["one" "two" "three"]
           (mapv :name (expectations/expectations [(equals-rows "one") (empty-sql "two") (equals-rows "three")]))))))

(deftest empty-input-test
  (testing "no expectations is not an error"
    (is (= [] (expectations/expectations [])))))

;;; --------------------------------------------- Re-exports ---------------------------------------------

(deftest re-exports-test
  (testing "probes and interpret resolve in the front door"
    (is (some? (resolve 'metabase.transform-testing.expectations/probes)))
    (is (some? (resolve 'metabase.transform-testing.expectations/interpret))))
  (testing "and are the same protocol functions as in the protocol namespace"
    (is (identical? expectations.protocol/probes expectations/probes))
    (is (identical? expectations.protocol/interpret expectations/interpret)))
  (testing "the re-export dispatches to the record's own implementation"
    (let [[r] (expectations/expectations [(empty-sql "n")])]
      (is (= {:name "n" :type :empty :status :passed}
             (expectations/interpret r {:rows []}))))))

;;; ------------------------------- Where the proof-of-validation claim leaks -------------------------------

(deftest equals-sql-is-accepted-but-cannot-run-test
  ;; A record is built, satisfies the protocol, and throws the moment anyone asks it for probes.
  ;; Holding this record proves it passed the schema; it does not prove it is runnable.
  (testing "equals/sql builds, then refuses at probe time as not implemented"
    (let [[r] (expectations/expectations [{"type" "equals" "name" "n" "format" "sql" "sql" "SELECT 1"}])]
      (is (satisfies? expectations.protocol/Expectation r))
      (is (= ::transform-testing.errors/unsupported-format
             (try (expectations/probes r nil)
                  ::no-refusal
                  (catch clojure.lang.ExceptionInfo e (:error-type (ex-data e)))))))))

(deftest column-name-guard-is-deferred-test
  ;; Unlike database_type, a declared COLUMN NAME is not checked when the record is built — the
  ;; identifier check happens in `resolve-columns` at probe time, against the output table.
  (testing "a column name SQL could not carry as one identifier is accepted at construction"
    (doseq [column-name ["a.b" "x\"y" "p;q"]]
      (is (record? (first (expectations/expectations
                           [(equals-rows "n"
                                         [{"name" column-name "database_type" "INTEGER"}]
                                         [{column-name 1}])])))
          column-name))))
