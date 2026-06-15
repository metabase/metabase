(ns metabase.transforms.test-run.diff-test
  "Tests for the diff engine. All tests are pure/driver-free — no Postgres, no app DB.

  QP actual-rows contain temporals as ISO-8601 Z strings (per Step 0a):
    :type/Date      → \"2024-03-15T00:00:00Z\"
    :type/DateTime  → \"2024-01-15T10:30:00Z\"
    :type/DateTimeWithLocalTZ → \"2024-03-15T12:00:00Z\"

  Step-1 parse-fixture produces Java time objects for expected rows:
    :type/Date      → LocalDate
    :type/DateTime  → LocalDateTime
    :type/DateTimeWithTZ → OffsetDateTime

  Integer columns: actual values are java.lang.Integer or java.lang.Long.
  Integer expected values (from Step 1 int parser): java.math.BigInteger.

  The diff engine must canonicalize both sides before comparing."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.transforms.test-run.diff :as diff]
   [metabase.util.json :as json])
  (:import
   (java.math BigInteger)
   (java.time LocalDate LocalDateTime OffsetDateTime ZoneOffset)))

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

;; ---------------------------------------------------------------------------
;; 1. Equal multisets pass under row reordering
;; ---------------------------------------------------------------------------

(deftest equal-multisets-pass-reordering-test
  (testing "rows in different order → :passed"
    (let [actual-cols [(col "id" :type/Integer) (col "name" :type/Text)]
          actual-rows [[1 "alice"] [2 "bob"] [3 "carol"]]
          expected    (fixture [(schema-col "id" :type/Integer) (schema-col "name" :type/Text)]
                               [[2 "bob"] [3 "carol"] [1 "alice"]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (empty? (:extra-rows report)))
      (is (= {:actual 3 :expected 3} (:row-counts report))))))

;; ---------------------------------------------------------------------------
;; 2. Duplicate-row multiplicity is respected
;; ---------------------------------------------------------------------------

(deftest duplicate-row-multiplicity-test
  (testing "two identical expected rows ≠ one actual row"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows [[42]]
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [[42] [42]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))))
  (testing "two identical actual rows = two identical expected rows"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows [[42] [42]]
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [[42] [42]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 3. Missing rows / extra rows / both
;; ---------------------------------------------------------------------------

(deftest missing-rows-test
  (testing "fewer actual rows than expected → missing-rows"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1] [2]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1] [2] [3]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (empty? (:extra-rows report))))))

(deftest extra-rows-test
  (testing "more actual rows than expected → extra-rows"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1] [2] [3]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1] [2]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (= 1 (count (:extra-rows report)))))))

(deftest missing-and-extra-rows-test
  (testing "some missing, some extra"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1] [3] [4]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1] [2] [3]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (= 1 (count (:extra-rows report)))))))

;; ---------------------------------------------------------------------------
;; 4. Temporal gauntlet — the core of Step 5's trust-eroder defence
;; ---------------------------------------------------------------------------

(deftest date-column-qp-string-vs-localdate-test
  (testing "QP :type/Date returns midnight-UTC string; expected CSV parses to LocalDate → EQUAL"
    ;; QP actual: "2024-03-15T00:00:00Z" (the Step-0a SURPRISE 3 behaviour)
    ;; Step-1 parse-fixture(:type/Date) produces: LocalDate/of 2024 3 15
    (let [actual-cols [(col "d" :type/Date)]
          actual-rows [["2024-03-15T00:00:00Z"]]
          expected    (fixture [(schema-col "d" :type/Date)]
                               [[(LocalDate/of 2024 3 15)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest datetime-column-qp-string-vs-localdatetime-test
  (testing "QP :type/DateTime returns Z-suffixed string; expected parses to LocalDateTime → EQUAL"
    ;; QP actual: "2024-01-15T10:30:00Z"
    ;; Step-1 parse-fixture(:type/DateTime): LocalDateTime/of 2024 1 15 10 30 0
    (let [actual-cols [(col "dt" :type/DateTime)]
          actual-rows [["2024-01-15T10:30:00Z"]]
          expected    (fixture [(schema-col "dt" :type/DateTime)]
                               [[(LocalDateTime/of 2024 1 15 10 30 0)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest datetime-with-tz-vs-localdatetime-with-local-tz-test
  (testing ":type/DateTimeWithTZ and :type/DateTimeWithLocalTZ are indistinguishable after round-trip"
    ;; The QP always returns :type/DateTimeWithLocalTZ for timestamptz columns.
    ;; The diff must treat both types equivalently for coercion.
    (let [actual-cols [(col "ts" :type/DateTimeWithLocalTZ)]
          actual-rows [["2024-03-15T12:00:00Z"]]
          expected    (fixture [(schema-col "ts" :type/DateTimeWithTZ)]
                               [[(OffsetDateTime/of 2024 3 15 12 0 0 0 ZoneOffset/UTC)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest tz-aware-offset-datetime-comparison-test
  (testing "OffsetDateTime with non-UTC offset equals the same instant expressed as UTC"
    ;; 2024-03-15T08:00:00-04:00 == 2024-03-15T12:00:00Z
    (let [actual-cols [(col "ts" :type/DateTimeWithLocalTZ)]
          actual-rows [["2024-03-15T12:00:00Z"]]
          expected    (fixture [(schema-col "ts" :type/DateTimeWithTZ)]
                               [[(OffsetDateTime/of 2024 3 15 8 0 0 0 (ZoneOffset/ofHours -4))]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest genuinely-different-timestamp-mismatch-test
  (testing "a genuinely different timestamp → mismatch showing raw + canonical values"
    (let [actual-cols [(col "ts" :type/DateTime)]
          actual-rows [["2024-01-15T10:30:00Z"]]
          expected    (fixture [(schema-col "ts" :type/DateTime)]
                               ;; one minute off
                               [[(LocalDateTime/of 2024 1 15 10 31 0)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      ;; The report must contain information about the mismatch
      ;; (either as missing/extra rows or cell mismatches)
      (is (or (seq (:missing-rows report))
              (seq (:extra-rows report))
              (seq (:cell-mismatches report)))))))

(deftest null-temporal-passes-test
  (testing "NULL temporal on both sides → EQUAL"
    (let [actual-cols [(col "d" :type/Date)]
          actual-rows [[nil]]
          expected    (fixture [(schema-col "d" :type/Date)]
                               [[nil]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 5. Numeric rules
;; ---------------------------------------------------------------------------

(deftest decimal-scale-35-vs-350-test
  (testing "3.5 == 3.50 (scale-independent decimal comparison)"
    (let [actual-cols [(col "amount" :type/Float)]
          ;; QP returns a Double
          actual-rows [[3.5]]
          ;; Step-1 parse-fixture(:type/Float) returns a Java Number (Double via NumberFormat)
          expected    (fixture [(schema-col "amount" :type/Float)]
                               [[3.50]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest integer-vs-long-widening-test
  (testing "Integer vs Long vs BigInteger are equal when values match"
    (let [actual-cols [(col "n" :type/Integer)]
          ;; QP may return Integer or Long
          actual-rows [[(int 42)] [(long 99)]]
          ;; Step-1 parse-fixture(:type/Integer) returns BigInteger
          expected    (fixture [(schema-col "n" :type/Integer)]
                               [[(BigInteger/valueOf 42)] [(BigInteger/valueOf 99)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest float-tolerance-exact-by-default-test
  (testing "without :float-tolerance, floats are compared exactly (after decimal normalisation)"
    (let [actual-cols [(col "f" :type/Float)]
          actual-rows [[3.0]]
          expected    (fixture [(schema-col "f" :type/Float)]
                               [[3.1]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))))
  (testing "without :float-tolerance, 3.0 == 3.0"
    (let [actual-cols [(col "f" :type/Float)]
          actual-rows [[3.0]]
          expected    (fixture [(schema-col "f" :type/Float)]
                               [[3.0]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest float-tolerance-option-removed-test
  (testing ":float-tolerance was removed (decision 2026-06-11) — passing it throws,
            never silently ignores (the option must not appear to work)"
    (let [actual-cols [(col "f" :type/Float)]
          actual-rows [[3.0]]
          expected    (fixture [(schema-col "f" :type/Float)]
                               [[3.0]])
          e           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"float-tolerance was removed"
                                            (diff/diff actual-cols actual-rows expected
                                                       {:float-tolerance 0.01})))]
      (is (= ::diff/unsupported-option (-> e ex-data :error-type))))))

(deftest decimal-scale-bigdecimal-multiset-test
  (testing "true BigDecimal values with different scales (e.g. Postgres numeric columns)
            compare equal in the multiset path — row-key strips trailing zeros"
    ;; Doubles coincidentally produce identical strings; BigDecimals with explicit
    ;; scale (3.5M vs 3.50M) are where scale-sensitivity would bite.
    (let [actual-cols [(col "d" :type/Decimal)]
          actual-rows [[(java.math.BigDecimal. "3.50")]]
          expected    (fixture [(schema-col "d" :type/Decimal)]
                               [[(java.math.BigDecimal. "3.5")]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest report-rows-are-display-values-test
  (testing "missing/extra rows in the report carry display values — never internal
            multiset keys (a genuine mismatch must show \"3.02\", row-value form)"
    (let [actual-cols [(col "f" :type/Float)]
          actual-rows [[3.0]]
          expected    (fixture [(schema-col "f" :type/Float)]
                               [[3.02]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (= [["3.02"]] (:missing-rows report)))
      (is (= [["3.0"]]  (:extra-rows report))))))

;; ---------------------------------------------------------------------------
;; 6. NULL vs empty-string (Step 1 rule: blank → nil)
;; ---------------------------------------------------------------------------

(deftest null-vs-nil-passes-test
  (testing "actual nil == expected nil"
    (let [actual-cols [(col "s" :type/Text)]
          actual-rows [[nil]]
          expected    (fixture [(schema-col "s" :type/Text)]
                               [[nil]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

(deftest boolean-false-not-confused-with-nil-test
  (testing "false != nil — boolean false is not confused with SQL NULL"
    (let [actual-cols [(col "b" :type/Boolean)]
          actual-rows [[false]]
          expected    (fixture [(schema-col "b" :type/Boolean)]
                               [[nil]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))))
  (testing "false == false"
    (let [actual-cols [(col "b" :type/Boolean)]
          actual-rows [[false]]
          expected    (fixture [(schema-col "b" :type/Boolean)]
                               [[false]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 7. :ignore-columns option
;; ---------------------------------------------------------------------------

(deftest ignore-columns-now-style-test
  (testing "an ignored column that would differ doesn't cause failure"
    ;; Simulate a now()-style column: actual has timestamps, expected has anything.
    ;; We simply ignore the column by name.
    (let [actual-cols [(col "id" :type/Integer) (col "updated_at" :type/DateTimeWithLocalTZ)]
          actual-rows [[1 "2024-01-01T00:00:00Z"] [2 "2024-01-02T00:00:00Z"]]
          expected    (fixture [(schema-col "id" :type/Integer)
                                (schema-col "updated_at" :type/DateTimeWithTZ)]
                               [[1 (OffsetDateTime/of 1999 1 1 0 0 0 0 ZoneOffset/UTC)]
                                [2 (OffsetDateTime/of 1999 1 2 0 0 0 0 ZoneOffset/UTC)]])
          report      (diff/diff actual-cols actual-rows expected {:ignore-columns #{"updated_at"}})]
      (is (= :passed (:status report))))))

(deftest ignore-unknown-column-name-errors-test
  (testing "an unknown ignore-column name → error, not silent no-op"
    (let [actual-cols [(col "id" :type/Integer)]
          actual-rows [[1]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1]])]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unknown ignore-column"
           (diff/diff actual-cols actual-rows expected {:ignore-columns #{"nonexistent_col"}}))))))

;; ---------------------------------------------------------------------------
;; 8. Column mismatch — detected first, row comparison skipped
;; ---------------------------------------------------------------------------

(deftest missing-column-test
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

(deftest extra-column-test
  (testing "actual has a column not in expected → :column-issues"
    (let [actual-cols [(col "id" :type/Integer) (col "extra" :type/Text)]
          actual-rows [[1 "x"]]
          expected    (fixture [(schema-col "id" :type/Integer)]
                               [[1]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (seq (:column-issues report))))))

(deftest column-order-independence-test
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

(deftest mismatch-cap-test
  (testing "more than cap mismatches → capped report + :truncated count"
    ;; Generate 60 mismatching rows (cap is 50)
    (let [n           60
          actual-cols [(col "v" :type/Integer)]
          actual-rows  (mapv (fn [i] [(+ i 1000)]) (range n))
          expected     (fixture [(schema-col "v" :type/Integer)]
                                (mapv (fn [i] [(BigInteger/valueOf (+ i 2000))]) (range n)))
          report       (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      ;; All 60 actual rows are "extra", all 60 expected are "missing"
      ;; But extra/missing are capped at 50 + truncated
      (let [extra-count   (count (:extra-rows report))
            missing-count (count (:missing-rows report))
            truncated     (:truncated report)]
        (is (<= extra-count 50))
        (is (<= missing-count 50))
        (is (some? truncated))
        (is (pos? truncated))))))

;; ---------------------------------------------------------------------------
;; 10. Report is JSON-able (no Java objects in the report)
;; ---------------------------------------------------------------------------

(deftest report-is-json-able-test
  (testing "a passing report serializes without error"
    (let [actual-cols [(col "id" :type/Integer) (col "d" :type/Date)]
          actual-rows [[1 "2024-03-15T00:00:00Z"]]
          expected    (fixture [(schema-col "id" :type/Integer)
                                (schema-col "d" :type/Date)]
                               [[(BigInteger/valueOf 1) (LocalDate/of 2024 3 15)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report)))
      ;; Should not throw
      (is (string? (json/encode report)))))
  (testing "a failing report with temporal mismatches serializes without error"
    (let [actual-cols [(col "ts" :type/DateTime)]
          actual-rows [["2024-01-15T10:30:00Z"]]
          expected    (fixture [(schema-col "ts" :type/DateTime)]
                               [[(LocalDateTime/of 2024 1 15 10 31 0)]])
          report      (diff/diff actual-cols actual-rows expected {})]
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

(deftest report-shape-test
  (testing "all required keys present in a passing report"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows [[1]]
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [[(BigInteger/valueOf 1)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (contains? report :status))
      (is (contains? report :column-issues))
      (is (contains? report :missing-rows))
      (is (contains? report :extra-rows))
      (is (contains? report :cell-mismatches))
      (is (contains? report :row-counts))
      (is (= {:actual 1 :expected 1} (:row-counts report)))))
  (testing "row-counts reflect actual numbers"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows [[1] [2] [3]]
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [[(BigInteger/valueOf 1)] [(BigInteger/valueOf 2)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= {:actual 3 :expected 2} (:row-counts report))))))

;; ---------------------------------------------------------------------------
;; 12. Edge cases: empty actual / empty expected
;; ---------------------------------------------------------------------------

(deftest empty-actual-rows-test
  (testing "no actual rows, some expected → all missing"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows []
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [[(BigInteger/valueOf 1)]])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (= 1 (count (:missing-rows report))))
      (is (empty? (:extra-rows report))))))

(deftest empty-expected-rows-test
  (testing "no expected rows, some actual → all extra"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows [[1]]
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :failed (:status report)))
      (is (empty? (:missing-rows report)))
      (is (= 1 (count (:extra-rows report)))))))

(deftest both-empty-passes-test
  (testing "no actual rows and no expected rows → :passed"
    (let [actual-cols [(col "x" :type/Integer)]
          actual-rows []
          expected    (fixture [(schema-col "x" :type/Integer)]
                               [])
          report      (diff/diff actual-cols actual-rows expected {})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 13. Ignore columns + multiset correctness
;; ---------------------------------------------------------------------------

(deftest ignore-columns-multiset-test
  (testing "ignore-columns is accounted for in multiset comparison (ignored column not part of row key)"
    (let [actual-cols [(col "id" :type/Integer) (col "ts" :type/DateTimeWithLocalTZ)]
          ;; Two rows, same id, different timestamps — with ts ignored, both rows reduce to [1], [2]
          actual-rows [[1 "2024-01-01T00:00:00Z"] [2 "2024-01-02T00:00:00Z"]]
          expected    (fixture [(schema-col "id" :type/Integer)
                                (schema-col "ts" :type/DateTimeWithTZ)]
                               [[1 nil] [2 nil]])
          report      (diff/diff actual-cols actual-rows expected {:ignore-columns #{"ts"}})]
      (is (= :passed (:status report))))))

;; ---------------------------------------------------------------------------
;; 14. Regression — Major-2: cell-mismatch entries must NOT have :actual-raw/:expected-raw
;; ---------------------------------------------------------------------------

(deftest cell-mismatch-keys-no-raw-fields-test
  ;; Major-2 regression: attempt-cell-mismatches was passing canonical rows as both
  ;; the canonical AND raw arguments to cell-mismatch-detail, so :actual-raw and
  ;; :expected-raw were always equal to their canonical counterparts.  The fix drops
  ;; those fields entirely from the cell-mismatch entry.
  (testing "cell-mismatch entry has exactly the expected keys — no :actual-raw/:expected-raw"
    (let [actual-cols [(col "ts" :type/DateTime)]
          actual-rows [["2024-01-15T10:30:00Z"]]
          expected    (fixture [(schema-col "ts" :type/DateTime)]
                               ;; one minute off → genuine mismatch → cell-mismatch entry produced
                               [[(LocalDateTime/of 2024 1 15 10 31 0)]])
          report      (diff/diff actual-cols actual-rows expected {})
          mismatches  (:cell-mismatches report)]
      (is (= :failed (:status report)))
      (is (= 1 (count mismatches)))
      (let [m (first mismatches)]
        ;; Required keys
        (is (contains? m :column))
        (is (contains? m :actual-canonical))
        (is (contains? m :expected-canonical))
        ;; Removed keys — Major-2 fix
        (is (not (contains? m :actual-raw))
            ":actual-raw must be absent from cell-mismatch (Major-2 fix)")
        (is (not (contains? m :expected-raw))
            ":expected-raw must be absent from cell-mismatch (Major-2 fix)")
        ;; Canonical values are the UTC strings
        (is (= "2024-01-15T10:30:00Z" (:actual-canonical m)))
        (is (= "2024-01-15T10:31:00Z" (:expected-canonical m)))))))
