(ns metabase.sql-parsing.graal
  "The `:graalvm` [[metabase.sql-parsing.protocol/SqlParser]]: runs sqlglot on GraalPy in-process on a
  pool of sandboxed GraalVM contexts (up to three by default).

  The pooled contexts share one `Engine` and one parsed bootstrap `Source`: the engine (and its code
  cache, which holds the parsed sqlglot modules) is created with the first context and closed with the
  last, and each context evaluates the shared source into its own realm. A context is held exclusively
  per call (so calls serialize per context); the utilization controller has min 0, so when idle the pool
  shrinks to 0 and the last `destroy` closes the engine (GraalVM reclaims neither context nor engine on
  GC, and GraalPy contexts hold significant native memory). The first call after an idle gap rebuilds
  them.

  GraalPy can occasionally hang (DEV-1393), so every call runs under a timeout; a timed-out context is
  interrupted and disposed from the pool instead of released."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.sql-parsing.common :as common]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [metabase.util.pool :as u.pool])
  (:import
   (io.aleph.dirigiste Pool)
   (java.net URI)
   (java.nio.channels SeekableByteChannel)
   (java.nio.file AccessMode DirectoryStream DirectoryStream$Filter Files FileSystems Path)
   (java.time Duration)
   (java.util Map Set)
   (java.util.concurrent ExecutionException TimeoutException)
   (org.graalvm.polyglot Context Engine HostAccess PolyglotException Source Value)
   (org.graalvm.polyglot.io FileSystem IOAccess)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Python filesystem ------------------------------------------

(defn- nio-polyglot-fs
  "Wrap a NIO `java.nio.file.FileSystem` as a polyglot `FileSystem`, routing reads to
  `Files/newByteChannel` instead of the provider's `newFileChannel`.

  The stock wrapper triggers ZipFileSystem to extract deflated entries to a temp file beside the jar,
  which fails when the jar's parent directory isn't writable (e.g. non-root in a Kubernetes pod).
  See https://github.com/metabase/metabase/issues/73541."
  ^FileSystem [^java.nio.file.FileSystem nio-fs]
  (let [provider (.provider nio-fs)]
    (reify FileSystem
      (^Path parsePath [_ ^URI uri]
        (.getPath provider uri))
      (^Path parsePath [_ ^String s]
        (.getPath nio-fs s (into-array String [])))
      (^void checkAccess [_ ^Path p ^Set modes ^"[Ljava.nio.file.LinkOption;" _opts]
        ;; LinkOption opts are dropped: the only value is NOFOLLOW_LINKS, and neither our jar zip FS
        ;; nor resources/python-sources contains symlinks.
        (.checkAccess provider p ^"[Ljava.nio.file.AccessMode;" (into-array AccessMode modes)))
      (^void createDirectory [_ ^Path p ^"[Ljava.nio.file.attribute.FileAttribute;" attrs]
        (Files/createDirectory p attrs))
      (^void delete [_ ^Path p]
        (Files/delete p))
      (^SeekableByteChannel newByteChannel
        [_ ^Path p ^Set opts ^"[Ljava.nio.file.attribute.FileAttribute;" attrs]
        (Files/newByteChannel p opts attrs))
      (^DirectoryStream newDirectoryStream [_ ^Path dir ^DirectoryStream$Filter filter]
        (Files/newDirectoryStream dir filter))
      (^Path toAbsolutePath [_ ^Path p]
        (.toAbsolutePath p))
      (^Path toRealPath [_ ^Path p ^"[Ljava.nio.file.LinkOption;" opts]
        (.toRealPath p opts))
      (^Map readAttributes [_ ^Path p ^String attrs ^"[Ljava.nio.file.LinkOption;" opts]
        (Files/readAttributes p attrs opts)))))

(defn- read-only-polyglot-fs
  "Wrap an NIO `java.nio.file.FileSystem` as a read-only polyglot FileSystem suitable for GraalPy."
  ^FileSystem [^java.nio.file.FileSystem nio-fs]
  (-> nio-fs nio-polyglot-fs FileSystem/newReadOnlyFileSystem))

(defonce ^:private
  ^{:doc "A read-only polyglot FileSystem and the PythonPath within it.
          In dev: wraps the default filesystem, path is resources/python-sources.
          In jar: wraps the jar's zip filesystem, path is /python-sources.
          Either way, the filesystem is read-only so extracted sources cannot be tampered with."}
  python-fs-and-path
  (delay
    (if (common/jar-resource? common/python-sources-resource)
      ;; In the jar: use the jar's zip filesystem directly. Python sources and GraalPy's stdlib are both inside the
      ;; jar, so nothing is extracted to disk and there's nothing to tamper with. The filesystem lives for the
      ;; duration of the process (via defonce + delay) and is shared by all pooled Python contexts.
      {:fs           (-> (u.files/get-jar-path) u.files/nio-fs read-only-polyglot-fs)
       :python-path  "/python-sources"
       :std-lib-home "/META-INF/resources/libpython"
       :core-home    "/META-INF/resources/libgraalpy"}
      ;; In dev: use the real filesystem (read-only wrapper). sqlglot is installed locally.
      (do
        (common/ensure-sqlglot-installed!)
        {:fs          (read-only-polyglot-fs (FileSystems/getDefault))
         :python-path common/dev-python-sources-dir}))))

;;; ---------------------------------------- shared engine + contexts -------------------------------------

(def ^:private engine-lock (Object.))

(def ^:private shared-engine
  "Atom holding `{:engine <Engine>, :source <Source>, :refs <live context count>}`, or nil when no context
  is live. Guarded by [[engine-lock]]. The engine and parsed bootstrap source are shared by every pooled
  context; they're created with the first context ([[acquire-engine!]]) and closed with the last
  ([[release-engine!]])."
  (atom nil))

(defn- create-engine
  "Build a Python `Engine`. We run interpreted (no Graal compiler on a stock JDK), so
  `engine.WarnInterpreterOnly` is silenced here (it's an engine-level option)."
  ^Engine []
  (.. (Engine/newBuilder)
      (option "engine.WarnInterpreterOnly" "false")
      (build)))

(defn- bootstrap-source
  "Build the bootstrap `Source` evaluated into every context: importing sql_tools loads it (and,
  transitively, sqlglot) into the shared engine's code cache."
  ^Source []
  (.buildLiteral (Source/newBuilder "python" "import sql_tools" "sql-tools-bootstrap")))

(defn- acquire-engine!
  "Return the shared `{:engine, :source}`, creating them with the first context. Bumps the ref count."
  []
  (locking engine-lock
    (let [state (or @shared-engine
                    {:engine (create-engine)
                     :source (bootstrap-source)
                     :refs   0})]
      (reset! shared-engine (update state :refs inc))
      state)))

(defn- release-engine!
  "Drop a ref on the shared engine, closing it once the last context is gone."
  []
  (locking engine-lock
    (let [{:keys [^Engine engine refs]} @shared-engine]
      (if (<= refs 1)
        (do (try (.close engine) (catch Exception _))
            (reset! shared-engine nil))
        (swap! shared-engine update :refs dec)))))

(defn- create-context
  "Create a sandboxed GraalPy context on `engine` configured for sqlglot: PythonPath pointing at the
  Python sources, host access for string interop, and a read-only filesystem (sources are read directly
  from the classpath/jar; nothing is extracted to disk in prod)."
  ^Context [^Engine engine]
  (let [{:keys [^FileSystem fs python-path std-lib-home core-home]} @python-fs-and-path
        io-access (.. (IOAccess/newBuilder)
                      (fileSystem fs)
                      (build))
        builder   (.. (Context/newBuilder (into-array String ["python"]))
                      (engine engine)
                      (option "python.PythonPath" python-path)
                      (allowHostAccess HostAccess/ALL)
                      (allowIO io-access))
        ;; When running from the jar, GraalPy's stdlib is also inside the jar filesystem
        ;; and we need to tell it where to find the core and stdlib paths explicitly.
        builder   (cond-> builder
                    std-lib-home (.option "python.StdLibHome" std-lib-home)
                    core-home    (.option "python.CoreHome" core-home))]
    (.build builder)))

(defn- generate-context!
  "Build a context on the shared engine and evaluate the bootstrap source into it (creating the engine +
  source if this is the first context)."
  ^Context []
  (analytics/inc! :metabase-sql-parsing/context-creations)
  (let [{:keys [^Engine engine ^Source source]} (acquire-engine!)]
    (try
      (doto (create-context engine)
        (.eval source))
      (catch Throwable t
        (release-engine!)
        (throw t)))))

(defn- destroy-context!
  "Close a context and drop its ref on the shared engine (closing the engine if it was the last context)."
  [^Context context]
  (try (.close context true) (catch Exception _))
  (release-engine!))

;;; ------------------------------------------------ context pool -----------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :sql-parsing)

(def ^:private ^Pool python-context-pool
  "A pool of up to three GraalPy contexts, each held exclusively from acquire to release, so at most
  three sqlglot calls run at once — one per context, on the shared engine. When idle for up to 10
  minutes the pool shrinks to 0 and the generator's `destroy` closes the context (and, on the last one,
  the shared engine); the first call after an idle gap rebuilds them. See
  [[metabase.util.pool/create-pool]]."
  (u.pool/create-pool generate-context! destroy-context! {:max-size 3, :idle-minutes 10}))

;;; ---------------------------------------------- timeout handling ---------------------------------------

(def ^:private ^:const call-timeout-ms
  "Timeout for Python calls: GraalPy can occasionally hang (DEV-1393)."
  30000)

(defn- with-timeout*
  "Execute f in a future; return its result, or `::timeout` after `timeout-ms`."
  [timeout-ms f]
  (let [fut (future (f))]
    (try
      (deref fut timeout-ms ::timeout)
      (catch ExecutionException e
        ;; Unwrap execution exception to get the real cause
        (throw (or (.getCause e) e)))
      (finally
        ;; If we timed out or got an exception, try to cancel the future
        ;; Note: This won't actually interrupt GraalVM, but prevents resource leaks
        (future-cancel fut)))))

(defn- interrupt!
  "Interrupt Python execution in `context`. If the interrupt times out (guest stuck in uninterruptible
  native code), force-close the context — force close cannot be denied by the guest."
  [^Context context ^long timeout-ms]
  (try
    (.interrupt context (Duration/ofMillis timeout-ms))
    (catch TimeoutException _
      (log/warn "GraalVM interrupt timed out, forcing context closure")
      (.close context true))))

(defn- do-with-python-context
  "Borrow a pooled GraalPy context and call `f` with it, held exclusively for the call (never let it — or
  a context-bound `Value` — escape). The call is guarded by a timeout: a timed-out context is
  interrupted and disposed from the pool (the next call generates a fresh one) instead of released."
  [f]
  (let [^Context context (.acquire python-context-pool pool-key)
        poisoned?        (volatile! false)]
    (analytics/inc! :metabase-sql-parsing/context-acquisitions)
    (try
      (let [result (with-timeout* call-timeout-ms #(f context))]
        (if (= result ::timeout)
          (do
            (vreset! poisoned? true)
            ;; future-cancel doesn't stop GraalVM execution, so interrupt the context itself
            ;; (1s grace period for the soft interrupt)
            (interrupt! context 1000)
            (analytics/inc! :metabase-sql-parsing/context-timeouts)
            (log/warn "Python execution timed out after" call-timeout-ms "ms - GraalVM interrupted")
            (throw (TimeoutException. (str "Python execution timed out after " call-timeout-ms "ms"))))
          result))
      (finally
        (if @poisoned?
          (.dispose python-context-pool pool-key context)
          (.release python-context-pool pool-key context))))))

;;; ------------------------------------------------- backend ---------------------------------------------

(defn- call-python
  "Execute `sql_tools.<fn-name>` with `args` on a pooled context and return the result as a string.
  Python-side failures are rethrown as the transport-agnostic
  [[metabase.sql-parsing.common/call-failed-ex]]."
  ^String [fn-name & args]
  (do-with-python-context
   (fn [^Context context]
     (try
       (let [^Value fn-ref (.eval context "python" (str "sql_tools." fn-name))]
         (.asString ^Value (.execute fn-ref (object-array args))))
       (catch PolyglotException e
         (throw (common/call-failed-ex (.getMessage e) e)))))))

(defn parser
  "The `:graalvm` [[metabase.sql-parsing.protocol/SqlParser]] — runs sqlglot on GraalPy on the pooled
  contexts."
  []
  (common/make-parser call-python))
