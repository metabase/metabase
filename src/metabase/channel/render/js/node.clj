(ns metabase.channel.render.js.node
  "The `:node` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS in a pool
  of external Node.js child processes rather than in-process on GraalVM. Each process runs the
  self-contained node entrypoint (`app-static-viz-cli.bundle.js`, built by `rspack.static-viz.config.js`),
  which answers newline-delimited JSON render requests over stdin/stdout.

  The script is written to a fresh temp file from the classpath at every process spawn, executed
  immediately, and deleted when the process is destroyed. So what `node` executes always comes straight
  out of the jar — there is no long-lived on-disk copy to drift out of sync or be tampered with, and no
  deploy-time provisioning.

  The pool holds a single process, held exclusively per render (so renders serialize onto it); with a min
  of 0 it shrinks to 0 when idle, killing the process after 1 minute with no work. We cap it at one
  process — spawning a fresh `node` (runtime init + bundle load) is costly, and a warm process renders
  fast enough that queuing a second render behind it beats paying that startup cost for concurrency.

  Requires a `node` binary on the host's PATH."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io BufferedReader BufferedWriter File IOException InputStreamReader OutputStreamWriter)
   (java.lang ProcessBuilder$Redirect)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ process ----------------------------------------------

(def ^:private render-timeout-ms
  "How long to wait for a render process to answer before assuming it has wedged: we kill it and fail the
  render, so a stuck process can't hold its pool slot forever."
  (* 60 1000))

(defrecord ^:private NodeProcess [^Process process ^BufferedWriter writer ^BufferedReader reader ^File script-file])

(defn- read-response-line
  "Read one line from the process, killing it and throwing if it doesn't answer within
  [[render-timeout-ms]] (so a wedged process can't hold its pool slot forever). `destroyForcibly`
  (SIGKILL) rather than the polite `destroy`: a process wedged hard enough to miss the deadline may
  ignore SIGTERM, and killing it also closes its stdout, which unblocks the reader future."
  ^String [^BufferedReader reader ^Process process]
  (let [fut  (future (.readLine reader))
        line (deref fut render-timeout-ms ::timeout)]
    (if (identical? ::timeout line)
      (do (.destroyForcibly process)
          (future-cancel fut)
          (throw (ex-info "static-viz node render timed out" {})))
      line)))

(def ^:private script-resource-path
  "Classpath path of the node entrypoint bundle written to a temp file at each process spawn."
  "frontend_client/app/dist/app-static-viz-cli.bundle.js")

(defn- create-script-file!
  "Write the node entrypoint bundle from the classpath to a fresh temp file, to be executed immediately
  and deleted when its process is destroyed (`deleteOnExit` is only a backstop for JVM death)."
  ^File []
  (let [resource (io/resource script-resource-path)]
    (when (nil? resource)
      (throw (ex-info (str "static-viz resource not found: " script-resource-path
                           " — build it with `bun run build-static-viz`")
                      {:resource script-resource-path})))
    (let [file (.toFile (Files/createTempFile "mb-static-viz" ".js" (into-array FileAttribute [])))]
      (.deleteOnExit file)
      (with-open [in (io/input-stream resource)]
        (io/copy in file))
      file)))

(defn- start-process!
  "Write the script to a temp file, spawn `node` on it, and block until it reports it has loaded. The
  process's stderr is inherited (for debugging); stdout carries the line protocol. On any failure to
  reach a ready state the process is destroyed and the file deleted, so nothing leaks."
  ^NodeProcess []
  (common/assert-tests-not-initializing!)
  (let [script           (create-script-file!)
        ^Process process (try
                           (.. (ProcessBuilder. ^"[Ljava.lang.String;" (into-array String ["node" (.getAbsolutePath script)]))
                               (redirectError ProcessBuilder$Redirect/INHERIT)
                               (start))
                           (catch Throwable t
                             (.delete script)
                             (if (instance? IOException t)
                               (throw (ex-info (str "could not start `node` for static-viz rendering — is node"
                                                    " installed and on PATH? (otherwise set MB_STATIC_VIZ_MODE"
                                                    " to graalvm)")
                                               {} t))
                               (throw t))))]
    (try
      (let [writer (BufferedWriter. (OutputStreamWriter. (.getOutputStream process) StandardCharsets/UTF_8))
            reader (BufferedReader. (InputStreamReader. (.getInputStream process) StandardCharsets/UTF_8))
            ready  (read-response-line reader process)]
        (when-not (some-> ready json/decode+kw :ready)
          (throw (ex-info "static-viz node process failed to start" {:line ready})))
        (->NodeProcess process writer reader script))
      (catch Throwable t
        (.destroy process)
        (.delete script)
        (throw t)))))

(defn- stop-process!
  [{:keys [^Process process ^BufferedWriter writer ^BufferedReader reader ^File script-file]}]
  (try (.close writer) (catch Exception _))
  (try (.close reader) (catch Exception _))
  (try (.destroy process) (catch Exception _))
  (try (.delete script-file) (catch Exception _)))

(defn- render-on-process
  "Send one render request to `node-process` and read its response. `arg` is a Clojure data structure sent
  as a JS object (not a JSON string), so the bundle serializes only once — at this process boundary rather
  than again inside the bundle. Returns the render result parsed into Clojure data. Not thread-safe on its
  own — the pool hands a process to one render at a time. A write failure (broken pipe) means the pooled
  process had already died; it is thrown as `:retryable` so [[call-node]] can get a fresh one."
  [{:keys [^BufferedWriter writer ^BufferedReader reader ^Process process]} fn-name arg]
  (try
    (.write writer ^String (str (json/encode {:fn fn-name :arg arg}) "\n"))
    (.flush writer)
    (catch IOException e
      (throw (ex-info "static-viz node process is not writable" {:retryable true} e))))
  (let [line (read-response-line reader process)]
    (when (nil? line)
      (throw (ex-info "static-viz node process closed unexpectedly" {:retryable true})))
    (let [{:keys [ok result error]} (json/decode+kw line)]
      (if ok
        result
        ;; :render-error — the process answered the protocol correctly, so it is healthy; only this
        ;; render failed. [[call-node]] releases (rather than disposes) the process on these.
        (throw (ex-info (str "static-viz node render failed: " error) {:render-error true}))))))

;;; ------------------------------------------------ pool -------------------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key is arbitrary, it just has to be the same for every operation."
  :static-viz-node)

(def ^:private ^Pool node-process-pool
  "A pool of a single static-viz Node.js process, held exclusively per render (so renders serialize onto
  it); when idle it shrinks to 0 and the generator's `destroy` kills the process. Capped at one because a
  warm process is fast and spawning another is costly. See
  [[metabase.channel.render.js.common/create-pool]]."
  (common/create-pool start-process! stop-process! {:max-size 1}))

(defn- call-node
  "Run static-viz bundle function `fn-name` with `arg` (a Clojure data structure) on a pooled Node process,
  returning the render result parsed into Clojure data. A `:render-error` (the process answered `ok:
  false` — it is healthy, only the render failed) releases the process back for reuse, like the graal
  renderer does with its context; any other failure may have left the process in a bad state, so it is
  disposed (dropped from the pool). Retries once if the acquired process turned out to be already dead
  (e.g. reaped or killed while parked in the pool), since a fresh one should succeed."
  [fn-name arg]
  (loop [retries 1]
    (let [node-process (.acquire node-process-pool pool-key)
          outcome      (try
                         (let [result (render-on-process node-process fn-name arg)]
                           (.release node-process-pool pool-key node-process)
                           {:result result})
                         (catch Throwable t
                           (if (:render-error (ex-data t))
                             (.release node-process-pool pool-key node-process)
                             (.dispose node-process-pool pool-key node-process))
                           (if (and (:retryable (ex-data t)) (pos? retries))
                             {:retry true}
                             (throw t))))]
      (if (:retry outcome)
        (recur (dec retries))
        (:result outcome)))))

(defn renderer
  "The `:node` [[metabase.channel.render.js.protocol/StaticVizRenderer]] — runs the static-viz JS in a pool
  of external Node.js processes. Passes each `input` map to the bundle's object-in/object-out functions, so
  it is serialized once (at the process boundary) rather than JSON-encoded again inside the bundle."
  []
  (reify js.protocol/StaticVizRenderer
    (chart [_ input]
      (call-node "renderChart" input))
    (cell-background-colors [_ input]
      (call-node "getCellBackgroundColors" input))))
