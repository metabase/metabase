(ns metabase-enterprise.transforms-verification.fixtures
  "Fixture-CSV parsing for transform test runs."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Error constructors
;; ---------------------------------------------------------------------------

(defn- header-mismatch-error
  "Throws an ex-info with `::header-mismatch` type.

  `missing-columns` — column names in the target schema absent from the CSV header.
  `extra-columns`   — column names in the CSV header absent from the target schema."
  [missing-columns extra-columns csv-header schema-names]
  (throw (errors/ex ::errors/header-mismatch
                    (str (tru "CSV header does not match target schema.")
                         (when (seq missing-columns)
                           (str " " (tru "Missing columns: {0}." (str/join ", " (sort missing-columns)))))
                         (when (seq extra-columns)
                           (str " " (tru "Extra columns: {0}." (str/join ", " (sort extra-columns))))))
                    {:missing-columns (vec missing-columns)
                     :extra-columns   (vec extra-columns)
                     :csv-header      (vec csv-header)
                     :schema-names    (vec schema-names)})))

(defn- unparseable-cell-error
  "Throws an ex-info with `::errors/unparseable-cell` type.

  `row-index`   — 0-based index into the data rows (not counting the header).
  `column-name` — name of the column whose value failed to parse.
  `raw-value`   — the original string from the CSV cell."
  [row-index column-name raw-value cause]
  (throw (errors/ex ::errors/unparseable-cell
                    (tru "Could not parse value {0} in column {1} at row {2}."
                         (pr-str raw-value) (pr-str column-name) row-index)
                    {:row-index   row-index
                     :column-name column-name
                     :raw-value   raw-value}
                    cause)))

(defn- ragged-row-error
  "Throws an ex-info with `::errors/ragged-row` type.

  `row-index` — 0-based index into the data rows (not counting the header)."
  [row-index expected-cell-count actual-cell-count]
  (throw (errors/ex ::errors/ragged-row
                    (tru "CSV row {0} has {1} cell(s); the header has {2} column(s)."
                         row-index actual-cell-count expected-cell-count)
                    {:row-index           row-index
                     :expected-cell-count expected-cell-count
                     :actual-cell-count   actual-cell-count})))

;; ---------------------------------------------------------------------------
;; Header validation
;; ---------------------------------------------------------------------------

(defn- validate-header!
  "Validate the CSV `header` against `target-schema`; throws `::errors/header-mismatch`
  on duplicate header names or a header ≠ schema-names mismatch."
  [header target-schema]
  (let [schema-names (set (map :name target-schema))
        csv-names    (set header)
        missing      (set/difference schema-names csv-names)
        extra        (set/difference csv-names schema-names)
        dupes        (->> (frequencies header)
                          (keep (fn [[n cnt]] (when (> cnt 1) n)))
                          sort)]
    ;; Duplicates hide from the set comparison and misalign row values downstream.
    (when (seq dupes)
      (throw (errors/ex ::errors/header-mismatch
                        (tru "CSV header contains duplicate column names: {0}." (str/join ", " dupes))
                        {:duplicate-columns (vec dupes)
                         :csv-header        (vec header)})))
    (when (or (seq missing) (seq extra))
      (header-mismatch-error missing extra header (map :name target-schema)))))

;; ---------------------------------------------------------------------------
;; Public API
;; ---------------------------------------------------------------------------

(defn parse-fixture
  "Parse a fixture CSV into typed rows suitable for seeding a scratch table.

  Arguments:
  - `csv-file`      — `java.io.File` (e.g. a multipart upload temp file) OR a
                      CSV `String` (in-memory, used by in-process tests to avoid
                      disk I/O).
  - `target-schema` — a non-empty sequence of column descriptors in any order:
                      `[{:name <string> :base-type <kw> :nullable? <bool>} ...]`
                      These come from real `:metadata/table` + field metadata; the
                      caller is responsible for building this from the DB.
  - `ignore-columns` — set of column-name strings whose cells parse as raw text
                       instead of against their declared `:base-type` (default
                       `#{}`). See the ignored-column quirk below.

  Returns:
  ```
  {:columns [{:name <string> :base-type <kw> :nullable? <bool>} ...]
   :rows    [[v1 v2 ...] ...]}
  ```
  `:columns` are in CSV column order.  `:rows` are vectors of plain Clojure
  values, one per data row, in the same column order. Cell values are one of:
  String, Double, BigInteger, Boolean, LocalDate, LocalDateTime, OffsetDateTime,
  or nil.

  Two representational quirks:
  - Blank cells — empty or whitespace-only — parse to nil (SQL NULL). An
    intentional empty string `\"\"` is indistinguishable from NULL and unrepresentable.
  - Ignored columns still need a header entry (header validation covers the whole
    schema), but their cells parse as raw text: no placeholder is type-valid for
    every driver's flavor of a `NOW()` column, and the diff discards ignored
    columns before comparing anyway.

  Throws (all via `ex-info` with typed `:error-type` in ex-data):
  - `::empty-target-schema` — `target-schema` is empty (the table has no columns).
  - `::header-mismatch`   — CSV header ≠ schema column names (case-sensitive,
                            exact match; ex-data includes `:missing-columns` and
                            `:extra-columns`), or the header contains duplicate
                            names (ex-data includes `:duplicate-columns`).
  - `::ragged-row`        — a data row's cell count ≠ the header's column count;
                            ex-data includes `:row-index` (0-based),
                            `:expected-cell-count`, and `:actual-cell-count`.
  - `::unparseable-cell`  — a cell value could not be parsed as the column type;
                            ex-data includes `:row-index` (0-based), `:column-name`,
                            and `:raw-value`."
  ([csv-file target-schema]
   (parse-fixture csv-file target-schema #{}))
  ([csv-file target-schema ignore-columns]
   (when (empty? target-schema)
     ;; A zero-column leaf must surface as a typed 4xx, not a bare 500 — hence a
     ;; typed throw here instead of a `:pre` precondition.
     (throw (errors/ex ::errors/empty-target-schema
                       (tru "Cannot build a fixture: the target table has no columns.")
                       {})))
   (let [ignore-columns (set ignore-columns)
         header->columns
         (fn [header]
           (validate-header! header target-schema)
           ;; Re-order the schema to match the CSV column order, retyping ignored
           ;; columns to :type/Text so their cells parse with the identity parser
           ;; (a tz-less :type/DateTime rejects the offset a :type/DateTimeWithTZ
           ;; requires, so no literal placeholder parses everywhere).
           (let [name->col (u/index-by :name target-schema)]
             (mapv (fn [col-name]
                     (cond-> (name->col col-name)
                       (contains? ignore-columns col-name) (assoc :base-type :type/Text)))
                   header)))]
     (try
       (upload/parse-csv csv-file header->columns)
       (catch clojure.lang.ExceptionInfo e
         (let [{:keys [type row-index column-name raw-value
                       expected-cell-count actual-cell-count]} (ex-data e)]
           (case type
             :metabase.upload/ragged-row
             (ragged-row-error row-index expected-cell-count actual-cell-count)

             :metabase.upload/unparseable-cell
             (unparseable-cell-error row-index column-name raw-value (ex-cause e))

             (throw e))))))))
