(ns metabase.prototype.samples
  "Prototype: random samples of the slow tables, and exact statistics of their number columns. Metabase makes them in
  the background, before a user opens a question, so that the filter widgets of slow tables show a histogram at once.

  The samples are in the `prototype_sample` schema of the app DB, with the same table names as the dataset. Sync
  reads only the `prototype_data` schema, so Metabase does not show them as tables. A query runs on the samples when
  its `:middleware` has `:prototype-sample? true`; see [[metabase.prototype.slow-queries]]."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(def schema-name
  "Postgres schema that holds the samples."
  "prototype_sample")

(def ^:private sample-size
  "Rows in each sample. Sync fingerprints a sample of 10,000 rows; the prototype tables are small, so a smaller sample
  shows the effect of the estimate better."
  5000)

(def ^:private version
  "Change it to make the samples again."
  1)

(def ^:private version-comment-prefix "metabase-prototype-sample version=")

(def ^:private number-types
  #{"smallint" "integer" "bigint" "numeric" "real" "double precision"})

(defn- version-string []
  (str version "/" dataset/version))

(defn- quote-name [s]
  (str \" s \"))

(defn- source-table [table-name]
  (str (quote-name dataset/schema-name) "." (quote-name table-name)))

(defn- sample-table [table-name]
  (str (quote-name schema-name) "." (quote-name table-name)))

(defn- sampled-version [conn]
  (when-let [comment (:c (jdbc/execute-one! conn
                                            ["SELECT obj_description(oid, 'pg_namespace') AS c
                                              FROM pg_namespace WHERE nspname = ?" schema-name]
                                            {:builder-fn jdbc.rs/as-unqualified-lower-maps}))]
    (when (str/starts-with? comment version-comment-prefix)
      (subs comment (count version-comment-prefix)))))

(defn- table-number-columns [conn table-name]
  (into []
        (comp (filter #(number-types (:data_type %)))
              (map :column_name))
        (jdbc/execute! conn
                       ["SELECT column_name, data_type FROM information_schema.columns
                         WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position"
                        dataset/schema-name table-name]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- make-sample! [conn table-name]
  (jdbc/execute! conn [(format "CREATE TABLE %s AS SELECT * FROM %s ORDER BY random() LIMIT %d"
                               (sample-table table-name) (source-table table-name) sample-size)])
  (let [row-count    (:n (jdbc/execute-one! conn [(format "SELECT count(*) AS n FROM %s" (source-table table-name))]
                                            {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
        sample-count (:n (jdbc/execute-one! conn [(format "SELECT count(*) AS n FROM %s" (sample-table table-name))]
                                            {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
        columns      (table-number-columns conn table-name)]
    (jdbc/execute! conn [(format "INSERT INTO %s.table_stats VALUES (?, ?, ?)" (quote-name schema-name))
                         table-name row-count sample-count])
    ;; One scan of the full table gives the exact min and max of all its number columns.
    (when (seq columns)
      (let [row (jdbc/execute-one! conn
                                   [(format "SELECT %s FROM %s"
                                            (str/join ", " (for [[i column] (map-indexed vector columns)]
                                                             (format "min(%1$s)::double precision AS min_%2$d,
                                                                      max(%1$s)::double precision AS max_%2$d"
                                                                     (quote-name column) i)))
                                            (source-table table-name))]
                                   {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
        (doseq [[i column] (map-indexed vector columns)]
          (jdbc/execute! conn [(format "INSERT INTO %s.column_stats VALUES (?, ?, ?, ?)" (quote-name schema-name))
                               table-name column
                               (get row (keyword (str "min_" i)))
                               (get row (keyword (str "max_" i)))]))))
    (log/infof "Prototype samples: %s, %d of %d rows" table-name sample-count row-count)))

(defn- make-samples! [conn]
  (jdbc/execute! conn [(format "DROP SCHEMA IF EXISTS %s CASCADE" (quote-name schema-name))])
  (jdbc/execute! conn [(format "CREATE SCHEMA %s" (quote-name schema-name))])
  (jdbc/execute! conn [(format "CREATE TABLE %s.table_stats (table_name text PRIMARY KEY, row_count bigint,
                                sample_count bigint)" (quote-name schema-name))])
  (jdbc/execute! conn [(format "CREATE TABLE %s.column_stats (table_name text, column_name text,
                                min_value double precision, max_value double precision,
                                PRIMARY KEY (table_name, column_name))" (quote-name schema-name))])
  ;; A fixed seed gives the same samples each time.
  (jdbc/execute! conn ["SELECT setseed(0.42)"])
  (doseq [table-name (sort dataset/slow-table-names)]
    (make-sample! conn table-name))
  (jdbc/execute! conn [(format "COMMENT ON SCHEMA %s IS '%s%s'"
                               (quote-name schema-name) version-comment-prefix (version-string))]))

(defn ensure-samples!
  "Make the samples when they are missing, out of date, or `force?` is true, for example after Metabase seeded the
  dataset again."
  [force?]
  (with-open [conn (jdbc/get-connection (mdb/data-source))]
    (when (or force? (not= (version-string) (sampled-version conn)))
      (log/info "Prototype samples: sampling the slow tables")
      (jdbc/with-transaction [tx conn]
        (make-samples! tx))
      (log/info "Prototype samples: done"))))

(defn sample-info
  "The samples for the frontend, by Metabase ids: the row count and the sample size of each slow table, and the exact
  min and max of its number columns."
  []
  (when-let [database-id (prototype.db/prototype-database-id)]
    (let [table-ids (prototype.db/table-ids-by-name database-id dataset/schema-name)
          query     (fn [sql]
                      (with-open [conn (jdbc/get-connection (mdb/data-source))]
                        (jdbc/execute! conn [sql] {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
          tables    (query (format "SELECT * FROM %s.table_stats" (quote-name schema-name)))
          columns   (query (format "SELECT * FROM %s.column_stats" (quote-name schema-name)))
          field-ids (into {}
                          (for [{:keys [table_name]} tables
                                :let  [table-id (get table-ids table_name)]
                                :when table-id]
                            [table_name (prototype.db/field-ids-by-name table-id)]))]
      {:tables  (vec (for [{:keys [table_name row_count sample_count]} tables
                           :let  [table-id (get table-ids table_name)]
                           :when table-id]
                       {:table_id table-id :row_count row_count :sample_count sample_count}))
       :columns (vec (for [{:keys [table_name column_name min_value max_value]} columns
                           :let  [field-id (get-in field-ids [table_name column_name])]
                           :when (and field-id (some? min_value) (some? max_value))]
                       {:field_id field-id :min min_value :max max_value}))})))
