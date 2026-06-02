(ns metabase.starrez.db
  "JDBC layer for the StarRez data Postgres.

  Owns the connection to the user-provisioned Postgres (separate from Metabase's
  app DB) and exposes:

  - schema bootstrap (`starrez_data`, `starrez_meta`, `starrez_meta.weeks`)
  - per-export bookkeeping (`record-export-week!`)
  - cumulative report merging by `booking_id`
  - week activation (`activate-week!`) — loads report previews into
    `starrez_data.active_report` and recreates non-report snapshot tables.
  - listing (`list-weeks`)

  All connections force `sslmode=require` since Azure Postgres rejects
  unencrypted connections."
  (:require
   [cheshire.core :as json]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [metabase.starrez.settings :as starrez.settings]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs]
   [toucan2.core :as t2])
  (:import
   (java.io StringReader StringWriter)
   (org.postgresql.copy CopyManager)
   (org.postgresql.core BaseConnection)))

(set! *warn-on-reflection* true)

(def ^:private data-schema "starrez_data")
(def ^:private meta-schema "starrez_meta")
(def ^:private active-report-table "active_report")
(def ^:private report-merge-key "booking_id")
(def ^:private postgres-max-columns 1600)

(defn- configured? []
  (and (seq (starrez.settings/starrez-pg-host))
       (seq (starrez.settings/starrez-pg-database))
       (seq (starrez.settings/starrez-pg-user))
       (seq (starrez.settings/starrez-pg-password))))

(defn- jdbc-spec []
  {:dbtype   "postgresql"
   :host     (starrez.settings/starrez-pg-host)
   :port     5432
   :dbname   (starrez.settings/starrez-pg-database)
   :user     (starrez.settings/starrez-pg-user)
   :password (starrez.settings/starrez-pg-password)
   :sslmode  "require"
   :connectTimeout 10})

(defn- get-connection
  "Open a connection. Caller is responsible for closing via `with-open`."
  ^java.sql.Connection []
  (jdbc/get-connection (jdbc-spec)))

(defn test-connection
  "Verify the StarRez Postgres connection. Returns {:ok true} or {:ok false :error}."
  []
  (cond
    (not (configured?))
    {:ok false :error "Postgres connection settings are incomplete"}
    :else
    (try
      (with-open [conn (get-connection)]
        (jdbc/execute-one! conn ["SELECT 1"]))
      {:ok true :message "Connected to StarRez Postgres successfully"}
      (catch Exception e
        {:ok false :error (ex-message e)}))))

(def ^:private bootstrap-ddl
  [(str "CREATE SCHEMA IF NOT EXISTS " data-schema)
   (str "CREATE SCHEMA IF NOT EXISTS " meta-schema)
   (str "CREATE TABLE IF NOT EXISTS " meta-schema ".weeks ("
        " id           BIGSERIAL PRIMARY KEY,"
        " week_start   DATE        NOT NULL,"
        " fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        " is_active    BOOLEAN     NOT NULL DEFAULT FALSE,"
        " blob_files   JSONB       NOT NULL,"
        " notes        TEXT)")
   (str "DROP INDEX IF EXISTS " meta-schema ".weeks_week_start_uniq")
   (str "CREATE UNIQUE INDEX IF NOT EXISTS weeks_one_active ON "
        meta-schema ".weeks (is_active) WHERE is_active = TRUE")])

(defn ensure-schema!
  "Idempotently create the StarRez schemas + weeks registry. Safe to call repeatedly.
  Returns true on success, false (and logs) on failure or when not configured."
  []
  (if-not (configured?)
    (do (log/warn "Skipping StarRez Postgres bootstrap: connection not configured") false)
    (try
      (with-open [conn (get-connection)]
        (doseq [stmt bootstrap-ddl]
          (jdbc/execute! conn [stmt])))
      (log/info "StarRez Postgres schema bootstrap complete")
      true
      (catch Exception e
        (log/errorf e "StarRez Postgres bootstrap failed")
        false))))

(defn- ^java.time.LocalDate monday-of [^java.time.LocalDate d]
  (.with d (java.time.temporal.TemporalAdjusters/previousOrSame
            java.time.DayOfWeek/MONDAY)))

(defn- this-monday []
  (monday-of (java.time.LocalDate/now)))

(defonce ^:private bootstrap-once! (atom false))

(defn- bootstrap-if-needed! []
  (when (and (configured?) (compare-and-set! bootstrap-once! false true))
    (when-not (ensure-schema!)
      (reset! bootstrap-once! false))))

(defn record-export-week!
  "Insert a row in `starrez_meta.weeks` for the current export snapshot.
  `blob-files` is a {table-or-report-name blob-name} map.
  Returns the row id, or nil on failure."
  [blob-files]
  (cond
    (not (configured?))
    (do (log/warn "Skipping weeks-registry update: Postgres not configured") nil)

    :else
    (do
      (bootstrap-if-needed!)
      (try
        (with-open [conn (get-connection)]
          (let [row (jdbc/execute-one!
                     conn
                     [(str "INSERT INTO " meta-schema ".weeks (week_start, fetched_at, blob_files)"
                           " VALUES (?, NOW(), ?::jsonb)"
                           " RETURNING id")
                      (java.sql.Date/valueOf ^java.time.LocalDate (this-monday))
                      (json/generate-string blob-files)]
                     {:builder-fn rs/as-unqualified-lower-maps})]
            (:id row)))
        (catch Exception e
          (log/errorf e "Failed to record export week")
          nil)))))

(declare list-weeks-result)

(defn list-weeks
  "Return all weeks newest-first as plain maps. `blob_files` is parsed JSON."
  []
  (:weeks (list-weeks-result)))

(defn list-weeks-result
  "Return all weeks newest-first, or an error message if the registry cannot be read."
  []
  (cond
    (not (configured?)) {:weeks [] :error "Postgres connection settings are incomplete"}
    :else
    (do
      (bootstrap-if-needed!)
      (try
        (with-open [conn (get-connection)]
          {:weeks
           (->> (jdbc/execute!
                 conn
                 [(str "SELECT id, week_start, fetched_at, is_active, blob_files, notes"
                       " FROM " meta-schema ".weeks"
                       " ORDER BY week_start DESC, id DESC")]
                 {:builder-fn rs/as-unqualified-lower-maps})
                (mapv
                 (fn [row]
                   (update row :blob_files
                           (fn [v]
                             (when v
                               (json/parse-string
                                (str (.getValue ^org.postgresql.util.PGobject v))
                                keyword)))))))})
        (catch Exception e
          (log/errorf e "Failed to list StarRez weeks")
          {:weeks [] :error (ex-message e)})))))

(defn- report-snapshot-entry? [[_ blob-name]]
  (some-> blob-name (str/starts-with? "starrez_report_")))

(defn- distinct-in-order [xs]
  (second
   (reduce (fn [[seen ordered] x]
             (if (contains? seen x)
               [seen ordered]
               [(conj seen x) (conj ordered x)]))
           [#{} []]
           xs)))

(defn report-ids-for-export
  "Return report IDs in first-seen order, followed by newly configured IDs.
  Successfully recorded historical reports keep getting refreshed even after
  they are removed from the current setting."
  [configured-report-ids]
  (distinct-in-order
   (concat
    (for [week       (reverse (list-weeks))
          [report-id _blob-name :as entry] (:blob_files week)
          :when      (report-snapshot-entry? entry)]
      (name report-id))
    configured-report-ids)))

(defn- safe-ident-name
  "Produce a stable lower-snake identifier. Prefix leading digits because
  StarRez exports can include numeric CSV headers."
  [s fallback]
  (let [base (-> (str s)
                 (str/replace #"[^A-Za-z0-9]+" "_")
                 (str/replace #"^_+|_+$" "")
                 (str/replace #"_+" "_")
                 str/lower-case)
        base (if (str/blank? base) fallback base)]
    (if (re-find #"^[0-9]" base)
      (str fallback "_" base)
      base)))

(defn- safe-table-name [s]
  (safe-ident-name s "table"))

(defn- safe-column-name [s]
  (safe-ident-name s "column"))

(defn- normalize-db-detail [s]
  (some-> s str str/trim str/lower-case))

(defn- database-detail-name [details]
  (or (:dbname details) (:db details) (:database details)))

(defn- matching-metabase-database? [{:keys [details]}]
  (and (= (normalize-db-detail (:host details))
          (normalize-db-detail (starrez.settings/starrez-pg-host)))
       (= (normalize-db-detail (database-detail-name details))
          (normalize-db-detail (starrez.settings/starrez-pg-database)))))

(defn- starrez-metabase-database []
  (or (when-let [database-id (starrez.settings/starrez-metabase-database-id)]
        (t2/select-one :model/Database :id database-id))
      (some->> (t2/select :model/Database :engine "postgres")
               (filter matching-metabase-database?)
               first)))

(defn- sync-metabase-schema! []
  (try
    (if-let [database (starrez-metabase-database)]
      (do
        (log/infof "Syncing Metabase metadata for StarRez database %s" (:id database))
        (sync-metadata/sync-db-metadata! database)
        {:database_id (:id database)
         :synced      true})
      (do
        (log/warn "Skipping Metabase metadata sync: no matching Metabase database found")
        {:synced false
         :error  "No matching Metabase database found. Set the StarRez Metabase Database ID."}))
    (catch Exception e
      (log/errorf e "Failed to sync Metabase metadata for StarRez database")
      {:synced false
       :error  (ex-message e)})))

(defn refresh-snapshots!
  "Return the latest StarRez snapshots and synchronously refresh the Metabase
  metadata for the configured StarRez Postgres database."
  []
  (assoc (list-weeks-result)
         :metadata_sync (sync-metabase-schema!)))

(defn- unique-column-names [headers]
  (loop [names (map safe-column-name headers)
         seen  {}
         out   []]
    (if-let [column-name (first names)]
      (let [n           (inc (get seen column-name 0))
            unique-name (if (= n 1) column-name (str column-name "_" n))]
        (recur (rest names)
               (assoc seen column-name n)
               (conj out unique-name)))
      out)))

(defn- quote-ident [s]
  (str "\"" (str/replace (str s) "\"" "\"\"") "\""))

(defn- qualified-table-name [schema table]
  (str (quote-ident schema) "." (quote-ident table)))

(defn- copy-rows!
  [^java.sql.Connection conn tbl cols rows]
  (let [copy-sql (str "COPY " tbl " ("
                      (str/join ", " (map quote-ident cols))
                      ") FROM STDIN WITH (FORMAT csv)")
        writer   (StringWriter.)]
    (csv/write-csv writer rows)
    (with-open [reader (StringReader. (str writer))]
      (.copyIn (CopyManager. (.unwrap conn BaseConnection)) copy-sql reader))))

(defn- query-count [conn sql-params]
  (:count
   (jdbc/execute-one! conn sql-params
                      {:builder-fn rs/as-unqualified-lower-maps})))

(defn- table-exists? [conn table-name]
  (:exists
   (jdbc/execute-one!
    conn
    ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?) AS exists"
     data-schema
     table-name]
    {:builder-fn rs/as-unqualified-lower-maps})))

(defn- table-columns [conn table-name]
  (mapv :column_name
        (jdbc/execute!
         conn
         ["SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position"
          data-schema
          table-name]
         {:builder-fn rs/as-unqualified-lower-maps})))

(defn- prepare-report-csv
  "Validate and normalize a report CSV for cumulative merging."
  [csv-rows]
  (let [headers      (first csv-rows)
        _            (when-not (seq headers)
                       (throw (ex-info "CSV has no header row" {})))
        columns      (unique-column-names headers)
        _            (when (> (count columns) postgres-max-columns)
                       (throw (ex-info (format "CSV has %d columns after parsing, which exceeds Postgres limit %d"
                                               (count columns)
                                               postgres-max-columns)
                                       {:columns     (count columns)
                                        :max-columns postgres-max-columns})))
        booking-idx  (.indexOf ^java.util.List columns report-merge-key)
        _            (when (neg? booking-idx)
                       (throw (ex-info "CSV is missing required booking_id column" {})))
        rows         (mapv (fn [row]
                             (let [row (vec (take (count columns) (concat row (repeat ""))))]
                               (assoc row booking-idx (str/trim (str (get row booking-idx))))))
                           (rest csv-rows))
        booking-ids  (mapv #(get % booking-idx) rows)
        blank-count  (count (filter str/blank? booking-ids))
        duplicates   (->> booking-ids frequencies (keep (fn [[booking-id n]] (when (> n 1) booking-id))) vec)]
    (when (pos? blank-count)
      (throw (ex-info "CSV contains blank booking_id values" {:blank_booking_ids blank-count})))
    (when (seq duplicates)
      (throw (ex-info "CSV contains duplicate booking_id values" {:duplicate_booking_ids duplicates})))
    {:columns columns
     :rows    rows}))

(defn- create-table! [conn table-name columns]
  (let [tbl     (qualified-table-name data-schema table-name)
        col-ddl (str/join ", " (map #(str (quote-ident %) " TEXT") columns))]
    (jdbc/execute! conn [(str "CREATE TABLE " tbl " (" col-ddl ")")])))

(defn- add-missing-columns! [conn table-name source-columns]
  (let [tbl           (qualified-table-name data-schema table-name)
        existing-cols (set (table-columns conn table-name))
        added-cols    (filterv #(not (contains? existing-cols %)) source-columns)]
    (doseq [column added-cols]
      (jdbc/execute! conn [(str "ALTER TABLE " tbl " ADD COLUMN " (quote-ident column) " TEXT")]))
    added-cols))

(defn- assert-valid-destination-booking-ids! [conn table-name]
  (let [tbl         (qualified-table-name data-schema table-name)
        booking-col (quote-ident report-merge-key)
        blank-count (query-count conn [(str "SELECT COUNT(*) AS count FROM " tbl
                                            " WHERE NULLIF(BTRIM(" booking-col "), '') IS NULL")])
        duplicates  (query-count conn [(str "SELECT COUNT(*) AS count FROM (SELECT " booking-col
                                            " FROM " tbl
                                            " GROUP BY " booking-col
                                            " HAVING COUNT(*) > 1) duplicate_booking_ids")])]
    (when (pos? blank-count)
      (throw (ex-info "Cumulative destination contains blank booking_id values"
                      {:blank_booking_ids blank-count})))
    (when (pos? duplicates)
      (throw (ex-info "Cumulative destination contains duplicate booking_id values"
                      {:duplicate_booking_ids duplicates})))))

(defn- normalize-destination-booking-ids! [conn table-name]
  (let [tbl         (qualified-table-name data-schema table-name)
        booking-col (quote-ident report-merge-key)]
    (jdbc/execute! conn [(str "UPDATE " tbl
                              " SET " booking-col " = BTRIM(" booking-col ")"
                              " WHERE " booking-col " IS NOT NULL"
                              " AND " booking-col " <> BTRIM(" booking-col ")")])))

(defn- ensure-booking-id-index! [conn table-name]
  (let [index-name  (str table-name "_" report-merge-key "_uniq")
        tbl         (qualified-table-name data-schema table-name)
        booking-col (quote-ident report-merge-key)]
    (jdbc/execute! conn [(str "CREATE UNIQUE INDEX IF NOT EXISTS "
                              (qualified-table-name data-schema index-name)
                              " ON " tbl " (" booking-col ")")])))

(defn- ensure-cumulative-table! [conn table-name columns]
  (if (table-exists? conn table-name)
    (add-missing-columns! conn table-name columns)
    (do
      (create-table! conn table-name columns)
      columns)))

(defn- create-staging-table! [conn columns]
  (let [table-name (str "starrez_report_merge_" (str/replace (str (random-uuid)) "-" ""))
        tbl        (quote-ident table-name)
        col-ddl    (str/join ", " (map #(str (quote-ident %) " TEXT") columns))]
    (jdbc/execute! conn [(str "CREATE TEMP TABLE " tbl " (" col-ddl ") ON COMMIT DROP")])
    tbl))

(declare read-csv set-activation-timeouts!)

(defn- merge-staging-table! [conn destination-table staging-table columns]
  (let [destination   (qualified-table-name data-schema destination-table)
        booking-col   (quote-ident report-merge-key)
        quoted-cols   (mapv quote-ident columns)
        update-cols   (remove #{booking-col} quoted-cols)
        update-result (if (seq update-cols)
                        (query-count
                         conn
                         [(str "WITH updated AS (UPDATE " destination " destination"
                               " SET " (str/join ", " (map #(str % " = staging." %) update-cols))
                               " FROM " staging-table " staging"
                               " WHERE destination." booking-col " = staging." booking-col
                               " RETURNING 1) SELECT COUNT(*) AS count FROM updated")])
                        0)
        insert-result (query-count
                       conn
                       [(str "WITH inserted AS (INSERT INTO " destination
                             " (" (str/join ", " quoted-cols) ")"
                             " SELECT " (str/join ", " (map #(str "staging." %) quoted-cols))
                             " FROM " staging-table " staging"
                             " WHERE NOT EXISTS (SELECT 1 FROM " destination " destination"
                             " WHERE destination." booking-col " = staging." booking-col ")"
                             " RETURNING 1) SELECT COUNT(*) AS count FROM inserted")])]
    {:inserted insert-result
     :updated  update-result}))

(defn- merge-report-csv!
  [destination-table report-id csv-body]
  (try
    (let [{:keys [columns rows]} (prepare-report-csv (read-csv csv-body))]
      (with-open [conn (get-connection)]
        (.setAutoCommit conn false)
        (try
          (set-activation-timeouts! conn)
          (let [added-columns (ensure-cumulative-table! conn destination-table columns)
                _             (normalize-destination-booking-ids! conn destination-table)
                _             (assert-valid-destination-booking-ids! conn destination-table)
                _             (ensure-booking-id-index! conn destination-table)
                staging-table (create-staging-table! conn columns)
                _             (when (seq rows)
                                (copy-rows! conn staging-table columns rows))
                result        (merge-staging-table! conn destination-table staging-table columns)]
            (.commit conn)
            (merge {:report_id         report-id
                    :destination_table (str data-schema "." destination-table)
                    :added_columns     added-columns}
                   result))
          (catch Exception e
            (.rollback conn)
            (throw e)))))
    (catch Exception e
      (log/errorf e "Failed to merge StarRez report %s into cumulative table %s" report-id destination-table)
      {:report_id         report-id
       :destination_table (str data-schema "." destination-table)
       :error             (ex-message e)})))

(defn merge-report-exports!
  "Merge successful report CSVs into the earliest report-ID table.
  Reports are applied in first-seen order so newer reports win conflicts."
  [ordered-report-ids report-results]
  (let [destination-table (some-> ordered-report-ids first safe-table-name)
        results-by-id     (into {} (map (juxt :name identity)) report-results)
        merges            (when destination-table
                            (mapv (fn [report-id]
                                    (if-let [result (get results-by-id report-id)]
                                      (if (and (:success result) (seq (:csv_body result)))
                                        (merge-report-csv! destination-table report-id (:csv_body result))
                                        {:report_id         report-id
                                         :destination_table (str data-schema "." destination-table)
                                         :error             (or (:error result) "Report export failed")})
                                      {:report_id         report-id
                                       :destination_table (str data-schema "." destination-table)
                                       :error             "Report export result missing"}))
                                  ordered-report-ids))]
    {:destination_table (when destination-table (str data-schema "." destination-table))
     :reports           (or merges [])
     :metadata_sync     (when destination-table (sync-metabase-schema!))}))

(defn- read-csv [^String csv-str]
  (with-open [r (StringReader. csv-str)]
    (doall (csv/read-csv r))))

(defn- get-week [week-id]
  (with-open [conn (get-connection)]
    (jdbc/execute-one!
     conn
     [(str "SELECT id, week_start, blob_files FROM " meta-schema ".weeks WHERE id = ?")
      week-id]
     {:builder-fn rs/as-unqualified-lower-maps})))

(defn- parse-blob-files [week]
  (json/parse-string
   (str (.getValue ^org.postgresql.util.PGobject (:blob_files week)))
   keyword))

(defn- download-week-csvs [week-id blob-files download-csv]
  (mapv (fn [[table-kw blob-name]]
          (log/infof "Downloading StarRez blob for week %s: %s" week-id blob-name)
          (let [csv-str (download-csv blob-name)]
            (when-not (seq csv-str)
              (throw (ex-info "CSV download empty" {:blob blob-name})))
            {:table-name (name table-kw)
             :blob-name  blob-name
             :csv-rows   (read-csv csv-str)}))
        blob-files))

(defn- create-and-load-table!
  "Inside an open connection, create `<data-schema>.<table>` from the CSV header
  and bulk-insert all rows. Drops the table first if it exists."
  [conn table-name csv-rows]
  (let [headers (first csv-rows)
        rows    (rest csv-rows)
        _       (when-not (seq headers)
                  (throw (ex-info "CSV has no header row" {:table table-name})))
        cols    (unique-column-names headers)
        _       (when (> (count cols) postgres-max-columns)
                  (throw (ex-info (format "CSV for %s has %d columns after parsing, which exceeds Postgres limit %d. The file may not be newline-delimited correctly."
                                          table-name
                                          (count cols)
                                          postgres-max-columns)
                                  {:table table-name
                                   :columns (count cols)
                                   :max-columns postgres-max-columns})))
        tbl     (qualified-table-name data-schema (safe-table-name table-name))
        col-ddl (str/join ", " (map #(str (quote-ident %) " TEXT") cols))]
    (log/infof "Dropping StarRez table if it exists: %s" tbl)
    (jdbc/execute! conn [(str "DROP TABLE IF EXISTS " tbl)])
    (log/infof "Creating StarRez table: %s (%d columns)" tbl (count cols))
    (jdbc/execute! conn [(str "CREATE TABLE " tbl " (" col-ddl ")")])
    (when (seq rows)
      (log/infof "Copying %d rows into StarRez table: %s" (count rows) tbl)
      (copy-rows! conn tbl cols rows))
    (log/infof "Loaded StarRez table: %s (%d rows)" tbl (count rows))
    {:table tbl :rows (count rows) :cols (count cols)}))

(defn- report-csv? [{:keys [blob-name]}]
  (str/includes? blob-name "starrez_report_"))

(defn- load-snapshot-tables!
  "Load a report snapshot into the preview table. Non-report snapshots continue
  to recreate their named tables. Refuse legacy snapshots that contain multiple
  reports so preview activation cannot overwrite a cumulative report table."
  [conn csvs]
  (let [report-csvs (filterv report-csv? csvs)
        table-csvs  (filterv (complement report-csv?) csvs)]
    (when (> (count report-csvs) 1)
      (throw (ex-info "Snapshot contains multiple reports. Activate a snapshot for one report ID."
                      {:reports (mapv :table-name report-csvs)})))
    (into (mapv (fn [{:keys [table-name csv-rows]}]
                  (create-and-load-table! conn table-name csv-rows))
                table-csvs)
          (mapv (fn [{:keys [csv-rows]}]
                  (create-and-load-table! conn active-report-table csv-rows))
                report-csvs))))

(defn- set-activation-timeouts! [conn]
  (jdbc/execute! conn ["SET LOCAL lock_timeout = '10s'"])
  (jdbc/execute! conn ["SET LOCAL statement_timeout = '5min'"]))

(defn activate-week!
  "Make `week-id` the active week:
  - download each blob CSV via `download-csv` (a fn `blob-name -> CSV string`)
  - load a report CSV into `starrez_data.active_report`
  - for non-report snapshots, recreate named `starrez_data.*` tables
  - refuse legacy snapshots containing multiple report CSVs
  - flip the `is_active` flag
  Returns {:results [...] :error nil} on success."
  [week-id download-csv]
  (if-not (configured?)
    {:error "Postgres not configured"}
    (do
      (bootstrap-if-needed!)
      (try
        (let [week (get-week week-id)]
          (when-not week
            (throw (ex-info "Week not found" {:week-id week-id})))
          (let [blob-files (parse-blob-files week)
                csvs       (download-week-csvs week-id blob-files download-csv)]
            (with-open [conn (get-connection)]
              (.setAutoCommit conn false)
              (try
                (set-activation-timeouts! conn)
                (let [results (load-snapshot-tables! conn csvs)]
                  (jdbc/execute! conn [(str "UPDATE " meta-schema ".weeks SET is_active = FALSE WHERE is_active = TRUE")])
                  (jdbc/execute! conn [(str "UPDATE " meta-schema ".weeks SET is_active = TRUE WHERE id = ?") week-id])
                  (.commit conn)
                  {:results       results
                   :metadata_sync (sync-metabase-schema!)
                   :error         nil})
                (catch Exception e
                  (try
                    (.rollback conn)
                    (catch Exception rollback-e
                      (log/warnf rollback-e "Rollback failed while activating StarRez week %s" week-id)))
                  (throw e))))))
        (catch Exception e
          (log/errorf e "activate-week! failed for %s" week-id)
          {:error (ex-message e)})))))
