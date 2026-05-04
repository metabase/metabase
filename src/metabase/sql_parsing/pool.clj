(ns metabase.sql-parsing.pool
  "Namespace to handle python environment. Has only a single public function, [[python-context]] which will return a
  python context. This is an internal detail to the sql-parsing module. If you want something from this, add a
  function to the core namespace that uses this. No one should know about this implmentation detail."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.analytics-interface.core :as analytics]
   [metabase.sql-parsing.common :as common]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [potemkin :as p])
  (:import
   (io.aleph.dirigiste
    IPool$Controller
    IPool$Generator
    Pool
    Pools)
   (java.io Closeable File)
   (java.nio.file FileSystems)
   (java.time Duration)
   (java.util Collections)
   (java.util.concurrent TimeUnit TimeoutException)
   (org.graalvm.polyglot Context HostAccess)
   (org.graalvm.polyglot.io FileSystem IOAccess)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Python path resolution --------------------------------------------------

(def ^:private python-sources-resource
  "Resource path for Python sources (sql_tools.py and sqlglot)."
  "python-sources")

(defn- jar-resource?
  "True if the given resource is inside a JAR (production), false if from filesystem (dev)."
  [resource]
  (boolean
   (when-let [url (io/resource resource)]
     (.contains (.getFile ^java.net.URL url) ".jar!/"))))

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

(defn- ensure-sqlglot-installed!
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

;;; -------------------------------------------------- Python path delay --------------------------------------------------

(defonce ^:private
  ^{:doc "A read-only polyglot FileSystem and the PythonPath within it.
          In dev: wraps the default filesystem, path is resources/python-sources.
          In jar: wraps the jar's zip filesystem, path is /python-sources.
          Either way, the filesystem is read-only so extracted sources cannot be tampered with."}
  python-fs-and-path
  (delay
    (if (jar-resource? python-sources-resource)
      ;; In the jar: use the jar's zip filesystem directly. Python sources and GraalPy's stdlib
      ;; are both inside the jar, so nothing is extracted to disk and there's nothing to tamper with.
      (let [jar-path (u.files/get-jar-path)
            jar-uri  (java.net.URI. (str "jar:file:" jar-path))
            nio-fs   (FileSystems/newFileSystem jar-uri Collections/EMPTY_MAP)]
        {:fs          (-> (FileSystem/newFileSystem nio-fs)
                          FileSystem/newReadOnlyFileSystem)
         :python-path "/python-sources"
         :std-lib-home "/META-INF/resources/libpython"
         :core-home "/META-INF/resources/libgraalpy"})
      ;; In dev: use the real filesystem (read-only wrapper). sqlglot is installed locally.
      (do
        (ensure-sqlglot-installed!)
        {:fs          (-> (FileSystem/newFileSystem (FileSystems/getDefault))
                          FileSystem/newReadOnlyFileSystem)
         :python-path dev-python-sources-dir}))))

;;; -------------------------------------------- Context Wrappers ----------------------------------------------------

(p/defrecord+ PooledContext [^Context context ^Pool pool tuple poisoned?]
  common/PythonEval
  (eval-python [_this code]
    (.eval context "python" ^String code))

  Closeable
  (close [_this]
    (if @poisoned?
      (do
        (log/warn "Disposing poisoned Python context (likely hung GraalVM)")
        (.dispose pool :python tuple))
      (.release pool :python tuple))))

(defn poison!
  "Mark a PooledContext as poisoned. When closed, it will be disposed from the pool
   rather than released back. Use this when GraalVM hangs to prevent returning a
   broken context to the pool."
  [ctx]
  (when (instance? PooledContext ctx)
    (reset! (:poisoned? ctx) true)))

(defn interrupt!
  "Interrupt Python execution in this context. Returns true if interrupted successfully.
   If interrupt times out (guest in uninterruptible code), forces context closure with close(true).
   This is necessary because future-cancel doesn't actually stop GraalVM execution."
  [ctx ^long timeout-ms]
  (when-let [^Context raw-ctx (when (instance? PooledContext ctx)
                                (:context ctx))]
    (try
      (.interrupt raw-ctx (Duration/ofMillis timeout-ms))
      true
      (catch TimeoutException _
        ;; Interrupt timed out - guest app may be in uninterruptible native code
        ;; Force close cannot be denied by guest application
        (log/warn "GraalVM interrupt timed out, forcing context closure")
        (.close raw-ctx true)
        false))))

(defn- create-graalvm-context
  "Create a new GraalVM Python context configured for sqlglot.

  The context is configured with:
  - PythonPath pointing to python-sources (contains sql_tools.py and sqlglot)
  - Full host access (needed for JSON serialization)
  - Read-only filesystem (sources loaded directly from classpath/jar, no disk extraction in prod)"
  ^Context []
  (let [{:keys [^FileSystem fs python-path std-lib-home core-home]} @python-fs-and-path
        io-access (.. (IOAccess/newBuilder)
                      (fileSystem fs)
                      (build))
        builder   (.. (Context/newBuilder (into-array String ["python"]))
                      (option "engine.WarnInterpreterOnly" "false")
                      (option "python.PythonPath" python-path)
                      (allowHostAccess HostAccess/ALL)
                      (allowIO io-access))
        ;; When running from the jar, GraalPy's stdlib is also inside the jar filesystem
        ;; and we need to tell it where to find the core and stdlib paths explicitly.
        builder   (cond-> builder
                    std-lib-home (.option "python.StdLibHome" std-lib-home)
                    core-home    (.option "python.CoreHome" core-home))
        ctx       (.build builder)]
    (.eval ctx "python" "import sql_tools")
    ctx))

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
                (analytics/inc! :metabase-sql-parsing/context-creations)
                [(context-generator)
                 (+ (System/nanoTime) (.toNanos TimeUnit/MINUTES ttl-minutes))])
              (destroy [_ _ [^Context ctx _expiry]]
                ;; Close context when disposed from pool (expiry, poison, or shutdown)
                (try
                  (.close ctx true) ;; Force close - can't wait for running code
                  (catch Exception _))))
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
        (do (analytics/inc! :metabase-sql-parsing/context-disposals-expired)
            (.dispose pool :python tuple)
            (recur))
        (do (analytics/inc! :metabase-sql-parsing/context-acquisitions)
            (->PooledContext context pool tuple (atom false)))))))

(defn python-context
  "Acquire a python context from the pool. Must be closed. Use in a `with-open` context."
  []
  (acquire-context @python-context-pool))
