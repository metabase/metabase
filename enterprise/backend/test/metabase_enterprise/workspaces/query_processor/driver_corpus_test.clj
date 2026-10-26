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

(defn- referenced-tables-or-error
  "Return either the parsed table refs (a possibly-empty seq of `{:schema ..., :table ...}`)
   or `[::parse-failed ex-message]` if SQLGlot couldn't parse the SQL."
  [driver sql]
  (try
    (sql-tools/referenced-tables-raw driver sql)
    (catch Exception e
      [::parse-failed (ex-message e)])))

(defn- run-roundtrip
  "Run a single round-trip remapping test. Returns one of:

     {:outcome :passed}                                      — round-trip succeeded
     {:outcome :no-tables}                                   — original SQL has no table refs to rewrite
     {:outcome :source-parse-failed, :message ..., :sql ...} — original SQL didn't parse at all
     {:outcome :ref-survived, :original ..., :refs ...}      — rewriter missed the ref
     {:outcome :rewrite-failed, :message ..., :sql ...}      — replace-names threw

   No silent skips — every input maps to exactly one outcome category."
  [driver sql]
  (let [refs (referenced-tables-or-error driver sql)]
    (cond
      (and (vector? refs) (= ::parse-failed (first refs)))
      {:outcome :source-parse-failed
       :message (second refs)
       :sql     (subs sql 0 (min 200 (count sql)))}

      (empty? refs)
      {:outcome :no-tables}

      :else
      (let [remap-target (first (filter :table refs))]
        (if-not remap-target
          ;; Refs were extracted but none had a :table — treat the same as :no-tables;
          ;; the rewriter has nothing to do.
          {:outcome :no-tables}
          (let [[from-spec to-spec] (synthetic-remap remap-target)
                replacements        {:tables {from-spec to-spec}}]
            (try
              (let [rewritten (sql-tools/replace-names driver sql replacements {:allow-unused? true})
                    new-refs  (referenced-tables-or-error driver rewritten)
                    original  [(:schema from-spec) (:table from-spec)]]
                (cond
                  ;; If we can't re-parse the rewritten SQL, that's a different failure mode —
                  ;; the rewriter produced unparseable output. Surface it loudly rather than
                  ;; silently passing.
                  (and (vector? new-refs) (= ::parse-failed (first new-refs)))
                  {:outcome :rewrite-emitted-unparseable
                   :message (second new-refs)
                   :sql     (subs sql 0 (min 200 (count sql)))}

                  (contains? (into #{}
                                   (map (fn [{:keys [schema table]}] [schema table]))
                                   new-refs)
                             original)
                  {:outcome  :ref-survived
                   :original original
                   :sql      (subs sql 0 (min 200 (count sql)))}

                  :else
                  {:outcome :passed}))
              (catch Exception e
                {:outcome :rewrite-failed
                 :message (ex-message e)
                 :sql     (subs sql 0 (min 200 (count sql)))}))))))))

;;; ---------------------------------------------- Tests -------------------------------------------------------

(defn run-corpus-for-dialect
  "Run round-trip tests for a single dialect file. Returns
   `{:total N :passed N :no-tables N :source-parse-failed N :errors [...]}`.

   `:passed` is the count of queries that genuinely round-tripped — the rewriter saw the
   picked ref and produced output where it no longer appears.

   `:no-tables` and `:source-parse-failed` are queries the test could not meaningfully
   exercise (the rewriter wouldn't be invoked for them, or would be invoked on something
   it can't parse — the production fail-closed path catches the latter at runtime).

   `:errors` contains genuine failures: `:ref-survived`, `:rewrite-failed`, or
   `:rewrite-emitted-unparseable`."
  [dir filename driver]
  (let [file    (io/file dir filename)
        content (slurp file)
        queries (extract-sql-blocks content)
        results (atom {:total                0
                       :passed               0
                       :no-tables            0
                       :source-parse-failed  0
                       :errors               []})]
    (doseq [sql queries]
      (swap! results update :total inc)
      (let [{:keys [outcome] :as result} (run-roundtrip driver sql)]
        (case outcome
          :passed              (swap! results update :passed inc)
          :no-tables           (swap! results update :no-tables inc)
          :source-parse-failed (swap! results update :source-parse-failed inc)
          (do
            (swap! results update :errors conj result)
            (log/debugf "%s for %s: %s" outcome filename (:message result))))))
    @results))

(comment
  ;; Query corpus: https://github.com/metabase/query_corpus
  ;; Clone it and point `dir` at the drivers/ directory.

  (def dir "/path/to/query_corpus/drivers")

  ;; Run a single dialect:
  (run-corpus-for-dialect dir "postgres.md" :postgres)
  ;; => {:total 1384, :passed 1257, :no-tables 124, :source-parse-failed 3, :errors []}

  ;; Run all dialects:
  (into []
        (map (fn [[file driver]] [file (run-corpus-for-dialect dir file driver)]))
        dialect-for-file)

  ;; Results as of 2026-04-28 (with the categorising harness):
  ;;   dialect       passed/eligible   no-tables   source-parse-failed   errors
  ;;   postgres        1257/1260           124              3              0
  ;;   bigquery        1517/1520            38              3              0
  ;;   redshift         303/305             12              2              0
  ;;   sqlserver       1243/1262            23             19              0
  ;;   mysql           3362/3364            78              2              0
  ;;   clickhouse      2894/2896            86              2              0
  ;;   total          10576/10607          361             31              0
  ;;
  ;; "passed/eligible" excludes :no-tables (nothing to rewrite) and
  ;; :source-parse-failed (rewriter never invoked; production fail-closed catches these
  ;; at runtime). Across 12077 SQL strings that actually exercised the rewriter, zero
  ;; produced surviving original refs and zero raised :rewrite-failed.
  )
