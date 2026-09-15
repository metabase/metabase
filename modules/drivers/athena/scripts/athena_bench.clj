(ns athena-bench
  "Standalone Athena sync benchmark. Raw JDBC only — no Metabase deps — so it
  measures exactly what the driver does at the wire level:

    legacy: .getSchemas -> .getTables -> .getColumns per table (serial), the
            path athena.clj describe-table/describe-database take today
    fast:   one streaming information_schema.columns query, the proposed
            describe-fields path

  Reports timings, row counts, and sampled max used heap while streaming, to
  answer the e24s01 question: does the thin driver stream or buffer?"
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- spec []
  (let [region (System/getenv "MB_ATHENA_TEST_REGION")
        staging (System/getenv "MB_ATHENA_TEST_S3_STAGING_DIR")
        catalog (or (System/getenv "MB_ATHENA_TEST_CATALOG") "AwsDataCatalog")
        ak (System/getenv "MB_ATHENA_TEST_ACCESS_KEY")
        sk (System/getenv "MB_ATHENA_TEST_SECRET_KEY")]
    (cond-> {:classname "com.amazon.athena.jdbc.AthenaDriver"
             :subprotocol "athena"
             :subname (str "//athena." region ".amazonaws.com:443")
             :OutputLocation staging
             :Region region
             :Catalog catalog}
      (and ak sk) (assoc :User ak :Password sk)
      (not (and ak sk)) (assoc :CredentialsProvider "DefaultChain"))))

(defn- ignored-schemas []
  (set (remove str/blank? (str/split (or (System/getenv "MB_ATHENA_TEST_IGNORE_DBS") "") #","))))

(defn heap-used-mb ^long []
  (let [rt (Runtime/getRuntime)]
    (long (/ (- (.totalMemory rt) (.freeMemory rt)) (* 1024 1024)))))

(defn- with-heap-sampler
  "Runs (f), sampling max used heap every 100ms into the returned atom."
  [f]
  (let [max-heap (atom (heap-used-mb))
        stop (atom false)]
    (let [sampler (future
                    (while (not @stop)
                      (swap! max-heap max (heap-used-mb))
                      (Thread/sleep 100)))]
      (try (f) (finally (reset! stop true) (deref sampler 5000 nil)))
      @max-heap)))

(defn- bench-legacy [table-limit]
  (println "== legacy: serial .getColumns per table (today's path) ==")
  (with-open [conn (jdbc/get-connection (spec))]
    (let [md (.getMetaData conn)
          _ (println "listing schemas...")
          schemas (->> (jdbc/metadata-result (.getSchemas md nil "%"))
                       (map :table_schem)
                       (remove (ignored-schemas))
                       doall)
          _ (println "found" (count schemas) "schemas;" schemas)
          t0 (System/nanoTime)
          tables (mapcat (fn [s] (jdbc/metadata-result (.getTables md nil s "%" (into-array String ["TABLE" "VIEW"])))) schemas)
          tables (if table-limit (take table-limit tables) tables)
          tables (doall tables)
          t-list (long (/ (- (System/nanoTime) t0) 1e6))]
      (println "listed" (count tables) "tables in" t-list "ms")
      (let [t0 (System/nanoTime)
            max-heap (with-heap-sampler
                       (fn []
                         (reduce (fn [n {:keys [table_schem table_name]}]
                                   (jdbc/metadata-result (.getColumns md nil table_schem table_name nil))
                                   (inc n))
                                 0 tables)))
            ms (long (/ (- (System/nanoTime) t0) 1e6))]
        (println "legacy getColumns over" (count tables) "tables:" ms "ms total;"
                 (if (and table-limit (pos? (count tables)))
                   (str "per-table avg " (long (/ ms (count tables))) " ms;")
                   "")
                 "max used heap" max-heap "MB")))))

(def fast-query
  "SELECT table_schema, table_name, column_name, ordinal_position, data_type
   FROM information_schema.columns
   WHERE table_schema NOT IN ('information_schema')
   ORDER BY table_schema, table_name, ordinal_position")

(defn- bench-fast []
  (println "== fast: single streaming information_schema.columns query ==")
  (let [rows (volatile! 0)
        t0 (System/nanoTime)
        max-heap (with-heap-sampler
                   (fn []
                     (jdbc/query (spec) [fast-query]
                                 {:fetch-size 1000
                                  :row-fn (fn [row] (vswap! rows inc) row)
                                  :result-set-fn (fn [rs] (reduce (fn [_ _] nil) nil rs))
                                  :identifiers identity})))]
    (println "fast query streamed" @rows "rows in"
             (long (/ (- (System/nanoTime) t0) 1e6)) "ms; max used heap" max-heap "MB")))

(defn- parse-table-limit
  [args]
  (when (= (first args) "--tables")
    (try (Long/parseLong (second args)) (catch Exception _ nil))))

(defn -main
  [& [mode & rest]]
  (let [mode (or mode "all")
        table-limit (parse-table-limit rest)]
    (case mode
      "help" (println "modes: legacy | fast | all [--tables N]")
      "legacy" (bench-legacy table-limit)
      "fast" (bench-fast)
      "all" (do (bench-legacy table-limit) (bench-fast))
      (do (println "unknown mode:" mode "; use legacy|fast|all") (System/exit 1)))
    (System/exit 0)))
