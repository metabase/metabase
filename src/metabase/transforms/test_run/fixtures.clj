(ns metabase.transforms.test-run.fixtures
  "Fixture-CSV parsing for transform test runs.

  Entry point: [[parse-fixture]].

  Callers supply a target schema (column names + base-types from real Table/Field
  metadata) to parse CSVs against the real table's types.  When no schema is
  given, types are inferred from the data (upload-style inference).

  This namespace does NOT hit the database; callers build the schema from
  `:metadata/table` + field metadata and pass it in.

  ## NULL vs empty-string rule

  Any cell whose string value is blank (empty string or whitespace-only) is
  returned as `nil` (SQL NULL).  Non-blank cells are parsed according to the
  column type.  Zero (`0`) and `false` are NOT blank and are preserved as their
  parsed values.  This matches the behaviour of the upload `parse-rows` path and
  is the only safe default for `driver/insert-from-source!` insertion.

  ## Case-sensitivity rule for header matching

  Column names are matched **exactly** (byte-for-byte) against the `:name`
  fields in `target-schema`.  No case-folding, no trimming, no normalization.
  The rationale: `driver/insert-from-source!` passes column names verbatim to the
  database, and real table column names are case-preserving; folding here could
  silently map the wrong CSV column onto the wrong DB column.  If the CSV header
  and the schema names differ only in case, a `::header-mismatch` error is thrown
  (the caller can inspect `:missing-columns` / `:extra-columns` in ex-data to
  diagnose).

  ## Output shape

  The return value feeds `transforms-base.u/create-table-from-schema!` and
  `driver/insert-from-source!` directly:

  ```
  {:columns [{:name     <string>   ; verbatim column name
              :base-type <kw>      ; e.g. :type/Integer, :type/Text
              :nullable? <bool>}
             ...]
   :rows    [[v1 v2 ...]           ; vectors of plain Clojure values in column order
             ...]}
  ```

  Accepted value types per column type (matches `insert-from-source!` :rows
  contract): String, Double, BigInteger, Boolean, LocalDate, LocalDateTime,
  OffsetDateTime, nil."
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.upload.core :as upload])
  (:import
   (java.io File InputStreamReader Reader)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Upload-type ↔ base-type conversions
;; ---------------------------------------------------------------------------

(def ^:private upload-type->base-type
  "Maps upload column-type keywords to Metabase base-type keywords.
  This is the inverse direction of `upload/base-type->upload-type`."
  {:metabase.upload.types/int             :type/Integer
   :metabase.upload.types/float           :type/Float
   :metabase.upload.types/boolean         :type/Boolean
   :metabase.upload.types/date            :type/Date
   :metabase.upload.types/datetime        :type/DateTime
   :metabase.upload.types/offset-datetime :type/DateTimeWithTZ
   :metabase.upload.types/text            :type/Text
   :metabase.upload.types/varchar-255     :type/Text})

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
  "Reads `file` and returns `[header-row & data-rows]` as vectors of strings."
  [^File file]
  (with-open [reader (->reader file)]
    ;; Realise the lazy seq inside with-open so the reader isn't closed first.
    (vec (csv/read-csv reader))))

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
          {:error-type      ::header-mismatch
           :missing-columns (vec missing-columns)
           :extra-columns   (vec extra-columns)
           :csv-header      (vec csv-header)
           :schema-names    (vec schema-names)})))

(defn- unparseable-cell-error
  "Throws an ex-info with `::unparseable-cell` type.

  `row-index`   — 0-based index into the data rows (not counting the header).
  `column-name` — name of the column whose value failed to parse.
  `raw-value`   — the original string from the CSV cell."
  [row-index column-name raw-value cause]
  (throw (ex-info
          (str "Could not parse value " (pr-str raw-value)
               " in column " (pr-str column-name)
               " at row " row-index ".")
          {:error-type  ::unparseable-cell
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
  (if (str/blank? s)
    nil
    (try
      (parser s)
      (catch Exception e
        (unparseable-cell-error row-index column-name s e)))))

(defn- parse-row
  "Parse one data row (vector of strings) using per-column parsers.
  `row-index` is 0-based (does not count the header row)."
  [parsers column-names row-index row]
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
;; Inference path
;; ---------------------------------------------------------------------------

(defn- infer-columns
  "Infer column base-types from `rows` (string vectors) using upload type
  inference.  Returns a vector of `{:name :base-type :nullable?}` maps in CSV
  column order.

  All inferred columns are `nullable? true` (we cannot determine NOT NULL
  constraints from data alone)."
  [column-names rows]
  (let [settings     (upload/get-settings)
        ;; column-types-from-rows expects [existing-types rows] where existing-types
        ;; are nil for new columns (no prior schema).
        existing     (vec (repeat (count column-names) nil))
        upload-types (upload/column-types-from-rows settings existing rows)]
    (mapv (fn [col-name upload-type]
            {:name      col-name
             :base-type (get upload-type->base-type upload-type :type/Text)
             :nullable? true})
          column-names
          upload-types)))

(defn- parse-with-inference
  "Parse `rows` (vectors of strings, no header) under inferred types.
  Returns `{:columns [...] :rows [...]}` where columns carry inferred base-types."
  [column-names rows]
  (let [columns  (infer-columns column-names rows)
        settings (upload/get-settings)
        parsers  (mapv (fn [{:keys [base-type]}]
                         (upload/upload-type->parser (base-type->upload-type base-type)
                                                     settings))
                       columns)
        names    (mapv :name columns)
        parsed   (vec (map-indexed (fn [idx row]
                                     (parse-row parsers names idx row))
                                   rows))]
    {:columns columns
     :rows    parsed}))

;; ---------------------------------------------------------------------------
;; Public API
;; ---------------------------------------------------------------------------

(defn parse-fixture
  "Parse a fixture CSV file into typed rows suitable for seeding a scratch table.

  Arguments:
  - `csv-file`      — `java.io.File` (e.g. a multipart upload temp file).
  - `target-schema` — `nil` (infer from data) OR a sequence of column descriptors
                      in any order:
                      `[{:name <string> :base-type <kw> :nullable? <bool>} ...]`
                      These come from real `:metadata/table` + field metadata; the
                      caller is responsible for building this from the DB.

  Returns:
  ```
  {:columns [{:name <string> :base-type <kw> :nullable? <bool>} ...]
   :rows    [[v1 v2 ...] ...]}
  ```
  `:columns` are in CSV column order.  `:rows` are vectors of plain Clojure
  values, one per data row, in the same column order.

  Throws (all via `ex-info` with typed `:error-type` in ex-data):
  - `::header-mismatch`   — CSV header ≠ schema column names (case-sensitive,
                            exact match; ex-data includes `:missing-columns` and
                            `:extra-columns`).
  - `::unparseable-cell`  — a cell value could not be parsed as the column type;
                            ex-data includes `:row-index` (0-based), `:column-name`,
                            and `:raw-value`."
  [^File csv-file target-schema]
  (let [rows        (read-csv csv-file)
        header      (first rows)
        data-rows   (rest rows)]
    (if (nil? target-schema)
      ;; --- Inference path ---------------------------------------------------
      (parse-with-inference (vec header) (vec data-rows))
      ;; --- Schema-driven path -----------------------------------------------
      (let [schema-names (set (map :name target-schema))
            csv-names    (set header)
            missing      (set/difference schema-names csv-names)
            extra        (set/difference csv-names schema-names)]
        (when (or (seq missing) (seq extra))
          (header-mismatch-error missing extra header (map :name target-schema)))
        ;; Re-order the schema to match the CSV column order.
        (let [name->col      (into {} (map (juxt :name identity)) target-schema)
              ordered-schema (mapv name->col header)
              parsed-rows    (parse-with-schema ordered-schema (vec data-rows))]
          {:columns ordered-schema
           :rows    parsed-rows})))))
