(ns metabase.sql-parsing.common
  "Shared helpers for pooled sqlglot parsers (see [[metabase.sql-parsing.graal]]): the python-sources
  locations, the lazy dev sqlglot install, the protocol reify over a transport function, and the
  dirigiste worker-pool factory (copied from [[metabase.channel.render.js.common]])."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.io File)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Python path resolution ---------------------------------------

(def python-sources-resource
  "Resource path for Python sources (sql_tools.py and sqlglot)."
  "python-sources")

(defn jar-resource?
  "True if the given resource is inside a JAR (production), false if from filesystem (dev)."
  [resource]
  (boolean
   (when-let [url (io/resource resource)]
     (.contains (.getFile ^java.net.URL url) ".jar!/"))))

;;; ---------------------------------------- Dev lazy installation ----------------------------------------

(def dev-python-sources-dir
  "Directory where sqlglot is installed in dev mode."
  "resources/python-sources")

(defn- delete-recursive!
  "Recursively delete a directory and all its contents."
  [^File f]
  (when (.isDirectory f)
    (doseq [child (.listFiles f)]
      (delete-recursive! child)))
  (.delete f))

(defn expected-sqlglot-version
  "Read the expected sqlglot version from pyproject.toml resource file."
  []
  (some->> (io/resource "python-sources/pyproject.toml")
           slurp
           (re-find #"\"sqlglot==([^\"]+)\"")
           second))

(defn- package-installer-available?
  "Check if uv or pip is available for installing Python packages."
  []
  (or (zero? (:exit (shell/sh "which" "uv")))
      (zero? (:exit (shell/sh "which" "pip")))))

(defn- version-installed?
  "Check if sqlglot is installed with the expected version. Verifies both the dist-info metadata
  (needed by uv/pip) and the actual module (needed by Python import)."
  [target-dir expected-version]
  (and (.exists (io/file target-dir (str "sqlglot-" expected-version ".dist-info") "METADATA"))
       (.exists (io/file target-dir "sqlglot" "__init__.py"))))

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
  (let [pyproject-file (str target-dir "/pyproject.toml")
        uv-result      (shell/sh "uv" "pip" "install" "-r" pyproject-file "--target" target-dir "--no-compile" "--reinstall")]
    (if (zero? (:exit uv-result))
      (log/info "sqlglot" version "installed via uv")
      (do
        (log/info "uv not available, trying pip...")
        (let [pkg        (str "sqlglot==" version)
              pip-result (shell/sh "pip" "install" pkg "--target" target-dir "--no-compile" "--force-reinstall")]
          (when-not (zero? (:exit pip-result))
            (throw (ex-info (str "Failed to install sqlglot. Please install uv (recommended) or pip.\n"
                                 "Manual install: uv pip install -r " pyproject-file " --target " target-dir "\n"
                                 "Install uv: https://docs.astral.sh/uv/getting-started/installation/")
                            {:uv-error   (:err uv-result)
                             :pip-error  (:err pip-result)
                             :version    version
                             :target-dir target-dir})))
          (log/info "sqlglot" version "installed via pip"))))))

(defn ensure-sqlglot-installed!
  "Ensure sqlglot is installed with correct version. Called lazily on first use in dev.
  If version mismatch or missing, automatically installs the correct version."
  []
  (let [expected-ver (expected-sqlglot-version)]
    (when-not expected-ver
      (throw (ex-info "Missing pyproject.toml or unable to parse sqlglot entry in resources/python-sources/"
                      {:resource "python-sources/pyproject.toml"})))
    (when-not (version-installed? dev-python-sources-dir expected-ver)
      (if (package-installer-available?)
        (do
          (log/info "Installing sqlglot" expected-ver "(first use in dev)...")
          (install-sqlglot! dev-python-sources-dir expected-ver))
        (log/warn "sqlglot not installed and no package installer (uv or pip) found."
                  "SQL parsing features will fail until sqlglot is installed."
                  "Install uv: https://docs.astral.sh/uv/getting-started/installation/")))))

;;; ------------------------------------------------- parser ----------------------------------------------

(defn call-failed-ex
  "The uniform exception for a Python-side sqlglot failure, thrown by every transport so callers can
  handle parse errors without knowing which backend ran ([[metabase.sql-parsing.core/parse-error?]]).
  `error` is the Python error rendered as `ErrorType: message`."
  ([error]
   (call-failed-ex error nil))
  ([error cause]
   (ex-info (str "sqlglot call failed: " error)
            {:sql-parsing/error             true
             :sql-parsing/python-error-type (some->> error (re-find #"^\w+"))}
            cause)))

(defn make-parser
  "Build a [[metabase.sql-parsing.protocol/SqlParser]] over `call`, a transport function
  `(call fn-name & args) → string` that executes `sql_tools.<fn-name>` with `args`. JSON results are
  decoded into Clojure data; schema and replacement arguments are passed to Python as JSON strings (the
  `sql_tools` functions take them that way — GraalVM polyglot map conversion is unreliable)."
  [call]
  (reify protocol/SqlParser
    (referenced-tables [_ dialect sql]
      (vec (json/decode (call "referenced_tables" sql dialect))))
    (referenced-fields [_ dialect sql]
      (vec (json/decode (call "referenced_fields" sql dialect))))
    (returned-columns-lineage [_ dialect sql default-table-schema sqlglot-schema]
      (vec (json/decode (call "returned_columns_lineage"
                              dialect sql default-table-schema (json/encode sqlglot-schema)))))
    (validate-query [_ dialect sql default-table-schema sqlglot-schema]
      ;; nil → "{}" (an empty JSON object), which sql_tools reads as permissive mode; encoding the
      ;; *string* "{}" here would double-encode and make Python treat a string as the schema
      (json/decode+kw (call "validate_query"
                            dialect sql default-table-schema (json/encode (or sqlglot-schema {})))))
    (simple-query [_ dialect sql]
      (json/decode+kw (call "simple_query" sql dialect)))
    (add-into-clause [_ dialect sql table-name]
      (call "add_into_clause" sql table-name dialect))
    (field-references [_ dialect sql]
      (json/decode+kw (call "field_references" sql dialect)))
    (replace-names [_ dialect sql replacements]
      (call "replace_names" sql (json/encode replacements) dialect))
    (single-stmt-of-type [_ dialect sql stmt-type]
      (json/decode+kw (call "is_single_stmt_of_type" sql stmt-type dialect)))
    (transpile-sql [_ sql from-dialect to-dialect]
      (json/decode+kw (call "transpile_sql" sql from-dialect to-dialect)))))

;;; -------------------------------------------------- pool -----------------------------------------------

(defn create-pool
  "Build a dirigiste `Pool` of workers, each held exclusively per call (so at most `:max-size`
  calls run at once). `:max-size` is the maximum number of concurrent workers. The utilization
  controller targets 100% utilization with a min of 0, so when nothing is running the pool shrinks to 0
  and `destroy` is called on each idle worker; it rechecks every `:idle-minutes`, so a worker
  lingers up to that long before being reaped (keeping it warm through gaps between calls). `(generate)`
  mints a worker; `(destroy worker)` tears one down. The other constructor args (queue size, sampling
  interval) don't matter much."
  ^Pool [generate destroy {:keys [max-size idle-minutes]}]
  (let [max-queued-acquires 65000
        sample-period-ms    (.toMillis TimeUnit/MILLISECONDS 25)
        control-period-ms   (.toMillis TimeUnit/MINUTES idle-minutes)]
    (Pool. (reify IPool$Generator
             (generate [_ _] (generate))
             (destroy [_ _ worker] (destroy worker)))
           (Pools/utilizationController 1.0 max-size max-size)
           max-queued-acquires
           sample-period-ms
           control-period-ms
           TimeUnit/MILLISECONDS)))
