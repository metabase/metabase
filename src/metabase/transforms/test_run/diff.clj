(ns metabase.transforms.test-run.diff
  "Schema-coerced, multiset diff engine for transform test runs.

  Entry point: [[diff]].

  ## Inputs

  - `actual-cols`  — QP `[:data :cols]` shape: `[{:name <str> :base_type <kw> ...} ...]`
  - `actual-rows`  — QP row vectors; temporal values are ISO-8601 Z strings:
                     `\"2024-03-15T00:00:00Z\"`, `\"2024-01-15T10:30:00Z\"` etc.
  - `expected`     — output of [[metabase.transforms.test-run.fixtures/parse-fixture]]:
                     `{:columns [{:name <str> :base-type <kw> :nullable? <bool>} ...]
                       :rows    [[v1 v2 ...] ...]}`
                     Row values are Java time objects (LocalDate/LocalDateTime/OffsetDateTime),
                     BigInteger (integers), Double/Number (floats), Boolean, String, or nil.
  - `opts`         — options map (all optional):
                     `:ignore-columns` — `#{\"col-name\" ...}`; columns excluded from comparison.
                       Unknown column names → throws ExceptionInfo with `::unknown-ignore-columns`.

  ## Canonicalization

  Both actual and expected cells are canonicalized to the same Clojure value type before
  comparing. The canonical form per column type:

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

  ## Float equality

  EXACT, always — both sides convert to `BigDecimal` and compare scale-independently
  (`3.5` == `3.50`; int/long/BigInteger widen safely). No approximate-equality
  option: passing `:float-tolerance` throws (fail closed). For noisy columns use
  `:ignore-columns`.

  ## Multiset semantics

  Row ordering is ignored. `frequencies` on canonicalized rows determines the multiset.
  Duplicate rows are counted: two identical expected rows ≠ one actual row.

  ## `:ignore-columns`

  Column names matched against `actual-cols` `:name` fields (exact byte-for-byte).
  Unknown names → throws `ExceptionInfo {:error-type ::unknown-ignore-columns}`.
  Ignored columns are excluded from both sides before comparison.

  ## Column alignment

  Expected fixture columns are matched by name (exact) to actual columns.
  Missing/extra columns → `:column-issues` in the report; row comparison is skipped.
  Column ORDER is irrelevant; both sides are re-ordered to match `actual-cols` order.

  ## Report shape

  All fields always present; all values are JSON-serializable (no Java objects):

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

  `:cell-mismatches` are produced when missing-rows and extra-rows counts match and rows
  can be sorted into stable pairs. They are capped at [[mismatch-cap]] entries.
  `:missing-rows` and `:extra-rows` are each capped at [[mismatch-cap]] entries."
  (:require
   [clojure.string :as str])
  (:import
   (java.math BigDecimal BigInteger)
   (java.time Instant LocalDate LocalDateTime OffsetDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------

(def ^:private mismatch-cap
  "Maximum number of missing-rows, extra-rows, or cell-mismatches entries in the report.
  Mismatches beyond this limit are counted in `:truncated`."
  50)

;; ---------------------------------------------------------------------------
;; Temporal types that get midnight-UTC treatment
;; ---------------------------------------------------------------------------

(def ^:private date-like-types
  "Base types the QP returns as a midnight-UTC string and the fixture parser produces as a LocalDate."
  #{:type/Date})

(def ^:private datetime-like-types
  "Base types the QP returns as a Z-suffixed ISO-8601 string and the fixture parser produces as a LocalDateTime."
  #{:type/DateTime})

(def ^:private tz-aware-types
  "Base types treated as tz-aware datetimes. Both DateTimeWithTZ and DateTimeWithLocalTZ are
  equivalent after the Postgres timestamptz round-trip (the QP always returns DateTimeWithLocalTZ)."
  #{:type/DateTimeWithTZ :type/DateTimeWithLocalTZ})

(def ^:private numeric-types
  "Numeric base types."
  #{:type/Integer :type/BigInteger :type/Float :type/Decimal :type/Number})

;; ---------------------------------------------------------------------------
;; Canonicalization helpers
;; ---------------------------------------------------------------------------

(defn- temporal->utc-string
  "Convert any temporal value or ISO-8601 Z string to a canonical UTC string.
  All dates are expanded to midnight-UTC (\"YYYY-MM-DDTHH:MM:SSZ\").
  Returns nil for nil input."
  [v]
  (cond
    (nil? v)
    nil

    (string? v)
    ;; Already a QP-produced ISO-8601 string; normalise to Z suffix.
    ;; The QP always emits the Z suffix, so this is mostly a passthrough.
    ;; Defensively parse and re-format to guarantee canonical form.
    (let [odt (OffsetDateTime/parse ^String v DateTimeFormatter/ISO_OFFSET_DATE_TIME)]
      (.format (.atZoneSameInstant odt ZoneOffset/UTC)
               DateTimeFormatter/ISO_OFFSET_DATE_TIME))

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
    (throw (ex-info (str "Cannot canonicalize temporal value: " (pr-str v))
                    {:value v :type (type v)}))))

(defn- numeric->bigdecimal
  "Convert a numeric value to BigDecimal for scale-independent comparison.
  Returns nil for nil input."
  [v]
  (cond
    (nil? v)         nil
    (instance? BigDecimal v) v
    (instance? BigInteger v) (BigDecimal. ^BigInteger v)
    (instance? Double v)     (BigDecimal/valueOf ^double v)
    (instance? Float v)      (BigDecimal/valueOf (double v))
    (instance? Long v)       (BigDecimal/valueOf ^long v)
    (instance? Integer v)    (BigDecimal/valueOf (long ^int v))
    (instance? Number v)     (BigDecimal/valueOf (.doubleValue ^Number v))
    :else
    (throw (ex-info (str "Cannot convert to BigDecimal: " (pr-str v))
                    {:value v :type (type v)}))))

(defn- canonicalize-cell
  "Canonicalize a cell value given the column `base-type`.
  Returns a JSON-serializable Clojure value."
  [base-type v]
  (cond
    (nil? v)
    nil

    (contains? date-like-types base-type)
    (temporal->utc-string v)

    (contains? datetime-like-types base-type)
    (temporal->utc-string v)

    (contains? tz-aware-types base-type)
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
  "Compare two canonicalized cell values. Exact, always — see the namespace
  docstring's Float equality section for why there is no approximate option."
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
  `.toPlainString` is scale-SENSITIVE (`3.5` ≠ `3.50`), so BigDecimals are
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
  CANONICAL ROW (not a multiset key — keys are internal and must never leak
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

  Strategy: sort both sides of CANONICAL ROWS deterministically (by display form).
  Pair positionally. Produce cell-level detail for each pair.

  Limitation: this pairing is only unambiguous when both sides have exactly one differing
  row. For larger diffs, the pairing may be arbitrary but is at least deterministic and
  bounded. Documented limitation: fuzzy/optimal row matching is not implemented."
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
  - `actual-rows`   — QP row vectors; temporals as ISO-8601 Z strings.
  - `expected`      — `parse-fixture` output: `{:columns [...] :rows [...]}`.
  - `opts`          — options map; see namespace docstring.

  Returns a JSON-serializable report map; see namespace docstring for shape."
  [actual-cols actual-rows expected opts]
  (when (contains? opts :float-tolerance)
    (throw (ex-info ":float-tolerance is not supported; float comparison is exact. Use :ignore-columns for noisy columns."
                    {:error-type ::unsupported-option
                     :option     :float-tolerance})))
  (let [ignore-cols    (set (:ignore-columns opts))
        ;; Validate ignore-columns: every name must appear in actual-cols
        actual-names   (mapv :name actual-cols)
        actual-name-set (set actual-names)
        unknown-ignores (remove actual-name-set ignore-cols)]
    (when (seq unknown-ignores)
      (throw (ex-info (str "Unknown ignore-column name(s): " (str/join ", " (sort unknown-ignores))
                           ". Valid columns are: " (str/join ", " (sort actual-names)))
                      {:error-type         ::unknown-ignore-columns
                       :unknown-columns    (vec (sort unknown-ignores))
                       :available-columns  (vec (sort actual-names))})))
    (let [;; Filter actual columns by ignore-columns
          filtered-actual-cols (filterv (fn [c] (not (contains? ignore-cols (:name c))))
                                        actual-cols)
          filtered-actual-names (mapv :name filtered-actual-cols)
          actual-base-types    (mapv :base_type filtered-actual-cols)

          ;; Build name→value map for expected fixture rows
          exp-row-by-name  (fn [row]
                             ;; Map from expected column names to values
                             (into {} (map (fn [col v] [(:name col) v])
                                           (:columns expected)
                                           row)))

          ;; Expected column names (filtered)
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
        (let [;; Re-order expected rows to match actual column order
              exp-rows-reordered
              (mapv (fn [exp-row]
                      (let [row-map (exp-row-by-name exp-row)]
                        (mapv (fn [col-name] (get row-map col-name))
                              filtered-actual-names)))
                    (:rows expected))

              ;; Canonicalize actual rows (filter ignored columns by position)
              actual-rows-filtered
              (let [keep-idxs (keep-indexed (fn [i c]
                                              (when (not (contains? ignore-cols (:name c)))
                                                i))
                                            actual-cols)]
                (mapv (fn [row] (mapv #(nth row %) keep-idxs)) actual-rows))

              actual-canonical   (mapv #(canonicalize-row actual-base-types %) actual-rows-filtered)
              expected-canonical (mapv #(canonicalize-row actual-base-types %) exp-rows-reordered)

              {:keys [missing extra]} (multiset-diff actual-canonical expected-canonical)

              ;; Attempt cell-level detail only when missing/extra counts match
              ;; and the diff is small enough
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
                                 (- (count extra) (count extra-capped)))

              passed? (and (empty? missing) (empty? extra))]
          {:status          (if passed? :passed :failed)
           :column-issues   []
           :missing-rows    missing-capped
           :extra-rows      extra-capped
           :cell-mismatches cells-capped
           :row-counts      {:actual n-actual :expected n-expected}
           :truncated       truncated})))))
