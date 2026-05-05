(ns metabase.starrez.db
  "JDBC layer for the StarRez data Postgres.

  Owns the connection to the user-provisioned Postgres (separate from Metabase's
  app DB) and exposes:

  - schema bootstrap (`starrez_data`, `starrez_meta`, `starrez_meta.weeks`)
  - per-export bookkeeping (`record-export-week!`)
  - week activation (`activate-week!`) — drops & recreates `starrez_data.*`
    tables from the CSV snapshots stored in blob.
  - listing (`list-weeks`)

  All connections force `sslmode=require` since Azure Postgres rejects
  unencrypted connections."
  (:require
   [cheshire.core :as json]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [metabase.starrez.settings :as starrez.settings]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as rs])
  (:import
   (java.io StringReader StringWriter)
   (org.postgresql.copy CopyManager)
   (org.postgresql.core BaseConnection)))

(set! *warn-on-reflection* true)

(def ^:private data-schema "starrez_data")
(def ^:private meta-schema "starrez_meta")
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
   (str "CREATE UNIQUE INDEX IF NOT EXISTS weeks_week_start_uniq ON "
        meta-schema ".weeks (week_start)")
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
  "Upsert a row in `starrez_meta.weeks` for the current ISO week.
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
                           " ON CONFLICT (week_start) DO UPDATE SET"
                           "   fetched_at = EXCLUDED.fetched_at,"
                           "   blob_files = EXCLUDED.blob_files"
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

(defn- set-activation-timeouts! [conn]
  (jdbc/execute! conn ["SET LOCAL lock_timeout = '10s'"])
  (jdbc/execute! conn ["SET LOCAL statement_timeout = '5min'"]))

(defn activate-week!
  "Make `week-id` the active week:
  - drop existing `starrez_data.*` tables in this week's blob_files
  - download each blob CSV via `download-csv` (a fn `blob-name -> CSV string`)
  - recreate tables from CSV headers
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
                (let [results (mapv (fn [{:keys [table-name csv-rows]}]
                                      (log/infof "Loading StarRez table for week %s: %s" week-id table-name)
                                      (create-and-load-table! conn table-name csv-rows))
                                    csvs)]
                (jdbc/execute! conn [(str "UPDATE " meta-schema ".weeks SET is_active = FALSE WHERE is_active = TRUE")])
                (jdbc/execute! conn [(str "UPDATE " meta-schema ".weeks SET is_active = TRUE WHERE id = ?") week-id])
                (.commit conn)
                {:results results :error nil})
                (catch Exception e
                  (try
                    (.rollback conn)
                    (catch Exception rollback-e
                      (log/warnf rollback-e "Rollback failed while activating StarRez week %s" week-id)))
                  (throw e))))))
        (catch Exception e
          (log/errorf e "activate-week! failed for %s" week-id)
          {:error (ex-message e)})))))
