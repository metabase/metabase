(ns metabase-enterprise.transforms-verification.diff-test
  "Tests for the diff engine. All tests are pure/driver-free — no Postgres, no app DB.

  Actual-rows temporals are java.time objects in production (the read-back runs
  with format-rows disabled); ISO-8601 strings are also accepted, leniently:
    :type/Date      → \"2024-03-15T00:00:00Z\" or \"2024-03-15\"
    :type/DateTime  → \"2024-01-15T10:30:00Z\" or \"2024-01-15T10:30:00\"
    :type/DateTimeWithLocalTZ → \"2024-03-15T12:00:00Z\"

  parse-fixture produces Java time objects for expected rows:
    :type/Date      → LocalDate
    :type/DateTime  → LocalDateTime
    :type/DateTimeWithTZ → OffsetDateTime

  Integer columns: actual values are java.lang.Integer or java.lang.Long.
  Integer expected values (from the int parser): java.math.BigInteger.

  The diff engine must canonicalize both sides before comparing."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-verification.diff :as diff]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.util.json :as json])
  (:import
   (java.math BigInteger)
   (java.time LocalDate LocalDateTime OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Helpers for constructing test inputs
;; ---------------------------------------------------------------------------

(defn- col
  "Build a minimal QP col descriptor."
  [name base-type]
  {:name name :base_type base-type :database_type "n/a" :source :native})

(defn- fixture
  "Build a minimal parse-fixture output."
  [columns rows]
  {:columns columns :rows rows})

(defn- schema-col
  "Build a fixture schema column descriptor."
  [name base-type]
  {:name name :base-type base-type :nullable? true})

(defn- run-diff
  "Run [[diff/diff]] with the columns declared once, as `[name type]` tuples —
  or `[name actual-type expected-type]` where the two sides' types differ.
  `opts` defaults to `{}`."
  ([cols actual-rows expected-rows]
   (run-diff cols actual-rows expected-rows {}))
  ([cols actual-rows expected-rows opts]
   (diff/diff (mapv (fn [[n actual-type _]] (col n actual-type)) cols)
              actual-rows
              (fixture (mapv (fn [[n actual-type expected-type]]
                               (schema-col n (or expected-type actual-type)))
                             cols)
                       expected-rows)
              opts)))

;; ---------------------------------------------------------------------------
;; 1. Equal multisets pass under row reordering
;; ---------------------------------------------------------------------------

(deftest ^:parallel equal-multisets-pass-reordering-test
  (testing "rows in different order → :passed"
    (let [report (run-diff [["id" :type/Integer] ["name" :type/Text]]
                           [[1 "alice"] [2 "bob"] [3 "carol"]]
                           [[2 "bob"] [3 "carol"] [1 "alice"]])]
      (is (= :passed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (empty? (:extra-rows report)))
      (is (= {:actual 3 :expected 3} (:row-counts report))))))

;; ---------------------------------------------------------------------------
;; 2. Duplicate-row multiplicity is respected
;; ---------------------------------------------------------------------------

(deftest ^:parallel duplicate-row-multiplicity-test
  (testing "two identical expected rows ≠ one actual row"
    (let [report (run-diff [["x" :type/Integer]] [[42]] [[42] [42]])]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))))
  (testing "two identical actual rows = two identical expected rows"
    (let [report (run-diff [["x" :type/Integer]] [[42] [42]] [[42] [42]])]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 3. Missing rows / extra rows / both
;; ---------------------------------------------------------------------------

(deftest ^:parallel missing-rows-test
  (testing "fewer actual rows than expected → missing-rows"
    (let [report (run-diff [["id" :type/Integer]] [[1] [2]] [[1] [2] [3]])]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (empty? (:extra-rows report))))))

(deftest ^:parallel extra-rows-test
  (testing "more actual rows than expected → extra-rows"
    (let [report (run-diff [["id" :type/Integer]] [[1] [2] [3]] [[1] [2]])]
      (is (= :failed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (= 1 (count (:extra-rows report)))))))

(deftest ^:parallel missing-and-extra-rows-test
  (testing "some missing, some extra"
    (let [report (run-diff [["id" :type/Integer]] [[1] [3] [4]] [[1] [2] [3]])]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (= 1 (count (:extra-rows report)))))))

;; ---------------------------------------------------------------------------
;; 4. Temporal gauntlet — canonicalization of QP temporal strings vs Java time objects
;; ---------------------------------------------------------------------------

(deftest ^:parallel date-column-qp-string-vs-localdate-test
  (testing "QP :type/Date returns midnight-UTC string; expected CSV parses to LocalDate → equal"
    ;; QP actual: "2024-03-15T00:00:00Z"
    ;; parse-fixture(:type/Date) produces: LocalDate/of 2024 3 15
    (let [report (run-diff [["d" :type/Date]]
                           [["2024-03-15T00:00:00Z"]]
                           [[(LocalDate/of 2024 3 15)]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel datetime-column-qp-string-vs-localdatetime-test
  (testing "QP :type/DateTime returns Z-suffixed string; expected parses to LocalDateTime → equal"
    ;; QP actual: "2024-01-15T10:30:00Z"
    ;; parse-fixture(:type/DateTime): LocalDateTime/of 2024 1 15 10 30 0
    (let [report (run-diff [["dt" :type/DateTime]]
                           [["2024-01-15T10:30:00Z"]]
                           [[(LocalDateTime/of 2024 1 15 10 30 0)]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel datetime-with-tz-vs-localdatetime-with-local-tz-test
  (testing ":type/DateTimeWithTZ and :type/DateTimeWithLocalTZ are indistinguishable after round-trip"
    ;; The QP always returns :type/DateTimeWithLocalTZ for timestamptz columns.
    ;; The diff must treat both types equivalently for coercion.
    (let [report (run-diff [["ts" :type/DateTimeWithLocalTZ :type/DateTimeWithTZ]]
                           [["2024-03-15T12:00:00Z"]]
                           [[(OffsetDateTime/of 2024 3 15 12 0 0 0 ZoneOffset/UTC)]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel tz-aware-offset-datetime-comparison-test
  (testing "OffsetDateTime with non-UTC offset equals the same instant expressed as UTC"
    ;; 2024-03-15T08:00:00-04:00 == 2024-03-15T12:00:00Z
    (let [report (run-diff [["ts" :type/DateTimeWithLocalTZ :type/DateTimeWithTZ]]
                           [["2024-03-15T12:00:00Z"]]
                           [[(OffsetDateTime/of 2024 3 15 8 0 0 0 (ZoneOffset/ofHours -4))]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel genuinely-different-timestamp-mismatch-test
  (testing "a genuinely different timestamp → mismatch reported (canonical values)"
    (let [report (run-diff [["ts" :type/DateTime]]
                           [["2024-01-15T10:30:00Z"]]
                           ;; one minute off
                           [[(LocalDateTime/of 2024 1 15 10 31 0)]])]
      (is (= :failed (:status report)))
      ;; The report must contain information about the mismatch
      ;; (either as missing/extra rows or cell mismatches)
      (is (or (seq (:missing-rows report))
              (seq (:extra-rows report))
              (seq (:cell-mismatches report)))))))

(deftest ^:parallel offset-less-temporal-strings-lenient-parse-test
  (testing "an offset-less date string parses as UTC wall time"
    (let [report (run-diff [["d" :type/Date]]
                           [["2024-03-15"]]
                           [[(LocalDate/of 2024 3 15)]])]
      (is (= :passed (:status report)))))
  (testing "an offset-less datetime string parses as UTC wall time"
    (let [report (run-diff [["dt" :type/DateTime]]
                           [["2024-01-15T10:30:00"]]
                           [[(LocalDateTime/of 2024 1 15 10 30 0)]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel unparseable-cell-typed-error-test
  (testing "an unparseable temporal value throws ::cannot-canonicalize, not a raw parse exception"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (run-diff [["d" :type/Date]]
                                   [["not-a-date"]]
                                   [[(LocalDate/of 2024 3 15)]])))]
      (is (= ::errors/cannot-canonicalize (-> e ex-data :error-type)))))
  (testing "an unconvertible numeric value throws ::cannot-canonicalize"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (run-diff [["n" :type/Integer]]
                                   [["forty-two"]]
                                   [[(BigInteger/valueOf 42)]])))]
      (is (= ::errors/cannot-canonicalize (-> e ex-data :error-type))))))

(deftest ^:parallel null-temporal-passes-test
  (testing "NULL temporal on both sides → equal"
    (let [report (run-diff [["d" :type/Date]] [[nil]] [[nil]])]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 5. Numeric rules
;; ---------------------------------------------------------------------------

(deftest ^:parallel integer-vs-long-widening-test
  (testing "Integer vs Long vs BigInteger are equal when values match"
    ;; QP may return Integer or Long; parse-fixture(:type/Integer) returns BigInteger.
    (let [report (run-diff [["n" :type/Integer]]
                           [[(int 42)] [(long 99)]]
                           [[(BigInteger/valueOf 42)] [(BigInteger/valueOf 99)]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel float-comparison-exact-test
  (testing "floats are compared exactly (after decimal normalisation): 3.0 ≠ 3.1"
    (let [report (run-diff [["f" :type/Float]] [[3.0]] [[3.1]])]
      (is (= :failed (:status report)))))
  (testing "3.0 == 3.0"
    (let [report (run-diff [["f" :type/Float]] [[3.0]] [[3.0]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel bigint-precision-above-2-53-test
  (testing "a clojure.lang.BigInt above 2^53 compares exactly (no double round-trip)"
    ;; 2^53 + 1 is the first integer a double cannot represent.
    (let [huge   (inc' (long (Math/pow 2 53)))
          report (run-diff [["n" :type/Integer]]
                           [[(bigint huge)]]
                           [[(biginteger huge)]])]
      (is (= :passed (:status report))))
    ;; ...and genuinely different huge values still mismatch.
    (let [huge   (inc' (long (Math/pow 2 53)))
          report (run-diff [["n" :type/Integer]]
                           [[(bigint huge)]]
                           [[(biginteger (inc' huge))]])]
      (is (= :failed (:status report))))))

(deftest ^:parallel truncated-counts-capped-cell-mismatches-test
  (testing ":truncated includes cell-mismatch entries beyond the cap, per its contract"
    ;; One missing/extra row pair whose rows differ in (mismatch-cap + 1) cells:
    ;; the pair produces cap+1 cell mismatches, one of which is capped away.
    (let [n      (inc diff/mismatch-cap)
          report (run-diff (mapv #(vector (str "c" %) :type/Integer) (range n))
                           [(vec (repeat n 1))]
                           [(vec (repeat n 2))])]
      (is (= :failed (:status report)))
      (is (= diff/mismatch-cap (count (:cell-mismatches report))))
      (is (= 1 (:truncated report))))))

(deftest ^:parallel decimal-scale-bigdecimal-multiset-test
  (testing "true BigDecimal values with different scales (e.g. Postgres numeric columns)
            compare equal in the multiset path — row-key strips trailing zeros"
    ;; Doubles coincidentally produce identical strings; BigDecimals with explicit
    ;; scale (3.5M vs 3.50M) are where scale-sensitivity would bite.
    (let [report (run-diff [["d" :type/Decimal]]
                           [[(java.math.BigDecimal. "3.50")]]
                           [[(java.math.BigDecimal. "3.5")]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel report-rows-are-display-values-test
  (testing "missing/extra rows in the report carry display values — never internal
            multiset keys (a genuine mismatch must show \"3.02\", row-value form)"
    (let [report (run-diff [["f" :type/Float]] [[3.0]] [[3.02]])]
      (is (= :failed (:status report)))
      (is (= [["3.02"]] (:missing-rows report)))
      (is (= [["3.0"]]  (:extra-rows report))))))

;; ---------------------------------------------------------------------------
;; 6. NULL vs empty-string (blank → nil)
;; ---------------------------------------------------------------------------

(deftest ^:parallel null-vs-nil-passes-test
  (testing "actual nil == expected nil"
    (let [report (run-diff [["s" :type/Text]] [[nil]] [[nil]])]
      (is (= :passed (:status report))))))

(deftest ^:parallel boolean-false-not-confused-with-nil-test
  (testing "false != nil — boolean false is not confused with SQL NULL"
    (let [report (run-diff [["b" :type/Boolean]] [[false]] [[nil]])]
      (is (= :failed (:status report)))))
  (testing "false == false"
    (let [report (run-diff [["b" :type/Boolean]] [[false]] [[false]])]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 7. :ignore-columns option
;; ---------------------------------------------------------------------------

(deftest ^:parallel ignore-columns-now-style-test
  (testing "an ignored column that would differ doesn't cause failure"
    ;; Simulate a now()-style column: actual has timestamps, expected has anything.
    ;; We simply ignore the column by name.
    (let [report (run-diff [["id" :type/Integer]
                            ["updated_at" :type/DateTimeWithLocalTZ :type/DateTimeWithTZ]]
                           [[1 "2024-01-01T00:00:00Z"] [2 "2024-01-02T00:00:00Z"]]
                           [[1 (OffsetDateTime/of 1999 1 1 0 0 0 0 ZoneOffset/UTC)]
                            [2 (OffsetDateTime/of 1999 1 2 0 0 0 0 ZoneOffset/UTC)]]
                           {:ignore-columns #{"updated_at"}})]
      (is (= :passed (:status report))))))

(deftest ^:parallel ignore-unknown-column-name-errors-test
  (testing "an unknown ignore-column name → error, not silent no-op"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unknown ignore-column"
         (run-diff [["id" :type/Integer]] [[1]] [[1]]
                   {:ignore-columns #{"nonexistent_col"}})))))

;; ---------------------------------------------------------------------------
;; 8. Column mismatch — detected first, row comparison skipped
;; ---------------------------------------------------------------------------

(deftest ^:parallel missing-column-test
  (testing "expected column absent from actual → :column-issues, no row comparison"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1]]
          expected    (fixture [(schema-col "id" :type/Integer)
                                (schema-col "name" :type/Text)]
                               [[1 "alice"]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (seq (:column-issues report)))
      ;; Row comparison should be skipped when columns don't align
      (is (empty? (:missing-rows report)))
      (is (empty? (:extra-rows report))))))

(deftest ^:parallel extra-column-test
  (testing "actual has a column not in expected → :column-issues"
    (let [actual-cols [(col "id" :type/Integer) (col "extra" :type/Text)]
          actual-rows [[1 "x"]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (seq (:column-issues report))))))

(deftest ^:parallel column-order-independence-test
  (testing "columns in different order (same names) → not a column mismatch"
    ;; Expected fixture has columns in a different order, but same names.
    ;; The diff should reorder both sides to match actual-cols order.
    (let [actual-cols [(col "id" :type/Integer) (col "name" :type/Text)]
          actual-rows [[1 "alice"] [2 "bob"]]
          ;; expected fixture columns in reverse order
          expected    (fixture [(schema-col "name" :type/Text)
                                (schema-col "id" :type/Integer)]
                               ;; rows also in expected column order: [name, id]
                               [["alice" 1] ["bob" 2]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report)))
      (is (empty? (:column-issues report))))))

;; ---------------------------------------------------------------------------
;; 9. Mismatch cap
;; ---------------------------------------------------------------------------

(deftest ^:parallel mismatch-cap-test
  (testing "more than cap mismatches → capped report + :truncated count"
    ;; Generate 10 rows over the cap on each side
    (let [n      (+ diff/mismatch-cap 10)
          report (run-diff [["v" :type/Integer]]
                           (mapv (fn [i] [(+ i 1000)]) (range n))
                           (mapv (fn [i] [(BigInteger/valueOf (+ i 2000))]) (range n)))]
      (is (= :failed (:status report)))
      ;; All n actual rows are "extra", all n expected are "missing"; each side is
      ;; capped at mismatch-cap and the 10-per-side overflow lands in :truncated.
      (is (= diff/mismatch-cap (count (:extra-rows report))))
      (is (= diff/mismatch-cap (count (:missing-rows report))))
      (is (= 20 (:truncated report))))))

;; ---------------------------------------------------------------------------
;; 10. Report is JSON-able (no Java objects in the report)
;; ---------------------------------------------------------------------------

(deftest ^:parallel report-is-json-able-test
  (testing "a passing report serializes without error"
    (let [report (run-diff [["id" :type/Integer] ["d" :type/Date]]
                           [[1 "2024-03-15T00:00:00Z"]]
                           [[(BigInteger/valueOf 1) (LocalDate/of 2024 3 15)]])]
      (is (= :passed (:status report)))
      ;; Should not throw
      (is (string? (json/encode report)))))
  (testing "a failing report with temporal mismatches serializes without error"
    (let [report (run-diff [["ts" :type/DateTime]]
                           [["2024-01-15T10:30:00Z"]]
                           [[(LocalDateTime/of 2024 1 15 10 31 0)]])]
      (is (= :failed (:status report)))
      (is (string? (json/encode report)))))
  (testing "a failing report with column issues serializes without error"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1]]
          expected    (fixture [(schema-col "id" :type/Integer)
                                (schema-col "name" :type/Text)]
                               [[1 "alice"]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (string? (json/encode report))))))

;; ---------------------------------------------------------------------------
;; 11. Report shape invariants
;; ---------------------------------------------------------------------------

(deftest ^:parallel report-shape-test
  (testing "all required keys present in a passing report"
    (let [report (run-diff [["x" :type/Integer]] [[1]] [[(BigInteger/valueOf 1)]])]
      (is (contains? report :status))
      (is (contains? report :column-issues))
      (is (contains? report :missing-rows))
      (is (contains? report :extra-rows))
      (is (contains? report :cell-mismatches))
      (is (contains? report :row-counts))
      (is (= {:actual 1 :expected 1} (:row-counts report)))))
  (testing "row-counts reflect actual numbers"
    (let [report (run-diff [["x" :type/Integer]]
                           [[1] [2] [3]]
                           [[(BigInteger/valueOf 1)] [(BigInteger/valueOf 2)]])]
      (is (= {:actual 3 :expected 2} (:row-counts report))))))

;; ---------------------------------------------------------------------------
;; 12. Edge cases: empty actual / empty expected
;; ---------------------------------------------------------------------------

(deftest ^:parallel empty-actual-rows-test
  (testing "no actual rows, some expected → all missing"
    (let [report (run-diff [["x" :type/Integer]] [] [[(BigInteger/valueOf 1)]])]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (empty? (:extra-rows report))))))

(deftest ^:parallel empty-expected-rows-test
  (testing "no expected rows, some actual → all extra"
    (let [report (run-diff [["x" :type/Integer]] [[1]] [])]
      (is (= :failed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (= 1 (count (:extra-rows report)))))))

(deftest ^:parallel both-empty-passes-test
  (testing "no actual rows and no expected rows → :passed"
    (let [report (run-diff [["x" :type/Integer]] [] [])]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 13. Ignore columns + multiset correctness
;; ---------------------------------------------------------------------------

(deftest ^:parallel ignore-columns-multiset-test
  (testing "ignore-columns is accounted for in multiset comparison (ignored column not part of row key)"
    ;; Two rows, same id, different timestamps — with ts ignored, both rows reduce to [1], [2]
    (let [report (run-diff [["id" :type/Integer]
                            ["ts" :type/DateTimeWithLocalTZ :type/DateTimeWithTZ]]
                           [[1 "2024-01-01T00:00:00Z"] [2 "2024-01-02T00:00:00Z"]]
                           [[1 nil] [2 nil]]
                           {:ignore-columns #{"ts"}})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; cell-mismatch entries must not have :actual-raw/:expected-raw
;; ---------------------------------------------------------------------------

(deftest ^:parallel cell-mismatch-keys-no-raw-fields-test
  (testing "cell-mismatch entry has exactly the expected keys — no :actual-raw/:expected-raw"
    (let [report     (run-diff [["ts" :type/DateTime]]
                               [["2024-01-15T10:30:00Z"]]
                               ;; one minute off → genuine mismatch → cell-mismatch entry produced
                               [[(LocalDateTime/of 2024 1 15 10 31 0)]])
          mismatches (:cell-mismatches report)]
      (is (= :failed (:status report)))
      (is (= 1 (count mismatches)))
      (let [m (first mismatches)]
        ;; Required keys
        (is (contains? m :column))
        (is (contains? m :actual-canonical))
        (is (contains? m :expected-canonical))
        ;; Absent keys
        (is (not (contains? m :actual-raw))
            ":actual-raw must be absent from cell-mismatch")
        (is (not (contains? m :expected-raw))
            ":expected-raw must be absent from cell-mismatch")
        ;; Canonical values are the UTC strings
        (is (= "2024-01-15T10:30:00Z" (:actual-canonical m)))
        (is (= "2024-01-15T10:31:00Z" (:expected-canonical m)))))))
