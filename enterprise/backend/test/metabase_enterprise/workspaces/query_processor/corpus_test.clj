(ns metabase-enterprise.workspaces.query-processor.corpus-test
  "Test runner for the workspace remapping SQL corpus.

   Reads test cases from `test_resources/remapping_corpus/*.sql`, applies remappings
   via `sql-tools/replace-names`, and verifies the output contains no production refs.

   Corpus file format (see postgres.sql for examples):
     -- ;;;;                              <- separator
     -- remap: from_schema.table to_schema.table
     -- tags: simple, join, cte           <- for filtering
     -- expect: ok | parse-error          <- expected outcome
     <SQL query>"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-tools.core :as sql-tools]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Parser ----------------------------------------------------

(defn- parse-remap-directive
  "Parse '-- remap: from_schema.table to_schema.table' into [[from-schema from-table] [to-schema to-table]]."
  [line]
  (let [[_ from to] (re-matches #"--\s*remap:\s+(\S+)\s+(\S+)" line)]
    (when (and from to)
      (let [[fs ft] (str/split from #"\." 2)
            [ts tt] (str/split to #"\." 2)]
        [[fs ft] [ts tt]]))))

(defn- parse-tags-directive
  "Parse '-- tags: foo, bar, baz' into a set of keyword tags."
  [line]
  (let [[_ tags-str] (re-matches #"--\s*tags:\s+(.*)" line)]
    (when tags-str
      (into #{} (map (comp keyword str/trim)) (str/split tags-str #",")))))

(defn- parse-expect-directive
  "Parse '-- expect: ok | parse-error' into a keyword."
  [line]
  (let [[_ expect] (re-matches #"--\s*expect:\s+(\S+)" line)]
    (when expect
      (keyword expect))))

(defn- parse-corpus-entry
  "Parse a single corpus entry (lines between separators) into a test case map."
  [lines]
  (let [remappings (atom {})
        tags       (atom #{})
        expect     (atom :ok)
        sql-lines  (atom [])]
    (doseq [line lines]
      (if-let [remap (parse-remap-directive line)]
        (swap! remappings conj remap)
        (if-let [t (parse-tags-directive line)]
          (reset! tags t)
          (if-let [e (parse-expect-directive line)]
            (reset! expect e)
            ;; Skip blank comment-only lines, collect SQL
            (when-not (re-matches #"--.*" line)
              (swap! sql-lines conj line))))))
    (let [sql (str/trim (str/join "\n" @sql-lines))]
      (when (seq sql)
        {:remappings @remappings
         :tags       @tags
         :expect     @expect
         :sql        sql}))))

(defn- parse-corpus-file
  "Parse a corpus .sql file into a seq of test case maps."
  [resource-path]
  (let [content (slurp (io/resource resource-path))
        ;; Split on "-- ;;;;" separator, drop leading empty chunk
        chunks  (rest (str/split content #"(?m)^--\s*;;;;+\s*$"))]
    (keep (fn [chunk]
            (let [lines (str/split-lines (str/trim chunk))]
              (parse-corpus-entry lines)))
          chunks)))

;;; ---------------------------------------------- Test runner -------------------------------------------------

(defn- build-replacements
  "Build the replacements map for sql-tools/replace-names from a remappings map."
  [remappings]
  {:tables (into {}
                 (map (fn [[[from-schema from-table] [to-schema to-table]]]
                        [{:schema from-schema :table from-table}
                         {:schema to-schema :table to-table}]))
                 remappings)})

(defn- from-ref-pattern
  "Build a regex that matches any 'from' schema.table reference in SQL output."
  [remappings]
  (let [patterns (map (fn [[[from-schema from-table] _]]
                        (str "(?i)"
                             (java.util.regex.Pattern/quote from-schema)
                             "\\s*\\.\\s*"
                             (java.util.regex.Pattern/quote from-table)))
                      remappings)]
    (when (seq patterns)
      (re-pattern (str/join "|" patterns)))))

(defn- run-corpus-entry
  "Run a single corpus test case. Returns nil on success, error string on failure."
  [driver {:keys [remappings tags expect sql]}]
  (try
    (let [replacements (build-replacements remappings)
          rewritten    (sql-tools/replace-names driver sql replacements {:allow-unused? true})]
      (if (= expect :parse-error)
        (format "Expected parse error but got success. Tags: %s\nSQL: %s\nRewritten: %s"
                tags sql rewritten)
        ;; Verify no "from" references remain in the rewritten SQL
        (let [pattern (from-ref-pattern remappings)]
          (when (and pattern (re-find pattern rewritten))
            (format "Rewritten SQL still contains production refs. Tags: %s\nOriginal: %s\nRewritten: %s"
                    tags sql rewritten)))))
    (catch Exception e
      (if (= expect :parse-error)
        nil ;; Expected
        (format "Unexpected parse error. Tags: %s\nSQL: %s\nError: %s"
                tags sql (ex-message e))))))

;;; ---------------------------------------------- Tests -------------------------------------------------------

(deftest postgres-corpus-test
  (let [entries (parse-corpus-file "remapping_corpus/postgres.sql")]
    (is (pos? (count entries))
        "Corpus file should contain at least one test case")
    (doseq [{:keys [tags sql] :as entry} entries]
      (testing (format "tags=%s sql=%.60s..." tags (str/replace sql #"\n" " "))
        (let [error (run-corpus-entry :postgres entry)]
          (is (nil? error) error))))))
