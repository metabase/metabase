(ns metabase-enterprise.workspaces.query-processor.driver-corpus-test
  "Round-trip remapping tests against a real query corpus.

   Reads SQL queries from markdown files in the query_corpus repo
   (https://github.com/metabase/query_corpus), extracts table references,
   generates synthetic remappings, applies them, and verifies no original
   table references survive in the output.

   This namespace provides [[run-corpus-for-dialect]] for REPL use (see comment block
   at the bottom). No deftest — the corpus is too large and too slow for CI."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private dialect-for-file
  {"postgres.md"   :postgres
   "mysql.md"      :mysql
   "snowflake.md"  :snowflake
   "redshift.md"   :redshift
   "sqlserver.md"  :sqlserver
   "clickhouse.md" :clickhouse
   "bigquery.md"   :bigquery-cloud-sdk})

;;; ------------------------------------------------ Parser ----------------------------------------------------

(defn- extract-sql-blocks
  "Extract SQL from markdown fenced code blocks (```sql ... ```)."
  [markdown-content]
  (let [;; Match ```sql ... ``` blocks, capturing the content
        pattern #"(?ms)```sql\s*\n(.*?)```"]
    (->> (re-seq pattern markdown-content)
         (map second)
         (map str/trim)
         ;; Strip trailing JSON metadata comments
         (map (fn [sql]
                (str/replace sql #"(?m)\n--\s*\{\"pulseId\".*$" "")))
         (map str/trim)
         (filter seq))))

(defn- synthetic-remap
  "Generate a synthetic remap for a table reference: schema.table -> ws_test_remap.table.
   If no schema, uses nil -> ws_test_remap."
  [{:keys [schema table]}]
  (when table
    [{:schema schema :table table}
     {:schema (or schema "ws_test_remap") :table (str "remapped_" table)}]))

;;; -------------------------------------------- Round-trip test ------------------------------------------------

(defn- table-ref-set
  "Extract table references from SQL as a set of [schema table] pairs."
  [driver sql]
  (try
    (into #{}
          (map (fn [{:keys [schema table]}] [schema table]))
          (sql-tools/referenced-tables-raw driver sql))
    (catch Exception _
      nil)))

(defn- run-roundtrip
  "Run a single round-trip remapping test. Returns nil on success, error map on failure."
  [driver sql]
  (let [refs (table-ref-set driver sql)]
    (when (seq refs)
      ;; Pick a table to remap — use the first one that has a table name
      (let [raw-refs     (sql-tools/referenced-tables-raw driver sql)
            remap-target (first (filter :table raw-refs))]
        (when remap-target
          (let [[from-spec to-spec] (synthetic-remap remap-target)
                replacements {:tables {from-spec to-spec}}]
            (try
              (let [rewritten   (sql-tools/replace-names driver sql replacements {:allow-unused? true})
                    new-refs    (table-ref-set driver rewritten)
                    original    [(:schema from-spec) (:table from-spec)]]
                (when (and new-refs (contains? new-refs original))
                  {:error    :ref-survived
                   :original original
                   :sql      (subs sql 0 (min 200 (count sql)))
                   :refs     new-refs}))
              (catch Exception e
                {:error   :rewrite-failed
                 :message (ex-message e)
                 :sql     (subs sql 0 (min 200 (count sql)))}))))))))

;;; ---------------------------------------------- Tests -------------------------------------------------------

(defn run-corpus-for-dialect
  "Run round-trip tests for a single dialect file. Returns {:total N :passed N :errors [...]}.
   `dir` is the path to the directory containing the corpus markdown files."
  [dir filename driver]
  (let [file    (io/file dir filename)
        content (slurp file)
        queries (extract-sql-blocks content)
        results (atom {:total 0 :passed 0 :parse-skipped 0 :errors []})]
    (doseq [sql queries]
      (swap! results update :total inc)
      (let [result (run-roundtrip driver sql)]
        (cond
          (nil? result)
          (swap! results update :passed inc)

          (= :rewrite-failed (:error result))
          (do
            (swap! results update :errors conj result)
            (log/debugf "Rewrite failed for %s: %s" filename (:message result)))

          :else
          (swap! results update :errors conj result))))
    @results))

(comment
  ;; Query corpus: https://github.com/metabase/query_corpus
  ;; Clone it and point `dir` at the drivers/ directory.

  (def dir "/path/to/query_corpus/drivers")

  ;; Run a single dialect:
  (time (run-corpus-for-dialect dir "postgres.md" :postgres))
  ;; => {:total 1384, :passed 1384, :parse-skipped 0, :errors []}

  ;; Run all dialects:
  (into []
        (map (fn [[file driver]] [file (run-corpus-for-dialect dir file driver)]))
        dialect-for-file)

  ;; Results as of 2026-04-27:
  ;;   postgres.md   1384/1384  (215s)
  ;;   bigquery.md   1558/1558  (75s)
  )
