(ns metabase-enterprise.transforms-verification.diff
  "Schema-coerced, multiset diff engine for transform test runs.

  Entry point: [[diff]].

  Both sides are canonicalized to a common form before comparison; see
  `canonicalize-cell` for the type↔canonical mapping.

  Float comparison is exact (no tolerance option); use `:ignore-columns` for noisy columns.

  ## Multiset semantics

  Row ordering is ignored. `frequencies` on canonicalized rows determines the multiset.
  Duplicate rows are counted: two identical expected rows ≠ one actual row.

  ## `:ignore-columns`

  Column names matched against `actual-cols` `:name` fields (exact byte-for-byte).
  Unknown names → throws `ExceptionInfo {:error-type ::errors/unknown-ignore-columns}`.
  Ignored columns are excluded from both sides before comparison.

  ## Column alignment

  Expected fixture columns are matched by name (exact) to actual columns.
  Missing/extra columns → `:column-issues` in the report; row comparison is skipped.
  Column order is irrelevant; both sides are re-ordered to match `actual-cols` order."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-verification.errors :as errors])
  (:import
   (java.math BigDecimal BigInteger)
   (java.time Instant LocalDate LocalDateTime OffsetDateTime ZoneOffset)
   (java.time.format DateTimeFormatter DateTimeParseException)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------

(def mismatch-cap
  "Maximum number of missing-rows, extra-rows, or cell-mismatches entries in the report.
  Mismatches beyond this limit are counted in `:truncated`."
  50)

;; ---------------------------------------------------------------------------
;; Temporal types that get midnight-UTC treatment
;; ---------------------------------------------------------------------------

(def ^:private temporal-types
  "Base types canonicalized via [[temporal->utc-string]]."
  #{:type/Date                ; LocalDate on both sides
    :type/DateTime            ; LocalDateTime wall time, treated as UTC
    ;; DateTimeWithTZ and DateTimeWithLocalTZ are equivalent after the Postgres
    ;; timestamptz round-trip (the QP always returns DateTimeWithLocalTZ).
    :type/DateTimeWithTZ
    :type/DateTimeWithLocalTZ})

(def ^:private numeric-types
  "Numeric base types."
  #{:type/Integer :type/BigInteger :type/Float :type/Decimal :type/Number})

;; ---------------------------------------------------------------------------
;; Canonicalization helpers
;; ---------------------------------------------------------------------------

(defn- parse-temporal-string
  "Parse an ISO-8601 temporal string to an OffsetDateTime, leniently: an explicit
  offset is kept; an offset-less datetime or bare date is wall time, taken as UTC.
  Returns nil when the string parses as none of the three."
  ^OffsetDateTime [^String s]
  (or (try (OffsetDateTime/parse s DateTimeFormatter/ISO_OFFSET_DATE_TIME)
           (catch DateTimeParseException _ nil))
      (try (.atOffset (LocalDateTime/parse s DateTimeFormatter/ISO_LOCAL_DATE_TIME) ZoneOffset/UTC)
           (catch DateTimeParseException _ nil))
      (try (-> (LocalDate/parse s DateTimeFormatter/ISO_LOCAL_DATE)
               (.atStartOfDay)
               (.atOffset ZoneOffset/UTC))
           (catch DateTimeParseException _ nil))))

(defn- temporal->utc-string
  "Convert a temporal value — a java.time object or an ISO-8601 string — to a
  canonical UTC string. All dates are expanded to midnight-UTC
  (\"YYYY-MM-DDTHH:MM:SSZ\"). Returns nil for nil input; throws
  `::errors/cannot-canonicalize` for anything unparseable."
  [v]
  (cond
    (nil? v)
    nil

    (string? v)
    ;; Read-back rows arrive as java.time objects (format-rows is disabled), so
    ;; strings are the exception, not the QP contract; parse leniently.
    (if-let [odt (parse-temporal-string v)]
      (.format (.withOffsetSameInstant odt ZoneOffset/UTC)
               DateTimeFormatter/ISO_OFFSET_DATE_TIME)
      (throw (errors/ex ::errors/cannot-canonicalize
                        (str "Cannot canonicalize temporal value: " (pr-str v))
                        {:value v
                         :type  (type v)})))

    (instance? LocalDate v)
    ;; LocalDate → midnight UTC. atStartOfDay(UTC) yields OffsetDateTime which
    ;; ISO_OFFSET_DATE_TIME can format; using .atTime would yield a LocalDateTime
    ;; which has no offset field and throws UnsupportedTemporalTypeException.
    (.format (.atStartOfDay ^LocalDate v ZoneOffset/UTC)
             DateTimeFormatter/ISO_OFFSET_DATE_TIME)

    (instance? LocalDateTime v)
    ;; LocalDateTime treated as UTC (the QP returns no-TZ column values with a Z suffix)
    (.format (.atOffset ^LocalDateTime v ZoneOffset/UTC) DateTimeFormatter/ISO_OFFSET_DATE_TIME)

    (instance? OffsetDateTime v)
    ;; Normalise to UTC for comparison
    (.format (.withOffsetSameInstant ^OffsetDateTime v ZoneOffset/UTC)
             DateTimeFormatter/ISO_OFFSET_DATE_TIME)

    (instance? Instant v)
    (.format (.atOffset ^Instant v ZoneOffset/UTC) DateTimeFormatter/ISO_OFFSET_DATE_TIME)

    :else
    (throw (errors/ex ::errors/cannot-canonicalize
                      (str "Cannot canonicalize temporal value: " (pr-str v))
                      {:value v
                       :type  (type v)}))))

(defn- numeric->bigdecimal
  "Convert a numeric value to BigDecimal for scale-independent comparison.
  Returns nil for nil input."
  [v]
  (cond
    (nil? v)         nil
    (instance? BigDecimal v) v
    (instance? BigInteger v) (BigDecimal. ^BigInteger v)
    ;; Must precede the Number fallback — .doubleValue loses precision above 2^53.
    (instance? clojure.lang.BigInt v) (.toBigDecimal ^clojure.lang.BigInt v)
    (instance? Double v)     (BigDecimal/valueOf ^double v)
    (instance? Float v)      (BigDecimal/valueOf (double v))
    (instance? Long v)       (BigDecimal/valueOf ^long v)
    (instance? Integer v)    (BigDecimal/valueOf (long ^int v))
    (instance? Number v)     (BigDecimal/valueOf (.doubleValue ^Number v))
    :else
    (throw (errors/ex ::errors/cannot-canonicalize
                      (str "Cannot convert to BigDecimal: " (pr-str v))
                      {:value v
                       :type  (type v)}))))

(defn- canonicalize-cell
  "Canonicalize a cell value given the column `base-type`.
  Returns a JSON-serializable Clojure value.

  The canonical form per column type:

  | Column base_type                             | Canonical form                        |
  |----------------------------------------------|---------------------------------------|
  | :type/Date                                   | String `\"YYYY-MM-DDTHH:MM:SSZ\"`       |
  | :type/DateTime                               | String `\"YYYY-MM-DDTHH:MM:SSZ\"`       |
  | :type/DateTimeWithTZ, :type/DateTimeWithLocalTZ | String `\"YYYY-MM-DDTHH:MM:SSZ\"` (UTC) |
  | :type/Integer, :type/BigInteger              | java.math.BigDecimal                  |
  | :type/Float, :type/Decimal                   | java.math.BigDecimal                  |
  | :type/Boolean                                | Boolean                               |
  | :type/Text, others                           | String (identity for strings; nil)    |
  | nil (SQL NULL)                               | nil                                   |

  Float comparison uses BigDecimal and is scale-independent (`3.5` == `3.50`;
  int/long/BigInteger widen safely). No approximate-equality option: see [[cells-equal?]]."
  [base-type v]
  (cond
    (nil? v)
    nil

    (contains? temporal-types base-type)
    (temporal->utc-string v)

    (contains? numeric-types base-type)
    ;; Keep as BigDecimal for comparison; serialise as string in the report
    (numeric->bigdecimal v)

    (= :type/Boolean base-type)
    (boolean v)

    :else
    ;; Text and unknown types: stringify for comparison
    (if (string? v) v (str v))))

(defn- cells-equal?
  "Compare two canonicalized cell values. Exact, always — see [[canonicalize-cell]]
  for why there is no approximate option (BigDecimal comparison, scale-independent)."
  [canonical-actual canonical-expected]
  (cond
    (and (nil? canonical-actual) (nil? canonical-expected))
    true

    (or (nil? canonical-actual) (nil? canonical-expected))
    false

    (and (instance? BigDecimal canonical-actual)
         (instance? BigDecimal canonical-expected))
    ;; compareTo ignores scale (3.50 == 3.5); equals does not
    (zero? (.compareTo ^BigDecimal canonical-actual ^BigDecimal canonical-expected))

    :else
    (= canonical-actual canonical-expected)))

(defn- canonical->report-str
  "Convert a canonical value to a JSON-serializable string for the report.
  BigDecimal → plain string; everything else is already JSON-safe."
  [v]
  (cond
    (nil? v)                 nil
    (instance? BigDecimal v) (.toPlainString ^BigDecimal v)
    :else                    (str v)))

;; ---------------------------------------------------------------------------
;; Column matching
;; ---------------------------------------------------------------------------

(defn- column-issues
  "Compare expected fixture columns vs actual QP columns (by name, after applying ignore-columns).
  Returns a seq of issue maps `{:type :missing|:extra :column-name <str>}`."
  [actual-col-names expected-col-names]
  (let [actual-set   (set actual-col-names)
        expected-set (set expected-col-names)
        missing      (remove actual-set expected-col-names)
        extra        (remove expected-set actual-col-names)]
    (concat
     (map (fn [n] {:type :missing :column-name n}) missing)
     (map (fn [n] {:type :extra :column-name n}) extra))))

;; ---------------------------------------------------------------------------
;; Row canonicalization
;; ---------------------------------------------------------------------------

(defn- canonicalize-row
  "Canonicalize a row vector of cells given the `base-types` vector (in column order).
  Returns a vector of JSON-serializable values for the report, and a comparable key."
  [base-types row]
  (mapv canonicalize-cell base-types row))

(defn- row-key
  "Multiset comparison key for a canonical row: the display-form vector.
  BigDecimals become plain strings via [[canonical->report-str]] — but note
  `.toPlainString` is scale-sensitive (`3.5` ≠ `3.50`), so BigDecimals are
  scale-normalized first with `.stripTrailingZeros`. Everything else is already
  in canonical comparable form."
  [canonical-row]
  (mapv (fn [cell]
          (if (instance? BigDecimal cell)
            (canonical->report-str (.stripTrailingZeros ^BigDecimal cell))
            (canonical->report-str cell)))
        canonical-row))

;; ---------------------------------------------------------------------------
;; Multiset diff
;; ---------------------------------------------------------------------------

(defn- multiset-diff
  "Compare actual and expected canonicalized rows using multiset semantics.
  Returns `{:missing [[...] ...] :extra [[...] ...]}` where each entry is a
  canonical row (not a multiset key — keys are internal and must never leak
  into the report)."
  [actual-canonical expected-canonical]
  (let [actual-groups   (group-by row-key actual-canonical)
        expected-groups (group-by row-key expected-canonical)
        all-keys        (set (concat (keys actual-groups) (keys expected-groups)))
        ;; For each key: surplus expected rows are missing; surplus actual rows are extra.
        missing         (mapcat (fn [k]
                                  (drop (count (get actual-groups k))
                                        (get expected-groups k)))
                                all-keys)
        extra           (mapcat (fn [k]
                                  (drop (count (get expected-groups k))
                                        (get actual-groups k)))
                                all-keys)]
    {:missing (vec missing)
     :extra   (vec extra)}))

;; ---------------------------------------------------------------------------
;; Cell-level mismatch detail
;; ---------------------------------------------------------------------------

(defn- cell-mismatch-detail
  "Produce cell-mismatch detail entries for a single pair of (actual, expected) canonical rows.
  Returns a seq of mismatch maps. Reports `:actual-canonical` and `:expected-canonical` only."
  [col-names actual-row expected-row]
  ;; No :actual-raw / :expected-raw fields: raw pre-canonicalization values are discarded at
  ;; canonicalization time and cannot be recovered here. Including them would always produce
  ;; values identical to the canonical fields — a correctness failure for date columns where
  ;; raw "2024-03-15" becomes canonical "2024-03-15T00:00:00Z".
  (mapcat (fn [col-name actual-canon expected-canon]
            (when-not (cells-equal? actual-canon expected-canon)
              [{:column             col-name
                :actual-canonical   (canonical->report-str actual-canon)
                :expected-canonical (canonical->report-str expected-canon)}]))
          col-names
          actual-row
          expected-row))

(defn- attempt-cell-mismatches
  "When missing and extra counts are equal and both are within the cap, attempt stable-sort
  pairing and produce per-cell mismatch detail.

  Strategy: sort both sides of CANONICAL ROWS deterministically (by display form), pair
  positionally, produce cell-level detail for each pair.

  Limitation: the pairing is unambiguous only when each side has exactly one differing
  row. For larger diffs it may be arbitrary, though always deterministic and bounded;
  optimal row matching is not implemented."
  [missing-rows extra-rows col-names]
  (when (and (seq missing-rows)
             (= (count missing-rows) (count extra-rows)))
    (let [sorted-missing (sort-by row-key missing-rows)
          sorted-extra   (sort-by row-key extra-rows)]
      (mapcat (fn [expected-canon actual-canon]
                (cell-mismatch-detail col-names actual-canon expected-canon))
              sorted-missing
              sorted-extra))))

;; ---------------------------------------------------------------------------
;; Public entry point
;; ---------------------------------------------------------------------------

(defn diff
  "Compare actual transform output (QP shape) against an expected fixture.

  Arguments:
  - `actual-cols`   — QP `[:data :cols]` vector; each entry has at least `:name` and `:base_type`.
  - `actual-rows`   — QP row vectors; temporals as java.time objects (the read-back
                      runs with format-rows disabled) or ISO-8601 strings.
  - `expected`      — `parse-fixture` output: `{:columns [...] :rows [...]}`.
  - `opts`          — options map:
    - `:ignore-columns` — `#{\"col-name\" ...}` columns excluded from both sides
                          before comparison (matched exactly against `actual-cols`
                          names; an unknown name throws `::errors/unknown-ignore-columns`).

  Returns a JSON-serializable report map; all fields always present, all values
  JSON-serializable (no Java objects):

  ```
  {:status          :passed | :failed
   :column-issues   [{:type :missing|:extra :column-name <str>} ...]
   :missing-rows    [[display-cell ...] ...]   ; expected rows absent from actual
   :extra-rows      [[display-cell ...] ...]   ; actual rows absent from expected
   ;; display cells are the canonicalized values in report form (BigDecimal as
   ;; plain string, temporals as UTC ISO strings) — never internal multiset keys
   :cell-mismatches [{:column             <str>
                      :actual-canonical   <str>
                      :expected-canonical <str>} ...]
   :row-counts      {:actual N :expected N}
   :truncated       N}   ; count of mismatches/rows beyond the cap (0 when not truncated)
  ```

  `:cell-mismatches` are produced when missing-rows and extra-rows counts match and
  rows can be sorted into stable pairs. `:cell-mismatches`, `:missing-rows`, and
  `:extra-rows` are each capped at [[mismatch-cap]] entries."
  [actual-cols actual-rows expected opts]
  (let [ignore-cols    (set (:ignore-columns opts))
        ;; Validate ignore-columns: every name must appear in actual-cols
        actual-names   (mapv :name actual-cols)
        actual-name-set (set actual-names)
        unknown-ignores (remove actual-name-set ignore-cols)]
    (when (seq unknown-ignores)
      (throw (errors/ex ::errors/unknown-ignore-columns
                        (str "Unknown ignore-column name(s): " (str/join ", " (sort unknown-ignores))
                             ". Valid columns are: " (str/join ", " (sort actual-names)))
                        {:unknown-columns   (vec (sort unknown-ignores))
                         :available-columns (vec (sort actual-names))})))
    (let [filtered-actual-cols (filterv (fn [c] (not (contains? ignore-cols (:name c))))
                                        actual-cols)
          filtered-actual-names (mapv :name filtered-actual-cols)
          actual-base-types    (mapv :base_type filtered-actual-cols)

          exp-row-by-name  (fn [row]
                             (into {} (map (fn [col v] [(:name col) v])
                                           (:columns expected)
                                           row)))

          exp-col-names    (mapv :name (filterv (fn [c] (not (contains? ignore-cols (:name c))))
                                                (:columns expected)))

          ;; --- Column alignment check ---
          issues          (column-issues filtered-actual-names exp-col-names)

          n-actual   (count actual-rows)
          n-expected (count (:rows expected))]
      (if (seq issues)
        ;; Column mismatch: report issues, skip row comparison
        {:status          :failed
         :column-issues   (vec issues)
         :missing-rows    []
         :extra-rows      []
         :cell-mismatches []
         :row-counts      {:actual n-actual :expected n-expected}
         :truncated       0}
        ;; Columns align: canonicalize and compare rows
        (let [exp-rows-reordered
              (mapv (fn [exp-row]
                      (let [row-map (exp-row-by-name exp-row)]
                        (mapv (fn [col-name] (get row-map col-name))
                              filtered-actual-names)))
                    (:rows expected))

              actual-rows-filtered
              (let [keep-idxs (keep-indexed (fn [i c]
                                              (when (not (contains? ignore-cols (:name c)))
                                                i))
                                            actual-cols)]
                (mapv (fn [row] (mapv #(nth row %) keep-idxs)) actual-rows))

              actual-canonical   (mapv #(canonicalize-row actual-base-types %) actual-rows-filtered)
              expected-canonical (mapv #(canonicalize-row actual-base-types %) exp-rows-reordered)

              {:keys [missing extra]} (multiset-diff actual-canonical expected-canonical)

              cell-mismatches
              (when (and (= (count missing) (count extra))
                         (pos? (count missing))
                         (<= (count missing) mismatch-cap))
                (attempt-cell-mismatches
                 missing extra
                 filtered-actual-names))

              ;; Cap missing/extra at mismatch-cap; convert canonical rows to
              ;; display form at the report boundary (BigDecimal → plain string;
              ;; internal multiset keys never appear in the report)
              ->display-row  (fn [row] (mapv canonical->report-str row))
              missing-capped  (mapv ->display-row (take mismatch-cap missing))
              extra-capped    (mapv ->display-row (take mismatch-cap extra))
              cells-capped    (vec (take mismatch-cap (or cell-mismatches [])))

              truncated       (+ (- (count missing) (count missing-capped))
                                 (- (count extra) (count extra-capped))
                                 (- (count (or cell-mismatches [])) (count cells-capped)))

              passed? (and (empty? missing) (empty? extra))]
          {:status          (if passed? :passed :failed)
           :column-issues   []
           :missing-rows    missing-capped
           :extra-rows      extra-capped
           :cell-mismatches cells-capped
           :row-counts      {:actual n-actual :expected n-expected}
           :truncated       truncated})))))
