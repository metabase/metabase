(ns metabase.channel.render.js.quickjs
  "The QuickJS [[metabase.channel.render.js.protocol/StaticVizRenderer]]: renders each chart in a
  short-lived native worker process (`native/static-viz-worker`), one process per render.

  Unlike the in-process GraalVM renderer, the JS heap (a few hundred MB while rendering) lives in the
  worker process, not the JVM: it is fully reclaimed by the OS when the process exits, and the JVM's
  memory footprint stays flat regardless of render volume. The process boundary is also the isolation
  boundary — the worker's engine exposes no filesystem, network, or host access of any kind, its heap
  and stack are capped, and a wall-clock timeout here kills the process outright.

  On first use the worker precompiles the bundle to QuickJS bytecode in a private temp directory, which
  cuts per-render bundle evaluation from ~750ms to ~300ms; renders then cost ~350ms wall-clock each. Up
  to [[max-concurrent-renders]] workers run at once; excess renders queue on a semaphore.

  Selected via `MB_STATIC_VIZ_RENDERER=quickjs` (see [[metabase.channel.render.js.renderer]]). The
  worker binary is looked up on the classpath at `static-viz-worker/<os>-<arch>/static-viz-worker`
  (built by `native/static-viz-worker/build.sh`) or taken from `MB_STATIC_VIZ_WORKER_PATH`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayOutputStream File)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute PosixFilePermission PosixFilePermissions)
   (java.security DigestInputStream MessageDigest)
   (java.util.concurrent Semaphore TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource-path "frontend_client/app/dist/lib-static-viz.bundle.js")

;;; ------------------------------------------------ config -----------------------------------------------

(defn- render-timeout-ms
  []
  (or (config/config-int :mb-static-viz-timeout-ms) 30000))

(def ^:private max-concurrent-renders
  "Concurrent worker process cap. Each worker peaks at a few hundred MB of (off-JVM-heap) RSS, so this
  bounds the machine-level memory transient; renders beyond it queue."
  (delay (or (config/config-int :mb-static-viz-max-concurrency) 2)))

(def ^:private render-semaphore
  (delay (Semaphore. (long @max-concurrent-renders) true)))

;;; -------------------------------------------- worker binary --------------------------------------------

(defn- platform
  "`<os>-<arch>` directory name the worker binary is published under, or nil on unsupported platforms."
  []
  (let [os-name (u/lower-case-en (System/getProperty "os.name" ""))
        arch    (u/lower-case-en (System/getProperty "os.arch" ""))
        os      (cond
                  (str/includes? os-name "linux") "linux"
                  (str/includes? os-name "mac")   "macos")
        arch    (case arch
                  ("aarch64" "arm64") "arm64"
                  ("x86_64" "amd64")  "amd64"
                  nil)]
    (when (and os arch)
      (str os "-" arch))))

(defn- owner-only-permissions
  ^"[Ljava.nio.file.attribute.FileAttribute;" []
  (into-array FileAttribute
              [(PosixFilePermissions/asFileAttribute
                #{PosixFilePermission/OWNER_READ
                  PosixFilePermission/OWNER_WRITE
                  PosixFilePermission/OWNER_EXECUTE})]))

(defn- delete-recursively-on-exit!
  [^Path dir]
  (.addShutdownHook (Runtime/getRuntime)
                    (Thread. ^Runnable
                     (fn []
                       (doseq [^File f (reverse (file-seq (.toFile dir)))]
                         (.delete f))))))

(def ^:private work-dir
  "Private (owner-only) temp directory holding the extracted worker binary, the materialized bundle, and
  its compiled bytecode. Deleted on JVM exit."
  (delay
    (let [dir (Files/createTempDirectory "metabase-static-viz-" (owner-only-permissions))]
      (delete-recursively-on-exit! dir)
      dir)))

(defn- work-file
  ^File [file-name]
  (.toFile (.resolve ^Path @work-dir ^String file-name)))

(def ^:private worker-path
  "Absolute path of the worker executable, or nil when no binary is available for this platform.
  `MB_STATIC_VIZ_WORKER_PATH` overrides the classpath lookup."
  (delay
    (or (config/config-str :mb-static-viz-worker-path)
        (when-let [resource (some->> (platform)
                                     (format "static-viz-worker/%s/static-viz-worker")
                                     io/resource)]
          (let [file (work-file "static-viz-worker")]
            (with-open [in (io/input-stream resource)]
              (io/copy in file))
            (.setExecutable file true true)
            (.getAbsolutePath file))))))

(defn available?
  "Whether the QuickJS renderer can run: a worker binary exists for this platform (or is explicitly
  configured)."
  []
  (boolean @worker-path))

;;; ------------------------------------------- worker processes ------------------------------------------

(defn- run-worker!
  "Run the worker with `args`, optionally writing `stdin-str` to its stdin, and return its stdout as a
  string. Kills the process and throws on timeout; throws with the stderr tail on non-zero exit.

  The worker gets an empty environment apart from its own limit knobs — it needs nothing from ours."
  ^String [args stdin-str timeout-ms]
  (let [worker  (or @worker-path
                    (throw (ex-info "no static-viz worker binary available for this platform" {})))
        builder (ProcessBuilder. ^java.util.List (into [^String worker] args))
        _       (let [env (.environment builder)]
                  (.clear env)
                  (when-let [limit (config/config-str :mb-static-viz-memory-limit-mb)]
                    (.put env "STATIC_VIZ_WORKER_MEMORY_LIMIT_MB" limit)))
        process (.start builder)
        ;; A worker that fails early exits without draining stdin; ignore the resulting broken pipe so
        ;; the JS error on stderr surfaces instead.
        _stdin  (future
                  (try
                    (with-open [out (.getOutputStream process)]
                      (when stdin-str
                        (.write out (.getBytes ^String stdin-str "UTF-8"))))
                    (catch java.io.IOException _)))
        stdout  (future
                  (let [buffer (ByteArrayOutputStream.)]
                    (io/copy (.getInputStream process) buffer)
                    (.toString buffer "UTF-8")))
        stderr  (future (slurp (.getErrorStream process)))]
    (try
      (when-not (.waitFor process (long timeout-ms) TimeUnit/MILLISECONDS)
        (throw (ex-info "static-viz worker timed out"
                        {:args args, :timeout-ms timeout-ms})))
      (let [exit-code (.exitValue process)]
        (when-not (zero? exit-code)
          (throw (ex-info (str "static-viz worker failed: " (str/trim (str @stderr)))
                          {:args args, :exit-code exit-code})))
        @stdout)
      (finally
        (.destroyForcibly process)))))

;;; ----------------------------------------- bundle bytecode cache ---------------------------------------

(defn- resource-sha1
  ^String [resource]
  (let [digest (MessageDigest/getInstance "SHA-1")]
    (with-open [in (DigestInputStream. (io/input-stream resource) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%040x" (BigInteger. 1 (.digest digest)))))

(defn- prepare-bundle!
  "Materialize the bundle from the classpath and precompile it to bytecode, returning the path the
  worker should render from. Falls back to rendering from source if precompilation fails. Files are
  named by the bundle's sha, so re-preparing a changed bundle (dev) never touches files a concurrent
  render may be reading."
  ^String [resource sha]
  (let [source-file (work-file (str "lib-static-viz-" sha ".js"))
        qbc-file    (work-file (str "lib-static-viz-" sha ".qbc"))]
    (with-open [in (io/input-stream resource)]
      (io/copy in source-file))
    (try
      (run-worker! ["compile" (.getAbsolutePath source-file) (.getAbsolutePath qbc-file)] nil 60000)
      (.getAbsolutePath qbc-file)
      (catch Exception e
        (log/warn e "Failed to precompile static-viz bundle to QuickJS bytecode; rendering from source")
        (.getAbsolutePath source-file)))))

(def ^:private bundle-state
  "`{:sha .., :render-path ..}` for the currently prepared bundle. The sha is re-checked per render in
  dev so a fresh `bun run build-static-viz` is picked up without a REPL restart; in prod the bundle
  can't change under a running JVM, so it's prepared once."
  (atom nil))

(defn- render-path!
  ^String []
  (let [resource (or (io/resource bundle-resource-path)
                     (throw (ex-info (str "Javascript resource not found: " bundle-resource-path)
                                     {:source bundle-resource-path})))]
    (if (and (not config/is-dev?) (some? @bundle-state))
      (:render-path @bundle-state)
      (locking bundle-state
        (let [sha (resource-sha1 resource)]
          (when-not (= sha (:sha @bundle-state))
            (reset! bundle-state {:sha sha, :render-path (prepare-bundle! resource sha)}))
          (:render-path @bundle-state))))))

;;; ------------------------------------------------ backend ----------------------------------------------

(defn- call-js
  "Execute static-viz bundle function `fn-name` (a `MetabaseStaticViz.*` global) with the
  already-JSON-encoded string `input` in a fresh worker process."
  ^String [^String fn-name ^String input]
  (let [path      (render-path!)
        semaphore ^Semaphore @render-semaphore]
    (.acquire semaphore)
    (try
      (run-worker! ["render" path fn-name] input (render-timeout-ms))
      (finally
        (.release semaphore)))))

(defn renderer
  "The QuickJS [[metabase.channel.render.js.protocol/StaticVizRenderer]] — renders each chart in a
  sandboxed native worker process. Each method JSON-encodes its `input` map for the bundle and decodes
  the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChart" (json/encode input))))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColors" (json/encode input))))))
