(ns metabase.channel.render.js.escargot
  "The Escargot [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS on a
  pool of Escargot contexts embedded in-process via `libstaticviz` (`native/static-viz-escargot`), a
  small C++ library loaded with JNA.

  Escargot is used for two properties GraalJS doesn't offer together: its contexts allocate native
  memory (invisible to the JVM heap and GC — the JVM's footprint stays flat regardless of render
  volume), and it implements the full ECMA-402 Intl API over real ICU, so charts format numbers,
  currencies, and timezone-aware dates identically to a browser with no polyfill in the bundle.

  The pool mirrors the GraalVM renderer's semantics — up to [[max-concurrent-renders]] contexts, each
  held exclusively per render, shrinking to zero after ~1 minute idle so the memory returns to the OS
  when nothing is rendering. Creating a context evaluates the bundle (~0.5s); renders on a warm context
  then cost tens of milliseconds. The engine exposes no filesystem, network, timer, or host access of
  any kind.

  Selected via `MB_STATIC_VIZ_RENDERER` (see [[metabase.channel.render.js.renderer]]). The library is
  looked up on the classpath at `static-viz-escargot/<os>-<arch>/libstaticviz.<ext>` (built by
  `native/static-viz-escargot/build.sh`) or taken from `MB_STATIC_VIZ_LIBRARY_PATH`."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json])
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
  "Private (owner-only) temp directory holding the extracted library and the materialized bundle.
  Deleted on JVM exit."
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
                              (io/resource (format "static-viz-escargot/%s/%s"
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
  "Whether the Escargot renderer can run: a libstaticviz build exists for this platform (or is
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
  "Create an Escargot context with the bundle at `bundle-path` evaluated into it, returning an opaque
  native handle. The handle is not thread-safe and must be held exclusively per render."
  ^Pointer [^String bundle-path]
  (let [error-ref (PointerByReference.)
        handle    (.invokePointer (library-fn "svq_create") (to-array [bundle-path error-ref]))]
    (or handle
        (throw (ex-info (str "cannot create static-viz context: " (take-error! error-ref)) {})))))

(defn- close-context!
  [^Pointer handle]
  (.invokeVoid (library-fn "svq_close") (to-array [handle])))

(defn- call-fn!
  "Call `MetabaseStaticViz.<fn-name>` on `handle` with the already-JSON-encoded string `input` and
  return the result string. Throws with the JS error and stack on failure."
  ^String [^Pointer handle ^String fn-name ^String input]
  (let [error-ref (PointerByReference.)
        result    (.invokePointer (library-fn "svq_call")
                                  (to-array [handle fn-name input error-ref]))]
    (if result
      (take-string! result)
      (throw (ex-info (str "static-viz render failed: " (take-error! error-ref)) {:fn fn-name})))))

;;; ------------------------------------------------ bundle -----------------------------------------------

(defn- resource-sha1
  ^String [resource]
  (let [digest (MessageDigest/getInstance "SHA-1")]
    (with-open [in (DigestInputStream. (io/input-stream resource) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%040x" (BigInteger. 1 (.digest digest)))))

(def ^:private bundle-state
  "`{:sha .., :bundle-path ..}` for the currently materialized bundle. The sha is re-checked per context
  in dev so a fresh `bun run build-static-viz` is picked up without a REPL restart; in prod the bundle
  can't change under a running JVM, so it's materialized once. Files are named by sha, so a changed
  bundle (dev) never touches the file a live context was created from."
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
            (let [file (work-file (str "lib-static-viz-" sha ".js"))]
              (with-open [in (io/input-stream resource)]
                (io/copy in file))
              (reset! bundle-state {:sha sha, :bundle-path (.getAbsolutePath file)})))
          (:bundle-path @bundle-state))))))

;;; ---------------------------------------------- context pool -------------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key itself is arbitrary, it just has to be the same for every operation."
  :static-viz-escargot)

(def ^:private context-pool
  "A pool of up to [[max-concurrent-renders]] Escargot contexts, each held exclusively from acquire to
  release. The utilization controller has min 0, so after ~1 minute idle the pool shrinks to zero and
  the contexts' native memory returns to the OS; the first render after an idle gap re-creates one
  (~0.5s bundle evaluation)."
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
  "Borrow a pooled context and call `f` with it, held exclusively for the call. In dev, creates and
  closes a throwaway context per call so a fresh `bun run build-static-viz` is picked up without a REPL
  restart."
  [f]
  (if config/is-dev?
    (let [handle (create-context! (bundle-path!))]
      (try
        (f handle)
        (finally (close-context! handle))))
    (let [pool   ^Pool @context-pool
          handle (.acquire pool pool-key)]
      (try
        (f handle)
        (finally (.release pool pool-key handle))))))

;;; ------------------------------------------------ backend ----------------------------------------------

(defn- call-js
  ^String [^String fn-name ^String input]
  (do-with-context
   (fn [handle]
     (call-fn! handle fn-name input))))

(defn renderer
  "The Escargot [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS on
  pooled in-process Escargot contexts whose memory lives outside the JVM heap and whose Intl is real
  ICU. Each method JSON-encodes its `input` map for the bundle and decodes the bundle's JSON result
  back into Clojure data."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (json/decode+kw (call-js "renderChart" (json/encode input))))
    (cell-background-colors [_ input]
      (json/decode (call-js "getCellBackgroundColors" (json/encode input))))))
