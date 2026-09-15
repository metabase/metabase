(ns metabase.transform-testing.expectations.equals-test
  "The `equals` expectation's two pure halves: `interpret`, over synthetic probe results, and
  `resolve-columns`, over a synthetic list of output-table column names. No warehouse."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.expectations :as expectations]
   [metabase.transform-testing.expectations.equals :as expectations.equals]
   [metabase.transform-testing.expectations.report :as expectations.report])
  (:import
   (clojure.lang ExceptionInfo)))

;;; -------------------------------------------- Harness --------------------------------------------

(def ^:private id+name
  ;; `database_type` is raw SQL text — the spelling the warehouse uses, not a Metabase base type.
  [{:name "id" :database_type "INTEGER"}
   {:name "name" :database_type "VARCHAR"}])

(defn- equals-rows
  "An `:equals` record through the front door. The generated constructors are forbidden: a record
  that skipped `expectations/expectations` is a value nothing normalized or validated."
  ([columns rows] (equals-rows "output" columns rows))
  ([expectation-name columns rows]
   (first (expectations/expectations [{:type    :equals
                                       :name    expectation-name
                                       :format  :rows
                                       :columns columns
                                       :rows    rows}]))))

(defn- interpret-comparison
  "`interpret` over a synthetic comparison probe: each row is the declared columns followed by the
  signed multiplicity."
  [comparison]
  (expectations/interpret (equals-rows id+name [{"id" 1 "name" "abc"}])
                          {:comparison comparison :actual-count [[1]]}))

(defn- resolve-cols
  [columns output-columns]
  (expectations.equals/resolve-columns (equals-rows "cols" columns []) output-columns))

(defn- caught
  "The `ExceptionInfo` thrown by `f`."
  [f]
  (let [e (try (f) nil (catch ExceptionInfo e e))]
    (is (some? e) "expected a throw")
    e))

;;; ------------------------------------------- interpret -------------------------------------------

(deftest interpret-no-differences-passes-test
  (testing "an empty comparison is a pass, with every key still present"
    ;; Full-map equality, so this also pins that the shape does not change between pass and fail:
    ;; a consumer never has to tell an absent key from an empty one.
    (is (= {:name            "output"
            :type            :equals
            :status          :passed
            :row-counts      {:actual 1 :expected 1}
            :extra-rows      []
            :missing-rows    []
            :truncated       0
            :cell-mismatches []}
           (interpret-comparison [])))))

(deftest interpret-row-counts-test
  (let [two-rows [{"id" 1 "name" "abc"} {"id" 2 "name" "def"}]
        counts   #(:row-counts (expectations/interpret (equals-rows id+name two-rows) %))]
    (testing ":expected counts the declared rows; :actual comes from the row-count probe"
      (is (= {:actual 7 :expected 2} (counts {:comparison [] :actual-count [[7]]}))))
    (testing "a probe count is coerced to a long — JDBC may hand back a BigDecimal"
      (is (= {:actual 7 :expected 2} (counts {:comparison [] :actual-count [[7M]]}))))
    (testing "a missing or empty probe falls back to 0 rather than throwing"
      (is (= {:actual 0 :expected 2} (counts {:comparison []})))
      (is (= {:actual 0 :expected 2} (counts {:comparison [] :actual-count []})))
      (is (= {:actual 0 :expected 2} (counts {:comparison [] :actual-count [[]]}))))))

(deftest interpret-multiset-expansion-test
  ;; Why the comparison is a multiset difference rather than EXCEPT: EXCEPT deduplicates, so an
  ;; output holding a row three times passes against an expectation holding it once. The delta
  ;; carries the multiplicity, and interpret expands it back to one reported row per occurrence.
  (testing "a positive delta is that many rows the output has too many"
    (let [result (interpret-comparison [[1 "abc" 3]])]
      (is (= :failed (:status result)))
      (is (= (repeat 3 {"id" 1 "name" "abc"}) (:extra-rows result)))
      (is (= [] (:missing-rows result)))
      (is (= 0 (:truncated result)))))
  (testing "a negative delta is that many rows the output has too few"
    (let [result (interpret-comparison [[2 "def" -2]])]
      (is (= :failed (:status result)))
      (is (= [] (:extra-rows result)))
      (is (= (repeat 2 {"id" 2 "name" "def"}) (:missing-rows result))))))

(deftest interpret-mixed-deltas-test
  (testing "positive and negative deltas split between the two lists, in comparison order"
    (let [result (interpret-comparison [[1 "abc" 2] [2 "def" -1] [3 "ghi" 1]])]
      (is (= [{"id" 1 "name" "abc"} {"id" 1 "name" "abc"} {"id" 3 "name" "ghi"}]
             (:extra-rows result)))
      (is (= [{"id" 2 "name" "def"}] (:missing-rows result)))
      (is (= 0 (:truncated result))))))

(deftest interpret-cell-mismatches-test
  ;; Pairing a missing row with an extra one is guesswork except when there is exactly one of each.
  ;; Sorting both sides and pairing positionally for a larger diff reads as authoritative and is
  ;; arbitrary, so nothing is reported instead.
  (testing "one against one names only the columns whose values differ"
    (let [result (interpret-comparison [[1 "abc" 1] [1 "xyz" -1]])]
      (is (= [{:column "name" :expected "xyz" :actual "abc"}] (:cell-mismatches result)))))
  ;; The key is always present; "not paired" means it is empty, never missing.
  (testing "two against two is not paired"
    (is (= [] (:cell-mismatches (interpret-comparison [[1 "abc" 2] [1 "xyz" -2]])))))
  (testing "one missing and nothing extra is not paired"
    (is (= [] (:cell-mismatches (interpret-comparison [[1 "xyz" -1]])))))
  (testing "one extra and nothing missing is not paired"
    (is (= [] (:cell-mismatches (interpret-comparison [[1 "abc" 1]])))))
  (testing "one against one differing in no column reports nothing"
    (let [result (interpret-comparison [[1 "abc" 1] [1 "abc" -1]])]
      (is (= [] (:cell-mismatches result)))
      (is (= :failed (:status result))))))

(deftest interpret-truncation-test
  (testing "each list is capped at row-cap; :truncated counts what both lists dropped"
    (let [result (interpret-comparison [[1 "abc" (+ expectations.report/row-cap 3)]
                                        [2 "def" (- (+ expectations.report/row-cap 2))]])]
      (is (= expectations.report/row-cap (count (:extra-rows result))))
      (is (= expectations.report/row-cap (count (:missing-rows result))))
      (is (= 5 (:truncated result)))
      (is (= #{{"id" 1 "name" "abc"}} (set (:extra-rows result))))
      (is (= #{{"id" 2 "name" "def"}} (set (:missing-rows result)))))))

(deftest interpret-reports-declared-column-names-test
  ;; Resolution to the warehouse's spelling builds the SQL and nothing else: a failure names the
  ;; column the way the author wrote it, which is the way they can find it in their own test.
  (let [expectation (equals-rows id+name [{"id" 1 "name" "abc"}])]
    (is (= ["ID" "NAME"] (expectations.equals/resolve-columns expectation ["ID" "NAME"])))
    (is (= [{"id" 1 "name" "abc"}]
           (:extra-rows (expectations/interpret expectation
                                                {:comparison [[1 "abc" 1]] :actual-count [[1]]}))))))

(deftest interpret-cell-rendering-test
  (testing "a BigDecimal keeps its scale"
    ;; When scale is the whole difference between expected and actual, normalizing it away makes
    ;; the report deny what it is reporting.
    (let [expectation (equals-rows [{:name "amount" :database_type "DECIMAL(10,2)"}] [{"amount" 1.5}])
          result      (expectations/interpret expectation
                                              {:comparison [[1.50M 1] [1.5M -1]] :actual-count [[1]]})]
      (is (= [{"amount" "1.50"}] (:extra-rows result)))
      (is (= [{"amount" "1.5"}] (:missing-rows result)))
      (is (= [{:column "amount" :expected "1.5" :actual "1.50"}] (:cell-mismatches result)))))
  (testing "nil stays nil"
    (is (= [{"id" 1 "name" nil}] (:extra-rows (interpret-comparison [[1 nil 1]]))))))

;;; ---------------------------------------- resolve-columns ----------------------------------------

(deftest resolve-columns-exact-match-test
  (testing "an exact match wins over a case-insensitive one, whatever the order"
    (is (= ["id"] (resolve-cols [{:name "id" :database_type "INTEGER"}] ["ID" "id"])))
    (is (= ["ID"] (resolve-cols [{:name "ID" :database_type "INTEGER"}] ["ID" "id"])))))

(deftest resolve-columns-case-insensitive-test
  (testing "H2 and Snowflake fold an unquoted identifier up"
    (is (= ["ID" "NAME"] (resolve-cols id+name ["ID" "NAME"]))))
  (testing "Postgres folds it down"
    (is (= ["id" "name"] (resolve-cols [{:name "ID" :database_type "INTEGER"}
                                        {:name "NAME" :database_type "VARCHAR"}]
                                       ["id" "name"])))))

(deftest resolve-columns-preserves-declared-order-test
  (testing "resolved names come back in the order the author declared, not the table's"
    (is (= ["NAME" "ID"] (resolve-cols [{:name "name" :database_type "VARCHAR"}
                                        {:name "id" :database_type "INTEGER"}]
                                       ["ID" "NAME"])))))

(deftest resolve-columns-unknown-column-test
  (testing "a column the output does not have is refused, listing what it does have"
    (let [e (caught #(resolve-cols [{:name "nope" :database_type "INTEGER"}] ["id" "name"]))]
      (is (= ::transform-testing.errors/unknown-column (:error-type (ex-data e))))
      (is (= {:expectation "cols" :column "nope" :available ["id" "name"]}
             (dissoc (ex-data e) :error-type)))
      (is (re-find #"compares column \"nope\"" (ex-message e)))
      (is (re-find #"It has: id, name" (ex-message e))))))

(deftest resolve-columns-ambiguous-case-test
  ;; The output has both `id` and `ID`; `Id` matches neither exactly and both case-insensitively.
  ;; Ambiguity is its own refusal: reporting it as unknown-column would tell the author the output
  ;; "does not have" a column it arguably has twice over, and send them hunting for a typo.
  (testing "two case-insensitive matches refuse rather than pick one"
    (let [e (caught #(resolve-cols [{:name "Id" :database_type "INTEGER"}] ["id" "ID"]))]
      (is (= ::transform-testing.errors/ambiguous-column (:error-type (ex-data e))))
      (is (= {:expectation "cols" :column "Id" :candidates ["id" "ID"]}
             (dissoc (ex-data e) :error-type)))
      (is (re-find #"matches more than one output column: id, ID" (ex-message e))))))

(deftest resolve-columns-unsafe-identifier-test
  ;; The backstop is on the RESOLVED name — what actually reaches the SQL as an identifier. A dot
  ;; would compile to a table qualifier, so `a.b` would silently compare some other table's column.
  (testing "a resolved name that cannot be written as one identifier is refused"
    (let [e (caught #(resolve-cols [{:name "a.b" :database_type "INTEGER"}] ["a.b"]))]
      (is (= ::transform-testing.errors/unsafe-identifier (:error-type (ex-data e))))
      (is (= {:expectation "cols" :column "a.b"} (dissoc (ex-data e) :error-type)))
      (is (re-find #"cannot be compared because it contains a dot" (ex-message e)))))
  (testing "the backstop reads the output's spelling, not the author's"
    (let [e (caught #(resolve-cols [{:name "A.B" :database_type "INTEGER"}] ["a.b"]))]
      (is (= "a.b" (:column (ex-data e)))))))

;;; ------------------------------------------- EqualsSql -------------------------------------------

(deftest equals-sql-is-unimplemented-test
  (testing "the sql form builds, then refuses to produce probes"
    (let [expectation (first (expectations/expectations [{:type   :equals
                                                          :name   "sql form"
                                                          :format :sql
                                                          :sql    "SELECT 1"}]))
          e           (caught #(expectations/probes expectation
                                                    {:driver         :h2
                                                     :output-table   "t"
                                                     :output-columns ["id"]
                                                     :replacements   {}}))]
      ;; Its own type, not an authoring error: the expectation is well-formed, the feature is
      ;; simply not built. The author is told which form to use instead.
      (is (= ::transform-testing.errors/unsupported-format (:error-type (ex-data e))))
      (is (= {:expectation "sql form" :format :sql} (dissoc (ex-data e) :error-type)))
      (is (re-find #"not implemented yet" (ex-message e)))
      (is (re-find #"columns" (ex-message e)))
      (is (re-find #"rows" (ex-message e))))))
