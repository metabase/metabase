(ns metabase.channel.render.js.quickjs
  "The QuickJS [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS on a
  pool of QuickJS contexts embedded in-process via `libstaticviz` (`native/static-viz-quickjs`), a
  small C library loaded with JNA.

  Unlike the GraalVM renderer, whose contexts live on the managed JVM heap (sized into `-Xmx`, traced
  by the GC), QuickJS allocates through plain malloc: native memory, invisible to the JVM heap. The
  pool mirrors the GraalVM renderer's semantics — up to [[max-concurrent-renders]] contexts, each held
  exclusively per render, shrinking to zero after ~1 minute idle so the memory returns to the OS when
  nothing is rendering. Each context caps its JS heap and stack, renders are wall-clock-bounded via the
  engine's interrupt handler, and a context that times out or exhausts its heap is disposed rather than
  reused. The engine exposes no filesystem, network, timer, or host access of any kind.

  On first use the library precompiles the bundle to QuickJS bytecode in a private temp directory,
  cutting per-context bundle evaluation from ~750ms to ~300ms; renders on a warm context then cost
  ~30-70ms.

  Selected via `MB_STATIC_VIZ_RENDERER=quickjs` (see [[metabase.channel.render.js.renderer]]). The
  library is looked up on the classpath at `static-viz-quickjs/<os>-<arch>/libstaticviz.<ext>` (built
  by `native/static-viz-quickjs/build.sh`) or taken from `MB_STATIC_VIZ_LIBRARY_PATH`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (com.sun.jna Function NativeLibrary Pointer)
   (com.sun.jna.ptr PointerByReference)
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.io File)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute PosixFilePermission PosixFilePermissions)
   (java.security DigestInputStream MessageDigest)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource-path "frontend_client/app/dist/lib-static-viz.bundle.js")

;;; ------------------------------------------------ config -----------------------------------------------

(defn- render-timeout-ms
  []
  (or (config/config-int :mb-static-viz-timeout-ms) 30000))

(defn- memory-limit-mb
  []
  (or (config/config-int :mb-static-viz-memory-limit-mb) 512))

(def ^:private stack-limit-mb 8)

(def ^:private max-concurrent-renders
  "Context pool cap. Each warm context retains a few hundred MB of native (off-JVM-heap) memory, so
  this bounds the machine-level footprint; renders beyond it queue."
  (delay (or (config/config-int :mb-static-viz-max-concurrency) 2)))

;;; ------------------------------------------------ library ----------------------------------------------

(defn- platform
  "`<os>-<arch>` directory name the library is published under, or nil on unsupported platforms."
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

(defn- library-file-name
  []
  (if (str/includes? (u/lower-case-en (System/getProperty "os.name" "")) "mac")
    "libstaticviz.dylib"
    "libstaticviz.so"))

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
  "Private (owner-only) temp directory holding the extracted library, the materialized bundle, and its
  compiled bytecode. Deleted on JVM exit."
  (delay
    (let [dir (Files/createTempDirectory "metabase-static-viz-" (owner-only-permissions))]
      (delete-recursively-on-exit! dir)
      dir)))

(defn- work-file
  ^File [file-name]
  (.toFile (.resolve ^Path @work-dir ^String file-name)))

(def ^:private library-path
  "Absolute path of the libstaticviz shared library, or nil when none is available for this platform.
  `MB_STATIC_VIZ_LIBRARY_PATH` overrides the classpath lookup."
  (delay
    (or (config/config-str :mb-static-viz-library-path)
        (when-let [resource (when-let [platform-dir (platform)]
                              (io/resource (format "static-viz-quickjs/%s/%s"
                                                   platform-dir
                                                   (library-file-name))))]
          (let [file (work-file (library-file-name))]
            (with-open [in (io/input-stream resource)]
              (io/copy in file))
            (.getAbsolutePath file))))))

(def ^:private library
  (delay
    ;; JNA marshals Java strings with `jna.encoding`, which is not UTF-8 on all platforms by default;
    ;; render inputs and outputs routinely contain non-ASCII text.
    (System/setProperty "jna.encoding" "UTF-8")
    (NativeLibrary/getInstance ^String @library-path)))

(defn- library-fn
  ^Function [fn-name]
  (.getFunction ^NativeLibrary @library ^String fn-name))

(defn available?
  "Whether the QuickJS renderer can run: a libstaticviz build exists for this platform (or is
  explicitly configured)."
  []
  (boolean @library-path))

;;; ---------------------------------------------- C API calls --------------------------------------------

(defn- take-error!
  "Read, free, and return the message a `svq_*` call left in its `char **error_out` parameter (nil when
  the call succeeded)."
  [^PointerByReference error-ref]
  (when-let [pointer (.getValue error-ref)]
    (let [message (.getString pointer 0 "UTF-8")]
      (.invokeVoid (library-fn "svq_free_string") (to-array [pointer]))
      message)))

(defn- take-string!
  "Read and free a malloc'd string returned by a `svq_*` call."
  [^Pointer pointer]
  (let [value (.getString pointer 0 "UTF-8")]
    (.invokeVoid (library-fn "svq_free_string") (to-array [pointer]))
    value))

(defn- create-context!
  "Create a QuickJS context with the bundle at `bundle-path` evaluated into it, returning an opaque
  native handle. The handle is not thread-safe and must be held exclusively per render."
  ^Pointer [^String bundle-path]
  (let [error-ref (PointerByReference.)
        handle    (.invokePointer (library-fn "svq_create")
                                  (to-array [bundle-path (int (memory-limit-mb)) (int stack-limit-mb) error-ref]))]
    (or handle
        (throw (ex-info (str "cannot create static-viz context: " (take-error! error-ref)) {})))))

(defn- close-context!
  [^Pointer handle]
  (.invokeVoid (library-fn "svq_close") (to-array [handle])))

(defn- compile-bundle!
  "Compile the bundle source at `in-path` to QuickJS bytecode at `out-path`. Bytecode is only valid for
  the library build that produced it, which is also the build that will execute it."
  [^String in-path ^String out-path]
  (let [error-ref (PointerByReference.)
        status    (.invokeInt (library-fn "svq_compile")
                              (to-array [in-path out-path (int (memory-limit-mb)) error-ref]))]
    (when-not (zero? status)
      (throw (ex-info (str "cannot compile static-viz bundle: " (take-error! error-ref)) {})))))

(defn- call-fn!
  "Call `MetabaseStaticViz.<fn-name>` on `handle` with the already-JSON-encoded string `input` and
  return the result string. Throws on JS errors; a timeout or JS-heap exhaustion additionally marks the
  exception with `::dispose-context?` so the caller retires the context instead of reusing it."
  ^String [^Pointer handle ^String fn-name ^String input]
  (let [error-ref (PointerByReference.)
        result    (.invokePointer (library-fn "svq_call")
                                  (to-array [handle fn-name input (int (render-timeout-ms)) error-ref]))]
    (if result
      (take-string! result)
      (let [message (take-error! error-ref)]
        (cond
          (= message "TIMEOUT")
          (throw (ex-info "static-viz render timed out"
                          {:fn fn-name, :timeout-ms (render-timeout-ms), ::dispose-context? true}))

          (str/includes? (str message) "out of memory")
          (throw (ex-info (str "static-viz render failed: " message)
                          {:fn fn-name, ::dispose-context? true}))

          :else
          (throw (ex-info (str "static-viz render failed: " message) {:fn fn-name})))))))

;;; ----------------------------------------- bundle bytecode cache ---------------------------------------

(defn- resource-sha1
  ^String [resource]
  (let [digest (MessageDigest/getInstance "SHA-1")]
    (with-open [in (DigestInputStream. (io/input-stream resource) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%040x" (BigInteger. 1 (.digest digest)))))

(defn- prepare-bundle!
  "Materialize the bundle from the classpath and precompile it to bytecode, returning the path contexts
  should be created from. Falls back to evaluating from source if precompilation fails. Files are named
  by the bundle's sha, so re-preparing a changed bundle (dev) never touches files a live context was
  created from."
  ^String [resource sha]
  (let [source-file (work-file (str "lib-static-viz-" sha ".js"))
        qbc-file    (work-file (str "lib-static-viz-" sha ".qbc"))]
    (with-open [in (io/input-stream resource)]
      (io/copy in source-file))
    (try
      (compile-bundle! (.getAbsolutePath source-file) (.getAbsolutePath qbc-file))
      (.getAbsolutePath qbc-file)
      (catch Exception e
        (log/warn e "Failed to precompile static-viz bundle to QuickJS bytecode; evaluating from source")
        (.getAbsolutePath source-file)))))

(def ^:private bundle-state
  "`{:sha .., :bundle-path ..}` for the currently prepared bundle. The sha is re-checked per context in
  dev so a fresh `bun run build-static-viz` is picked up without a REPL restart; in prod the bundle
  can't change under a running JVM, so it's prepared once."
  (atom nil))

(defn- bundle-path!
  ^String []
  (let [resource (or (io/resource bundle-resource-path)
                     (throw (ex-info (str "Javascript resource not found: " bundle-resource-path)
                                     {:source bundle-resource-path})))]
    (if (and (not config/is-dev?) (some? @bundle-state))
      (:bundle-path @bundle-state)
      (locking bundle-state
        (let [sha (resource-sha1 resource)]
          (when-not (= sha (:sha @bundle-state))
            (reset! bundle-state {:sha sha, :bundle-path (prepare-bundle! resource sha)}))
          (:bundle-path @bundle-state))))))

;;; ---------------------------------------------- context pool -------------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :static-viz-quickjs)

(def ^:private context-pool
  "A pool of up to [[max-concurrent-renders]] QuickJS contexts, each held exclusively from acquire to
  release. The utilization controller has min 0, so after ~1 minute idle the pool shrinks to zero and
  the contexts' native memory returns to the OS; the first render after an idle gap re-creates one
  (~300ms bundle evaluation from bytecode)."
  (delay
    (let [max-queued-acquires 65000
          sample-period-ms    (.toMillis TimeUnit/MILLISECONDS 25)
          control-period-ms   (.toMillis TimeUnit/MINUTES 1)]
      (Pool. (reify IPool$Generator
               (generate [_ _]
                 (create-context! (bundle-path!)))
               (destroy [_ _ handle]
                 (close-context! handle)))
             (Pools/utilizationController 1.0 (int @max-concurrent-renders) (int @max-concurrent-renders))
             max-queued-acquires
             sample-period-ms
             control-period-ms
             TimeUnit/MILLISECONDS))))

(defn- do-with-context
  "Borrow a pooled context and call `f` with it, held exclusively for the call. A context whose render
  failed with `::dispose-context?` (timeout, JS heap exhaustion) is destroyed instead of returned to
  the pool. In dev, creates and closes a throwaway context per call so a fresh
  `bun run build-static-viz` is picked up without a REPL restart."
  [f]
  (if config/is-dev?
    (let [handle (create-context! (bundle-path!))]
      (try
        (f handle)
        (finally (close-context! handle))))
    (let [pool   ^Pool @context-pool
          handle (.acquire pool pool-key)]
      (try
        (let [result (f handle)]
          (.release pool pool-key handle)
          result)
        (catch Throwable t
          (if (::dispose-context? (ex-data t))
            (.dispose pool pool-key handle)
            (.release pool pool-key handle))
          (throw t))))))

;;; ------------------------------------------------ backend ----------------------------------------------

(defn- call-js
  ^String [^String fn-name ^String input]
  (do-with-context
   (fn [handle]
     (call-fn! handle fn-name input))))

(defn renderer
  "The QuickJS [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS on
  pooled in-process QuickJS contexts whose memory lives outside the JVM heap. Each method JSON-encodes
  its `input` map for the bundle and decodes the bundle's JSON result back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChartJSON" (json/encode input))))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColorsJSON" (json/encode input))))))
