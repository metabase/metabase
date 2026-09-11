(ns metabase.core.table-or-field-raw-usage-test
  "Guards against hand-written Honey SQL that names `metabase_table`/`metabase_field` directly.

  `metabase.warehouse-schema-overlay.core/table-query` and `/field-query` are the source a query over
  `:model/Table`/`:model/Field` must read from, so that a user's Field values (`metabase_field_user_settings`) and a
  workspace's table remapping (`workspace_table_remapping`) are applied. The `:metabase/table-or-field-query` clj-kondo
  linter (`.clj-kondo/src/hooks/metabase/warehouse_schema_overlay/table_or_field_query.clj`) already catches this for
  `t2/select`-style calls naming `:model/Table`/`:model/Field`, but it only fires on those Toucan 2 query functions.
  Hand-written Honey SQL that instead names the raw table with the literal keyword `:metabase_table`/`:metabase_field`
  -- in a `:from` or a join -- sails right past it; clj-kondo has no `:discouraged-keyword` linter to catch a bare
  keyword literal irrespective of the function it's passed to (verified against the pinned 2026.07.24 build: only
  `:discouraged-var` and `:discouraged-namespace` exist, both keyed on a resolved var/namespace symbol, not a keyword
  value), and a hook can't fire on a keyword sitting in arbitrary data with no distinguishing enclosing call. Hence
  this repo-level test instead, in the style of [[metabase.core.modules-test]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(def ^:private scanned-roots
  "Where hand-written application-database Honey SQL lives. Driver modules are globbed since each has its own
  `src` directory. `.clj-kondo/` (which spells out both keywords in the hook this test backs up) is simply never
  one of these roots, so it needs no explicit exclusion."
  (into ["src" "enterprise/backend/src"]
        (comp (filter #(.isDirectory ^java.io.File %))
              (map #(str "modules/drivers/" (.getName ^java.io.File %) "/src"))
              (filter #(.isDirectory (io/file %))))
        (some-> (io/file "modules/drivers") .listFiles)))

(def ^:private excluded-paths
  "Whole files/directories the scan never reports on, because a hit there isn't the linter's business:

  - `metabase.warehouse-schema-overlay.core` itself builds `table-query`/`field-query` by naming the raw tables --
    that's the one place allowed to.
  - `metabase.sync.*` is sync's own read/write path: sync is the thing that writes `metabase_table`/`metabase_field`,
    so it always wants the raw columns, and a separate change owns this namespace right now.
  - Liquibase/custom migrations run against whatever shape the app DB had at that migration's version, before (or
    long after) `field-query`/`table-query` existed; they are not reads a *current* user sees rendered anywhere."
  #{"src/metabase/warehouse_schema_overlay/core.clj"})

(defn- excluded-dir?
  [path]
  (or (str/starts-with? path "src/metabase/sync/")
      (str/includes? path "custom_migrations")))

(def ^:private allowed-raw-usages
  "Files where a `:metabase_table`/`:metabase_field` literal survives review: every hit in the file was read back and
  confirmed to select only columns `table-query`/`field-query` don't touch (an id, a count, a foreign key used purely
  to join or filter), or the file has its own structural reason to want the raw row. Note that a Table's
  `display_name`, `description`, `is_published` and `collection_id` are user values like a Field's -- a rationale
  resting on those being sync-owned no longer holds. Add an entry here only after
  checking every hit it covers -- see the check's failure message for the two helpers this is standing in for.

  Keep this in sync with what the scan actually finds: [[stale-allowed-raw-usage-test]] fails on an entry that no
  longer matches anything, same as clj-kondo's ignore ratchets flag a stale exemption."
  {"src/metabase/usage_metadata/db.clj"
   "raw-field-fingerprint selects only :fingerprint, a sync-owned column with no user override."

   "src/metabase/collections_rest/children_query.clj"
   "the one remaining hit is the :model case's join, which reads only :is_upload -- sync-owned, with no user value.
   The :table case goes through table-query, since publishing and display_name are user values."

   "src/metabase/queries/db.clj"
   "field-database-info-for-ids reads the Field's own raw :name (sync-owned, not user-settable); its Table join is
   already routed through table-query."

   "src/metabase/models/db.clj"
   "field-in-path-query is a nested id-only lookup used as a :where filter, not a value read."

   "src/metabase/warehouses_rest/db.clj"
   "delete-field-values-for-database! selects only :f.id inside a DELETE's subquery; database-usage-counts only
   counts rows. autocomplete-fields' Table join now goes through table-query."

   "src/metabase/parameters/db.clj"
   "both joins bring in the Table only to filter (.active, .db_id) or project its :id; neither selects
   :schema/:name."

   "enterprise/backend/src/metabase_enterprise/dependencies/db.clj"
   "the remaining hits select only :id, to build permission and dependency filters. The two that read a Table's
   display_name -- a user value -- now go through table-query."

   "enterprise/backend/src/metabase_enterprise/remote_sync/db.clj"
   "remote sync matches and tracks content by its actual physical (db, schema, table) location across instances --
   overlaying the workspace-remapped name would work against the one thing this module does."

   "enterprise/backend/src/metabase_enterprise/data_complexity_score/db.clj"
   "active-field-counts-by-table only counts active Fields per table; no Field/Table content column is read."})

(defn- source-file?
  [^java.io.File file]
  (and (.isFile file)
       (let [name (.getName file)]
         (or (str/ends-with? name ".clj") (str/ends-with? name ".cljc")))))

(defn- source-files
  []
  (for [root  scanned-roots
        ^java.io.File file (file-seq (io/file root))
        :when (source-file? file)]
    (.getPath file)))

(defn- strip-strings-and-comments
  "Blank out string-literal and line-comment content in `text`, keeping newlines so line numbers still line up.
  A naive keyword scan over raw source text would otherwise flag docstrings and comments that merely *mention*
  `:metabase_table`/`:metabase_field` (see e.g. `metabase.warehouse-schema.schema`'s column-list docstrings)."
  [^String text]
  (let [n   (.length text)
        sb  (StringBuilder. n)]
    (loop [i 0, in-str? false]
      (if (>= i n)
        (str sb)
        (let [c (.charAt text i)]
          (cond
            (and in-str? (= c \\) (< (inc i) n))
            (do (.append sb (if (= (.charAt text (inc i)) \newline) "\n " " "))
                (recur (+ i 2) true))

            (= c \")
            (do (.append sb \space)
                (recur (inc i) (not in-str?)))

            in-str?
            (do (.append sb (if (= c \newline) \newline \space))
                (recur (inc i) true))

            (= c \;)
            (let [nl (long (or (str/index-of text "\n" i) n))]
              (.append sb (apply str (repeat (- nl i) \space)))
              (recur nl false))

            :else
            (do (.append sb c)
                (recur (inc i) false))))))))

(def ^:private raw-usage-pattern
  "A `:metabase_table`/`:metabase_field` keyword literal naming a table -- as opposed to `:metabase_field.column` or
  `:metabase_field/column`, which qualify a column of a source named elsewhere (often `table-query`/`field-query`'s
  own default alias, which is the raw table name)."
  #":metabase_(?:table|field)(?![./\w])")

(defn- raw-usage-hits
  "Every `{:file :line :text}` where `path`'s code (not its strings or comments) uses the literal keyword to name a
  table, skipping `t2/table-name` definitions -- the canonical place the keyword has to be spelled out."
  [path]
  (let [text          (slurp path)
        code-only     (strip-strings-and-comments text)
        lines         (str/split-lines text)
        code-lines    (str/split-lines code-only)]
    (into []
          (keep (fn [[line-no orig code]]
                  (when (and (re-find raw-usage-pattern code)
                             (not (str/includes? orig "t2/table-name")))
                    {:file path, :line line-no, :text (str/trim orig)})))
          (map vector (rest (range)) lines code-lines))))

(defn- relative-path
  [path]
  (str/replace path #"^\./" ""))

(defn- all-hits
  []
  (into []
        (mapcat raw-usage-hits)
        (remove excluded-dir? (map relative-path (source-files)))))

(defn- excused?
  [file]
  (boolean (or (contains? excluded-paths file)
               (contains? allowed-raw-usages file))))

(deftest no-raw-metabase-table-or-field-honey-sql-test
  (testing (str "Hand-written Honey SQL must not name `:metabase_table`/`:metabase_field` directly.\n"
                "Read from `(metabase.warehouse-schema-overlay.core/table-query)` / `(field-query)` instead"
                " (or add `{:alias ...}` for a join), or pass `{:user-settings? false}` for a deliberate raw read.\n"
                "If the hit really is fine as-is (only an id, a count, or a foreign key used to join/filter), review"
                " it and add it to `allowed-raw-usages` in this test with a one-line reason.")
    (doseq [{:keys [file line text]} (all-hits)]
      (testing (format "\n%s:%d\n  %s" file line text)
        (is (excused? file) "unexpected raw metabase_table/metabase_field usage (see message above)")))))

(deftest stale-allowed-raw-usage-test
  (testing "every allowed-raw-usages entry still matches at least one hit, so the allowlist doesn't accumulate cruft"
    (let [files-with-hits (into #{} (map :file) (all-hits))]
      (doseq [file (keys allowed-raw-usages)]
        (testing (format "\n%s" file)
          (is (contains? files-with-hits file)
              "no raw metabase_table/metabase_field usage found here anymore -- remove this allowlist entry"))))))
