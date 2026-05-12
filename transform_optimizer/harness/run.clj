;; Transform Optimizer — validation harness.
;;
;; Loads the dataset, runs every slow → fast pair from queries/, applies the
;; optimized-indexes script in between, and reports per-pair speedup +
;; equivalence (via EXCEPT ALL).
;;
;; Run via `./run.sh` (which provides next.jdbc + the Postgres driver on the
;; classpath) or directly with:
;;
;;   clojure -Sdeps '{:deps {com.github.seancorfield/next.jdbc {:mvn/version "1.3.939"}
;;                            org.postgresql/postgresql {:mvn/version "42.7.4"}}}' \
;;           run.clj [opts]
;;
;; Options
;;   --host HOST        (default localhost; env TO_DB_HOST)
;;   --port PORT        (default 5432;      env TO_DB_PORT)
;;   --db DBNAME        (default transform_optimizer; env TO_DB_NAME)
;;   --user USER        (default postgres;  env TO_DB_USER)
;;   --password PASS    (default empty;     env TO_DB_PASS)
;;   --reset            drop & reload schema + seed (skip to reuse a populated DB)
;;   --only q01,q04,…   limit to selected pairs

(ns transform-optimizer.harness.run
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [next.jdbc :as jdbc]))

;; ---------------------------------------------------------------------------
;; CLI

(def cli-defaults
  {:host     (or (System/getenv "TO_DB_HOST") "localhost")
   :port     (Long/parseLong (or (System/getenv "TO_DB_PORT") "5432"))
   :dbname   (or (System/getenv "TO_DB_NAME") "transform_optimizer")
   :user     (or (System/getenv "TO_DB_USER") "postgres")
   :password (or (System/getenv "TO_DB_PASS") "")
   :reset    false
   :only     nil})

(defn- parse-args [args]
  (loop [acc cli-defaults, args args]
    (if (empty? args)
      acc
      (let [[flag & rest] args]
        (case flag
          "--host"     (recur (assoc acc :host (first rest))                  (next rest))
          "--port"     (recur (assoc acc :port (Long/parseLong (first rest))) (next rest))
          "--db"       (recur (assoc acc :dbname (first rest))                (next rest))
          "--user"     (recur (assoc acc :user (first rest))                  (next rest))
          "--password" (recur (assoc acc :password (first rest))              (next rest))
          "--reset"    (recur (assoc acc :reset true)                         rest)
          "--only"     (recur (assoc acc :only (set (str/split (first rest) #","))) (next rest))
          (do (println "unknown flag:" flag) (System/exit 2)))))))

;; ---------------------------------------------------------------------------
;; Paths

(def ^:private project-root
  (-> (io/file *file*) .getAbsoluteFile .getParentFile .getParentFile))

(defn- project-file ^java.io.File [& parts]
  (apply io/file project-root parts))

;; ---------------------------------------------------------------------------
;; Datasource

(defn- make-ds [opts]
  (jdbc/get-datasource
   {:dbtype   "postgresql"
    :host     (:host opts)
    :port     (:port opts)
    :dbname   (:dbname opts)
    :user     (:user opts)
    :password (:password opts)
    ;; CREATE INDEX in 03_optimized_indexes can be hefty; let the planner pick freely
    :options  "-c statement_timeout=0"}))

;; ---------------------------------------------------------------------------
;; SQL parsing
;;
;; The qNN_*.sql files use three header markers: -- @meta, -- @slow, -- @fast.
;; Each section runs to the next -- @... line or EOF. We treat the LAST
;; statement of @fast as the comparison query (the prior statements set up
;; precompute tables for DAG proposals such as q07 / q08).

(defn- section [content tag]
  (let [marker (str "-- @" tag)]
    (loop [in? false, out [], [l & more :as ls] (str/split-lines content)]
      (cond
        (empty? ls)
        (str/join "\n" out)

        (= (str/trim l) marker)
        (recur true out more)

        (and in? (str/starts-with? (str/trim l) "-- @"))
        (str/join "\n" out)

        in?
        (recur in? (conj out l) more)

        :else
        (recur in? out more)))))

(defn- strip-line-comments [sql]
  (->> (str/split-lines sql)
       (map (fn [line]
              (if-let [idx (str/index-of line "--")]
                (subs line 0 idx)
                line)))
       (str/join "\n")))

(defn- split-statements [sql]
  (->> sql
       strip-line-comments
       (#(str/split % #";"))
       (map str/trim)
       (remove str/blank?)))

(defn- pair-files []
  (->> (.listFiles (project-file "queries"))
       (filter #(re-matches #"q\d+_.+\.sql" (.getName ^java.io.File %)))
       sort
       vec))

(defn- parse-pair [^java.io.File f]
  (let [content    (slurp f)
        slug       (str/replace (.getName f) #"\.sql$" "")
        short      (subs slug 0 3)
        meta-text  (section content "meta")
        slow-text  (section content "slow")
        fast-text  (section content "fast")
        kind       (some->> (re-find #"-- kind:\s*([^\n]+)" meta-text) second str/trim)
        speedup    (some->> (re-find #"-- expected_speedup:\s*([^\n]+)" meta-text) second str/trim)
        slow-stmt  (first (split-statements slow-text))
        fast-stmts (split-statements fast-text)]
    (when-not slow-stmt
      (throw (ex-info (str "no slow query in " (.getName f)) {:file f})))
    (when (empty? fast-stmts)
      (throw (ex-info (str "no fast query in " (.getName f)) {:file f})))
    {:file      f
     :slug      slug
     :short     short
     :kind      kind
     :expected  speedup
     :slow      slow-stmt
     :fast-pre  (butlast fast-stmts)        ; setup statements (DAG / precompute)
     :fast-final (last fast-stmts)}))        ; the SELECT we compare

;; ---------------------------------------------------------------------------
;; NOW() pinning
;;
;; Several pairs (q04, q08) use NOW() - INTERVAL '90 days'. Slow and fast runs
;; happen seconds apart, so an unpinned NOW() produces different windows and
;; the EXCEPT ALL diff trips on events near the boundary. We capture one
;; reference instant up-front and substitute it textually.

(defn- pin-now [sql ^java.time.Instant ref-now]
  (str/replace sql
               #"(?i)\bNOW\s*\(\s*\)"
               (str "TIMESTAMPTZ '" (.toString ref-now) "'")))

;; ---------------------------------------------------------------------------
;; Script loader (schema, seed, optimized indexes)
;;
;; Files use a couple of psql meta-commands (\set, \i). Strip them before
;; sending the whole script as one Statement#execute so Postgres handles the
;; embedded BEGIN/COMMIT and SET LOCAL ... blocks itself.

(defn- strip-meta-commands [sql]
  (->> (str/split-lines sql)
       (remove #(str/starts-with? (str/triml %) "\\"))
       (str/join "\n")))

(defn- exec-script! [ds ^java.io.File path]
  (let [sql (-> path slurp strip-meta-commands)]
    (with-open [conn (jdbc/get-connection ds)]
      (.setAutoCommit conn true)
      (with-open [stmt (.createStatement conn)]
        (.execute stmt sql)))))

;; ---------------------------------------------------------------------------
;; Timing helpers

(defn- time-ms [f]
  (let [t0 (System/nanoTime)
        v  (f)]
    [(/ (- (System/nanoTime) t0) 1e6) v]))

(def ^:private heartbeat-interval-ms
  "How often the heartbeat thread prints `… still running (Ns)`. Short enough
  that the user trusts the harness isn't hung."
  3000)

(defn- println-flush [s]
  (println s)
  (.flush ^java.io.PrintStream System/out))

(defn- with-heartbeat
  "Run `f` while a daemon thread prints periodic `… still running (Ns)` lines.
  `label` prefixes each heartbeat. The heartbeat is cancelled before `f`
  returns (success or exception)."
  [label f]
  (let [start  (System/nanoTime)
        done?  (volatile! false)
        ^Runnable r (fn []
                      (try
                        (loop []
                          (Thread/sleep ^long heartbeat-interval-ms)
                          (when-not @done?
                            (println-flush
                             (format "        … %s still running (%.1fs)"
                                     label
                                     (/ (- (System/nanoTime) start) 1e9)))
                            (recur)))
                        (catch InterruptedException _)))
        thr    (doto (Thread. r) (.setDaemon true) (.start))]
    (try
      (f)
      (finally
        (vreset! done? true)
        (.interrupt thr)))))

(defn- run-statement! [ds sql label]
  (with-heartbeat label #(jdbc/execute! ds [sql])))

(defn- capture-result! [ds target-table select-sql label]
  (jdbc/execute! ds [(str "DROP TABLE IF EXISTS bench." target-table)])
  (let [[ms _]    (time-ms
                   #(with-heartbeat label
                      (fn [] (jdbc/execute!
                              ds [(str "CREATE TABLE bench." target-table " AS " select-sql)]))))
        row-count (-> (jdbc/execute-one! ds [(str "SELECT count(*) AS c FROM bench."
                                                  target-table)])
                      :c)]
    {:ms ms :row-count row-count}))

(defn- run-slow! [ds pair ref-now label]
  (capture-result! ds (str "slow_" (:short pair)) (pin-now (:slow pair) ref-now) label))

(defn- run-fast! [ds pair ref-now label]
  ;; Multi-statement fast queries (q07/q08 precomputes): announce each step so
  ;; the user can see which precompute is running.
  (let [pre (:fast-pre pair)
        n   (count pre)]
    (doseq [[idx s] (map-indexed vector pre)]
      (let [step-label (format "%s [precompute %d/%d]" label (inc idx) (inc n))]
        (println-flush (str "      ↳ " step-label))
        (run-statement! ds (pin-now s ref-now) step-label)))
    (when (pos? n)
      (println-flush (str "      ↳ " label " [final SELECT]")))
    (capture-result! ds (str "fast_" (:short pair)) (pin-now (:fast-final pair) ref-now) label)))

(defn- compare-results [ds short]
  (try
    (-> (jdbc/execute-one!
         ds [(format
              "SELECT count(*) AS c FROM (
                 (SELECT * FROM bench.slow_%s EXCEPT ALL SELECT * FROM bench.fast_%s)
                 UNION ALL
                 (SELECT * FROM bench.fast_%s EXCEPT ALL SELECT * FROM bench.slow_%s)
               ) d" short short short short)])
        :c)
    (catch Exception e
      ;; Almost always means the column lists don't match: report it as
      ;; non-equivalent rather than failing the whole run.
      (println "    (comparison error: " (.getMessage e) ")")
      -1)))

;; ---------------------------------------------------------------------------
;; Reporting

(defn- fmt-row [{:keys [slug short kind slow-ms fast-ms diff-rows ratio]}]
  (let [eq? (zero? diff-rows)]
    (format "  %-32s [%-14s] slow %8.3fs  fast %8.3fs  ×%7.1f  %s%s"
            slug
            (or kind "?")
            (/ slow-ms 1000.0)
            (/ fast-ms 1000.0)
            ratio
            (cond
              (neg? diff-rows) "✗ COMPARE-ERR"
              eq?              "✓ eq"
              :else            "✗ DIFF")
            (if (pos? diff-rows) (str " (" diff-rows " rows differ)") ""))))

(defn- geomean [xs]
  (let [xs (filter #(and (number? %) (pos? %) (Double/isFinite %)) xs)]
    (when (seq xs)
      (Math/exp (/ (reduce + (map #(Math/log %) xs)) (count xs))))))

;; ---------------------------------------------------------------------------
;; Main

(defn- -main [& args]
  (let [opts (parse-args args)
        ds   (make-ds opts)]
    (println "=== Transform Optimizer Validation Harness ===")
    (println (format "Database: postgres://%s@%s:%d/%s%s"
                     (:user opts) (:host opts) (:port opts) (:dbname opts)
                     (if (:reset opts) "  (--reset)" "")))

    (when (:reset opts)
      (println "\n== Phase 1: reset + load schema + seed ==")
      (jdbc/execute! ds ["DROP SCHEMA IF EXISTS shop  CASCADE"])
      (jdbc/execute! ds ["DROP SCHEMA IF EXISTS bench CASCADE"])
      (jdbc/execute! ds ["CREATE SCHEMA bench"])
      (doseq [f ["01_schema.sql" "02_seed.sql"]]
        (let [path (project-file "dataset" f)
              _    (println-flush (format "  → %s loading ..." f))
              [ms _] (time-ms
                      #(with-heartbeat f
                         (fn [] (exec-script! ds path))))]
          (println-flush (format "  ✓ %s (%.1fs)" f (/ ms 1000.0))))))

    (when-not (:reset opts)
      (jdbc/execute! ds ["CREATE SCHEMA IF NOT EXISTS bench"]))

    (let [pairs   (cond->> (mapv parse-pair (pair-files))
                    (:only opts) (filter #((:only opts) (:short %))))
          _       (when (empty? pairs)
                    (println "no matching pairs") (System/exit 2))
          ref-now (-> (jdbc/execute-one! ds ["SELECT NOW() AS n"]) :n .toInstant)]

      (println (str "\nReference instant for NOW(): " ref-now))

      (println "\n== Phase 2: run slow queries (baseline schema, no helper indexes) ==")
      (let [total (count pairs)
            slow-stats
            (vec
             (map-indexed
              (fn [i p]
                (let [n     (inc i)
                      label (format "[%d/%d] %s slow" n total (:slug p))]
                  (println-flush (format "  → %s  running ..." label))
                  (let [{:keys [ms row-count]} (run-slow! ds p ref-now label)]
                    (println-flush
                     (format "  ✓ %s  %.3fs  rows=%d" label (/ ms 1000.0) row-count))
                    (assoc p :slow-ms ms :slow-rows row-count))))
              pairs))]

        (println "\n== Phase 3: apply optimized indexes ==")
        (let [[ms _] (time-ms
                      #(with-heartbeat "03_optimized_indexes.sql"
                         (fn []
                           (exec-script! ds (project-file "dataset" "03_optimized_indexes.sql")))))]
          (println-flush (format "  03_optimized_indexes.sql       (%.1fs)" (/ ms 1000.0))))

        (println "\n== Phase 4: run fast queries (with indexes) ==")
        (let [fast-stats
              (vec
               (map-indexed
                (fn [i p]
                  (let [n     (inc i)
                        label (format "[%d/%d] %s fast" n total (:slug p))]
                    (println-flush (format "  → %s  running ..." label))
                    (let [{:keys [ms row-count]} (run-fast! ds p ref-now label)]
                      (println-flush
                       (format "  ✓ %s  %.3fs  rows=%d" label (/ ms 1000.0) row-count))
                      (assoc p :fast-ms ms :fast-rows row-count))))
                slow-stats))]

          (println "\n== Phase 5: compare results (EXCEPT ALL, both directions) ==")
          (let [report
                (mapv (fn [p]
                        (let [diff  (compare-results ds (:short p))
                              ratio (if (zero? (:fast-ms p))
                                      Double/POSITIVE_INFINITY
                                      (/ (:slow-ms p) (:fast-ms p)))
                              row   (assoc p :diff-rows diff :ratio ratio)]
                          (println (fmt-row row))
                          row))
                      fast-stats)
                n     (count report)
                n-eq  (count (filter #(zero? (:diff-rows %)) report))
                gmean (geomean (map :ratio report))]
            (println (format "\nSummary: %d/%d equivalent, geomean speedup %s"
                             n-eq n
                             (if gmean (format "×%.1f" gmean) "n/a")))
            (System/exit (if (= n-eq n) 0 1))))))))

(apply -main *command-line-args*)
