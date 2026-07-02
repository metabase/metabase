(ns metabase-enterprise.transforms-test.fixtures
  "Fixture-CSV parsing for transform test runs."
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.transforms-test.errors :as errors]
   [metabase.upload.core :as upload])
  (:import
   (java.io File InputStreamReader Reader StringReader)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Base-type → upload-type conversion
;; ---------------------------------------------------------------------------

(defn- base-type->upload-type
  "Maps a Metabase base-type to the best matching upload column type.
  Falls back to `::upload.types/text` for unmapped types (e.g. :type/UUID)."
  [base-type]
  (or (try (upload/base-type->upload-type base-type)
           (catch IllegalArgumentException _
             :metabase.upload.types/text))
      :metabase.upload.types/text))

;; ---------------------------------------------------------------------------
;; CSV reading with BOM / charset handling
;; ---------------------------------------------------------------------------

(defn- ->reader
  "Opens `file` for CSV reading.  Strips a leading BOM if present (UTF-8,
  UTF-16, UTF-32).  Charset is detected heuristically and falls back to UTF-8."
  ^Reader [^File file]
  ;; clj-bom's bom-input-stream transparently strips the BOM regardless of encoding.
  ;; We read as UTF-8 (the dominant encoding for CSV fixtures); if charset detection
  ;; is needed for broader upload compatibility, mirror upload.impl/->reader here.
  (InputStreamReader. (bom/bom-input-stream file) "UTF-8"))

(defn- read-csv
  "Returns `[header-row & data-rows]` as vectors of strings.
  Accepts a `java.io.File` (BOM-stripped, UTF-8) or a CSV `String` (already
  decoded, passed through `StringReader` directly)."
  [file-or-string]
  (if (string? file-or-string)
    (with-open [reader (StringReader. ^String file-or-string)]
      (vec (csv/read-csv reader)))
    (with-open [reader (->reader ^File file-or-string)]
      ;; Realise the lazy seq inside with-open so the reader isn't closed first.
      (vec (csv/read-csv reader)))))

;; ---------------------------------------------------------------------------
;; Error constructors
;; ---------------------------------------------------------------------------

(defn- header-mismatch-error
  "Throws an ex-info with `::header-mismatch` type.

  `missing-columns` — column names in the target schema absent from the CSV header.
  `extra-columns`   — column names in the CSV header absent from the target schema."
  [missing-columns extra-columns csv-header schema-names]
  (throw (ex-info
          (str "CSV header does not match target schema. "
               (when (seq missing-columns)
                 (str "Missing columns: " (str/join ", " (sort missing-columns)) ". "))
               (when (seq extra-columns)
                 (str "Extra columns: " (str/join ", " (sort extra-columns)) ".")))
          {:error-type      ::errors/header-mismatch
           :missing-columns (vec missing-columns)
           :extra-columns   (vec extra-columns)
           :csv-header      (vec csv-header)
           :schema-names    (vec schema-names)})))

(defn- unparseable-cell-error
  "Throws an ex-info with `::errors/unparseable-cell` type.

  `row-index`   — 0-based index into the data rows (not counting the header).
  `column-name` — name of the column whose value failed to parse.
  `raw-value`   — the original string from the CSV cell."
  [row-index column-name raw-value cause]
  (throw (ex-info
          (str "Could not parse value " (pr-str raw-value)
               " in column " (pr-str column-name)
               " at row " row-index ".")
          {:error-type  ::errors/unparseable-cell
           :row-index   row-index
           :column-name column-name
           :raw-value   raw-value}
          cause)))

;; ---------------------------------------------------------------------------
;; Cell parsing
;; ---------------------------------------------------------------------------

(defn- parse-cell
  "Parse a single CSV cell string `s` using `parser`.
  Returns nil for blank cells; throws `::unparseable-cell` on parse failure."
  [parser row-index column-name s]
  ;; Blank → nil mirrors the upload parse-rows path; required by insert-from-source!
  (if (str/blank? s)
    nil
    (try
      (parser s)
      (catch Exception e
        (unparseable-cell-error row-index column-name s e)))))

(defn- parse-row
  "Parse one data row (vector of strings) using per-column parsers.
  `row-index` is 0-based (does not count the header row).
  Throws `::errors/ragged-row` when the row's cell count differs from the header's."
  [parsers column-names row-index row]
  ;; mapv stops at the shortest collection — a ragged row would silently
  ;; truncate or nil-pad without this guard.
  (when (not= (count row) (count parsers))
    (throw (ex-info (str "CSV row " row-index " has " (count row) " cell(s);"
                         " the header has " (count parsers) " column(s).")
                    {:error-type          ::errors/ragged-row
                     :row-index           row-index
                     :expected-cell-count (count parsers)
                     :actual-cell-count   (count row)})))
  (mapv (fn [parser col-name cell]
          (parse-cell parser row-index col-name cell))
        parsers
        column-names
        row))

;; ---------------------------------------------------------------------------
;; Schema-driven parsing path
;; ---------------------------------------------------------------------------

(defn- parse-with-schema
  "Parse `rows` (vectors of strings, no header) against `ordered-schema`
  (a vector of `{:name :base-type :nullable?}` maps in CSV column order).
  Returns `[parsed-row ...]`."
  [ordered-schema rows]
  (let [settings (upload/get-settings)
        parsers  (mapv (fn [{:keys [base-type]}]
                         (upload/upload-type->parser (base-type->upload-type base-type)
                                                     settings))
                       ordered-schema)
        names    (mapv :name ordered-schema)]
    (vec (map-indexed (fn [idx row]
                        (parse-row parsers names idx row))
                      rows))))

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

  Returns:
  ```
  {:columns [{:name <string> :base-type <kw> :nullable? <bool>} ...]
   :rows    [[v1 v2 ...] ...]}
  ```
  `:columns` are in CSV column order.  `:rows` are vectors of plain Clojure
  values, one per data row, in the same column order. Cell values are one of:
  String, Double, BigInteger, Boolean, LocalDate, LocalDateTime, OffsetDateTime,
  or nil. Blank cells — empty or whitespace-only — parse to nil (SQL NULL).

  Throws (all via `ex-info` with typed `:error-type` in ex-data):
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
  [csv-file target-schema]
  {:pre [(seq target-schema)]}
  (let [rows      (read-csv csv-file)
        header    (first rows)
        data-rows (rest rows)
        ;; Header matching is case-sensitive and exact: driver/insert-from-source! passes
        ;; column names verbatim to the database, and real table column names are
        ;; case-preserving; folding here could silently map the wrong CSV column onto the
        ;; wrong DB column.
        schema-names (set (map :name target-schema))
        csv-names    (set header)
        missing      (set/difference schema-names csv-names)
        extra        (set/difference csv-names schema-names)
        dupes        (->> (frequencies header)
                          (keep (fn [[n cnt]] (when (> cnt 1) n)))
                          sort)]
    ;; Duplicates hide from the set comparison and misalign row values downstream.
    (when (seq dupes)
      (throw (ex-info (str "CSV header contains duplicate column names: "
                           (str/join ", " dupes) ".")
                      {:error-type        ::errors/header-mismatch
                       :duplicate-columns (vec dupes)
                       :csv-header        (vec header)})))
    (when (or (seq missing) (seq extra))
      (header-mismatch-error missing extra header (map :name target-schema)))
    ;; Re-order the schema to match the CSV column order.
    (let [name->col      (into {} (map (juxt :name identity)) target-schema)
          ordered-schema (mapv name->col header)
          parsed-rows    (parse-with-schema ordered-schema (vec data-rows))]
      {:columns ordered-schema
       :rows    parsed-rows})))
