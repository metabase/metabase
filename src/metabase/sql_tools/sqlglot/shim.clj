(ns metabase.sql-tools.sqlglot.shim
  "Interface to sqlglot Python library via GraalVM Polyglot.

  sqlglot provides near-100% SQL parsing success rate across dialects,
  replacing JSqlParser (via Macaw) for better dialect support.

  Usage:
    (require '[metabase.driver.sql.sqlglot :as sqlglot])
    (sqlglot/p \"SELECT id FROM users\")
    ;; => {:tables_source [\"users\"], :columns [\"id\"], ...}"
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin :as p])
  (:import
   (io.aleph.dirigiste IPool$Controller IPool$Generator Pool Pools)
   (java.io Closeable File)
   (java.nio.file Files Path)
   (java.util.concurrent TimeUnit)
   (org.graalvm.polyglot Context HostAccess Value)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Python path resolution --------------------------------------------------

(def ^:private python-sources-resource
  "Resource path for Python sources (sql_tools.py and sqlglot)."
  "python-sources")

(defn- plugins-dir-path
  "Get path to plugins directory. Lightweight alternative to metabase.plugins.core/plugins-dir
   that avoids loading the entire plugin system (~8 seconds of namespace loading)."
  ^Path []
  (let [dir-name (or (System/getenv "MB_PLUGINS_DIR")
                     "plugins")
        path     (u.files/get-path dir-name)]
    (u.files/create-dir-if-not-exists! path)
    path))

(defn- jar-resource?
  "True if the given resource is inside a JAR (production), false if from filesystem (dev)."
  [resource]
  (boolean
   (when-let [url (io/resource resource)]
     (.contains (.getFile ^java.net.URL url) ".jar!/"))))

(defn- copy-dir-recursive!
  "Recursively copy all files from source Path to dest Path.
  Works across filesystems (e.g., from JAR filesystem to default filesystem)."
  [^Path source ^Path dest]
  (doseq [^Path child (u.files/files-seq source)]
    (let [relative-name (str (.getFileName child))
          target        (.resolve dest relative-name)]
      (if (Files/isDirectory child (into-array java.nio.file.LinkOption []))
        (do
          (u.files/create-dir-if-not-exists! target)
          (copy-dir-recursive! child target))
        (log/with-no-logs ;; <-- Suppress per-file logs from copy-file! (hundreds of files in sqlglot)
          (u.files/copy-file! child target))))))

(defn- extract-python-sources!
  "Extract python-sources from JAR to plugins directory. Returns the path as a string.
  Uses the same plugins directory as driver modules for consistency.
  Skips extraction if version file matches."
  ^String []
  (let [^Path plugins-path (plugins-dir-path)
        dest-path          (.resolve plugins-path "python-sources")
        version-file       (.resolve dest-path ".sqlglot-version")
        jar-version        (some-> (io/resource "python-sources/.sqlglot-version") slurp str/trim)
        dest-version       (when (u.files/exists? version-file)
                             (str/trim (slurp (.toFile version-file))))]
    (if (and jar-version (= jar-version dest-version))
      (log/info "Python sources already extracted (version" jar-version ")")
      (do
        (u.files/create-dir-if-not-exists! dest-path)
        (log/info "Extracting Python sources to" (str dest-path))
        (u.files/with-open-path-to-resource [source-path python-sources-resource]
          (copy-dir-recursive! source-path dest-path))
        (log/info "Python sources extracted")))
    (str dest-path)))

;;; -------------------------------------------------- Dev lazy installation --------------------------------------------------

(def ^:private dev-python-sources-dir
  "Directory where sqlglot is installed in dev mode."
  "resources/python-sources")

(defn- delete-recursive!
  "Recursively delete a directory and all its contents."
  [^File f]
  (when (.isDirectory f)
    (doseq [child (.listFiles f)]
      (delete-recursive! child)))
  (.delete f))

(defn- expected-sqlglot-version
  "Read the expected sqlglot version from .sqlglot-version resource file."
  []
  (some->> (io/resource "python-sources/.sqlglot-version")
           slurp
           ;; handle # comments in the version file
           str/split-lines
           (remove #(str/starts-with? % "#"))
           (str/join "\n")
           str/trim))

(defn- package-installer-available?
  "Check if uv or pip is available for installing Python packages."
  []
  (or (zero? (:exit (shell/sh "which" "uv")))
      (zero? (:exit (shell/sh "which" "pip")))))

(defn- version-installed?
  "Check if sqlglot is installed with the expected version by looking for the dist-info directory."
  [target-dir expected-version]
  (let [dist-info (io/file target-dir (str "sqlglot-" expected-version ".dist-info"))]
    (.exists dist-info)))

(defn- install-sqlglot!
  "Install sqlglot via uv (preferred) or pip (fallback).
  Deletes any existing sqlglot directories first to handle version upgrades."
  [target-dir version]
  ;; Delete old versions first (sqlglot/ and any sqlglot-*.dist-info/)
  (doseq [^File f (.listFiles (io/file target-dir))]
    (when (or (= "sqlglot" (.getName f))
              (.startsWith (.getName f) "sqlglot-"))
      (log/info "Removing old sqlglot:" (.getName f))
      (delete-recursive! f)))
  ;; Try uv first (fast), fall back to pip
  (let [pkg        (str "sqlglot==" version)
        uv-result  (shell/sh "uv" "pip" "install" pkg "--target" target-dir "--no-compile")]
    (if (zero? (:exit uv-result))
      (log/info "sqlglot" version "installed via uv")
      (do
        (log/info "uv not available, trying pip...")
        (let [pip-result (shell/sh "pip" "install" pkg "--target" target-dir "--no-compile")]
          (when-not (zero? (:exit pip-result))
            (throw (ex-info (str "Failed to install sqlglot. Please install uv (recommended) or pip.\n"
                                 "Manual install: uv pip install " pkg " --target " target-dir "\n"
                                 "Install uv: https://docs.astral.sh/uv/getting-started/installation/")
                            {:uv-error   (:err uv-result)
                             :pip-error  (:err pip-result)
                             :version    version
                             :target-dir target-dir})))
          (log/info "sqlglot" version "installed via pip"))))))

(defn- ensure-sqlglot-installed!
  "Ensure sqlglot is installed with correct version. Called lazily on first use in dev.
  If version mismatch or missing, automatically installs the correct version."
  []
  (let [expected-ver (expected-sqlglot-version)]
    (when-not expected-ver
      (throw (ex-info "Missing .sqlglot-version file in resources/python-sources/"
                      {:resource "python-sources/.sqlglot-version"})))
    (when-not (version-installed? dev-python-sources-dir expected-ver)
      (if (package-installer-available?)
        (do
          (log/info "Installing sqlglot" expected-ver "(first use in dev)...")
          (install-sqlglot! dev-python-sources-dir expected-ver))
        (log/warn "sqlglot not installed and no package installer (uv or pip) found."
                  "SQL parsing features will fail until sqlglot is installed."
                  "Install uv: https://docs.astral.sh/uv/getting-started/installation/")))))

;;; -------------------------------------------------- Python path delay --------------------------------------------------

(defonce ^:private
  ^{:doc "Path to Python sources directory. In dev, this is resources/python-sources.
          When running from a JAR, we extract to the plugins directory.
          In dev, lazily installs sqlglot if not present or version mismatched."}
  python-path
  (delay
    (if (jar-resource? python-sources-resource)
      (extract-python-sources!)
      (do
        (ensure-sqlglot-installed!)
        dev-python-sources-dir))))

;;; ------------------------------------------------ Protocol --------------------------------------------------------

(p/defprotocol+ PythonEval
  "Protocol for evaluating Python code. Abstracts over raw Context and pooled contexts."
  (eval-python [this code]
    "Evaluate Python code."))

;;; -------------------------------------------- Context Wrappers ----------------------------------------------------

(p/defrecord+ PooledContext [^Context context ^Pool pool tuple]
  PythonEval
  (eval-python [_this code]
    (.eval context "python" ^String code))

  Closeable
  (close [_this]
    (.release pool :python tuple)))

(p/defrecord+ DevContext [^Context context]
  PythonEval
  (eval-python [_this code]
    (.eval context "python" ^String code))

  Closeable
  (close [_this]
    nil))

(defn- create-graalvm-context
  "Create a new GraalVM Python context configured for sqlglot.

  The context is configured with:
  - PythonPath pointing to python-sources (contains sql_tools.py and sqlglot)
  - Full host access (needed for JSON serialization)
  - IO access enabled (for Python imports)"
  ^Context []
  (.. (Context/newBuilder (into-array String ["python"]))
      (option "engine.WarnInterpreterOnly" "false")
      ;; python-sources contains both sql_tools.py shim and installed sqlglot
      (option "python.PythonPath" @python-path)
      (allowHostAccess HostAccess/ALL)
      (allowIO true)
      (build)))

(defn- acquire-dev-context
  "Create a dev context (not pooled, but still Closeable for consistent API)."
  []
  (->DevContext (create-graalvm-context)))

(defn- make-python-context-pool
  "Create a pool of Python contexts. Accepts a generator function and optional config map.

  Config options:
  - :max-size          - Maximum pool size (default: 3)
  - :min-size          - Minimum pool size (default: 1)
  - :ttl-minutes       - How long contexts live before expiry (default: 10)
  - :utilization       - Target utilization (default: 1.0 = 100%)

  This allows for easy testing by injecting mock context generators and custom pool configs."
  ([context-generator]
   (make-python-context-pool context-generator {}))
  ([context-generator {:keys [max-size min-size ttl-minutes utilization]
                       :or {max-size 3
                            min-size 1
                            ttl-minutes 10
                            utilization 1.0}}]
   (let [base-controller (Pools/utilizationController utilization max-size max-size)]
     (Pool. (reify IPool$Generator
              (generate [_ _]
                ;; Generate a tuple of the context and the expiry timestamp.
                [(context-generator)
                 (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES ttl-minutes))])
              (destroy [_ _ _v]))
            ;; Wrap the utilization controller with a modification that doesn't allow the pool to go below min-size.
            (reify IPool$Controller
              (shouldIncrement [_ k a b] (.shouldIncrement base-controller k a b))
              (adjustment [_ stats]
                (let [adj (.adjustment base-controller stats)
                      ;; :python is arbitrary key, it just has to be consistent everywhere when working with the pool.
                      n (some-> ^io.aleph.dirigiste.Stats (:python stats) .getNumWorkers)
                      python-adj (:python adj)]
                  (if (and n python-adj (<= (+ n python-adj) min-size))
                    ;; If the adjustment is going to bring the pool below min-size, return empty adjustment instead.
                    {}
                    adj))))
            65000 ;; Queue size - doesn't matter much.
            25 ;; Sampling interval - doesn't matter much.
            10000 ;; Recheck every 10 seconds
            TimeUnit/MILLISECONDS))))

(def ^:private python-context-pool
  "Pool of Python context objects. They are not thread-safe, so access to them has to be carefully managed between
  threads. Each context with loaded Python interpreter takes significant memory, so we don't want too many of them.
  However, one takes significant time to initialize, so we don't want to load them anew each time in prod. Under some
  circumstances, the GraalVM Python context tends to leak memory, so we don't want to keep the reference to the
  context forever. Considering all that, this pool targets 100% utilization (so, if the utilization is lower, the pool
  will start dropping objects) and the maximum of 3 objects (to prevent OOMs), but at least 1 object will always be in
  the pool to pick up. However, together with each context keep its creation timestamp so that we can throwaway
  instances that are too old to avoid leaks.

  Wrapped in delay to avoid initialization during AOT compilation."
  (delay (make-python-context-pool create-graalvm-context {:max-size 3
                                                           :min-size 1
                                                           :ttl-minutes 10})))

(defn- acquire-context
  "Acquire a context from the pool, handling expiry. Returns a PooledContext."
  [^Pool pool]
  (loop []
    (let [[context expiry-ts :as tuple] (.acquire pool :python)]
      (if (>= (System/nanoTime) expiry-ts)
        (do (.dispose pool :python tuple)
            (recur))
        (->PooledContext context pool tuple)))))

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn- analyze-sql-impl
  "Internal implementation that takes a context (either raw Context or PooledContext)."
  ^Value [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (eval-python context "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-fn (eval-python context "sql_tools.analyze")]

    ;; 3. Call it directly with arguments
    ;; GraalVM handles the conversion of the Clojure string to a Python string
    (.execute ^Value analyze-fn (object-array [sql]))))

(defn analyze-sql
  "Analyze SQL using sqlglot. Uses a pooled Python context for thread-safety."
  [sql]
  (with-open [^Closeable ctx (if config/is-dev?
                               (acquire-dev-context)
                               (acquire-context @python-context-pool))]
    (analyze-sql-impl ctx sql)))

(defn- analyze-table-joins-impl
  "Internal implementation that takes a context and extracts table join information."
  ^Value [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (eval-python context "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-joins-fn (eval-python context "sql_tools.analyze_table_joins")]

    ;; 3. Call it directly with arguments
    (.execute ^Value analyze-joins-fn (object-array [sql]))))

(defn analyze-table-joins
  "Analyze SQL to extract table names and their join relationships.
  Returns a map with:
  - :tables - vector of table names
  - :joins - vector of join relationships, each containing:
    - :left-table - the left table in the join
    - :right-table - the right table in the join
    - :join-type - the type of join (INNER, LEFT, RIGHT, etc.)

  Example:
  (analyze-table-joins \"SELECT * FROM a LEFT JOIN b ON a.id = b.a_id JOIN c ON a.id = c.a_id\")
  => {:tables [\"a\" \"b\" \"c\"]
      :joins [{:left-table \"a\" :right-table \"b\" :join-type \"LEFT\"}
              {:left-table \"a\" :right-table \"c\" :join-type \"INNER\"}]}"
  [sql]
  (with-open [^Closeable ctx (if #_config/is-dev? false
                                 (acquire-dev-context)
                                 (acquire-context @python-context-pool))]
    (json/decode+kw (.asString ^Value (analyze-table-joins-impl ctx sql)))))

(comment
  (analyze-table-joins "
   SELECT *
   FROM a LEFT JOIN b ON a.id = b.a_id
   JOIN c ON a.id = c.a_id
   LEFT JOIN d ON c.id = d.c_id"))

(defn p
  "Parse SQL and return Clojure data structure.

  Returns map with keys:
  - :tables_source - tables referenced (excluding CTEs)
  - :tables_all    - all tables including CTEs
  - :columns       - column references
  - :projections   - output columns/aliases
  - :ast           - full AST as nested maps

  Example:
    (p \"SELECT id, name FROM users WHERE active = true\")
    ;; => {:tables_source [\"users\"]
    ;;     :columns [\"active\" \"id\" \"name\"]
    ;;     :projections [\"id\" \"name\"]
    ;;     ...}"
  [sql]
  ;; TODO: the shim doesn't 100% return json. need to fix that
  ;;   sqlglot=> (p "-- FIXTURE: interpolation/crosstab
  ;; SELECT * FROM crosstab($$
  ;;     SELECT
  ;;         history.page,
  ;;         date_trunc('month', history.h_timestamp)::DATE,
  ;;         count(history.id) as total
  ;;     FROM history
  ;;     WHERE h_timestamp between '2024-01-01' and '2024-12-01'
  ;;     GROUP BY page, date_trunc('month', history.h_timestamp)
  ;; $$,
  ;;         $$
  ;;             SELECT
  ;;                 date_trunc('month', generate_series('2024-01-01', '2024-02-01', '1 month'::INTERVAL))::DATE
  ;; $$
  ;; ) AS ct(
  ;;     page INTEGER,
  ;;     \"Jan\" FLOAT,
  ;;     \"Feb\" FLOAT
  ;; )")
  ;; Execution error (PolyglotException) at <python>/default (encoder.py:161).
  ;; TypeError: Object of type Type is not JSON serializable
  (json/decode+kw (.asString ^Value (analyze-sql sql))))

(comment
  ;; Quick test
  (p "SELECT id, name FROM users WHERE active = true")

  ;; Test with CTE
  (p "WITH active_users AS (SELECT * FROM users WHERE active)
      SELECT * FROM active_users")

  ;; PostgreSQL dollar-quote (this fails in JSqlParser)
  (p "SELECT $tag$hello$tag$")

  ;; Multiple tables with join
  (p "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id")

  ;; Using with-open for manual pool management:
  (with-open [ctx (acquire-context @python-context-pool)]
    (eval-python ctx "import sqlglot")
    (eval-python ctx "sqlglot.parse_one('SELECT 1'")))

;;;; Shim part

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [schema-or-nil table-name] pairs:
   [[nil \"users\"] [\"public\" \"orders\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  ([sql]
   (referenced-tables sql "postgres"))
  ([sql dialect]
   (with-open [^Closeable ctx (if config/is-dev?
                                (acquire-dev-context)
                                (acquire-context @python-context-pool))]
     (eval-python ctx "import sql_tools")
     (-> ^Value (eval-python ctx "sql_tools.referenced_tables")
         (.execute ^Value (object-array [sql dialect]))
         .asString
         json/decode
         vec))))

;; TODO: Rename lineage to something more accurate
(defn returned-columns-lineage
  "WIP"
  [dialect sql default-table-schema sqlglot-schema]
  (with-open [^Closeable ctx (if config/is-dev?
                               (acquire-dev-context)
                               (acquire-context @python-context-pool))]
    (eval-python ctx "import sql_tools")
    (-> ^Value (eval-python ctx "sql_tools.returned_columns_lineage")
        (.execute ^Value (object-array [dialect
                                        sql
                                        default-table-schema
                                        sqlglot-schema]))
        .asString
        json/decode)))

(defn- sanitize-validation-output
  [validation-output]
  (-> validation-output
      (update :status (comp u/->kebab-case-en keyword))
      (m/update-existing :type (comp u/->kebab-case-en keyword))))

(defn validate-query
  "WIP"
  [dialect sql default-table-schema sqlglot-schema]
  (with-open [^Closeable ctx (if config/is-dev?
                               (acquire-dev-context)
                               (acquire-context @python-context-pool))]
    (eval-python ctx "import sql_tools")
    (-> ^Value (eval-python ctx "sql_tools.validate_query")
        (.execute ^Value (object-array [dialect
                                        sql
                                        default-table-schema
                                        sqlglot-schema]))
        .asString
        json/decode+kw
        sanitize-validation-output)))
