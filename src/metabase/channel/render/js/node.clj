(ns metabase.channel.render.js.node
  "The `:node` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS in a pool
  of external Node.js child processes rather than in-process on GraalVM. Each process runs the
  self-contained node entrypoint (`app-static-viz-cli.bundle.js`, built by `rspack.static-viz.config.js`),
  which answers newline-delimited JSON render requests over stdin/stdout.

  Metabase never writes the script itself: [[metabase.channel.settings/static-viz-node-script-path]] must
  point at it on disk, provisioned at deploy time — the official Docker images copy it out of the
  frontend build (owned by root, so the Metabase process cannot modify what `node` executes) and set
  `MB_STATIC_VIZ_NODE_SCRIPT_PATH`. If the setting is unset or the file is missing, rendering fails
  rather than falling back to a runtime copy.

  The pool holds a single process, held exclusively per render (so renders serialize onto it); with a min
  of 0 it shrinks to 0 when idle, killing the process after 1 minute with no work. We cap it at one
  process — spawning a fresh `node` (runtime init + bundle load) is costly, and a warm process renders
  fast enough that queuing a second render behind it beats paying that startup cost for concurrency.

  Requires a `node` binary on the host's PATH."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.channel.settings :as channel.settings]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io BufferedReader BufferedWriter IOException InputStreamReader OutputStreamWriter)
   (java.lang ProcessBuilder$Redirect)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ process ----------------------------------------------

(def ^:private render-timeout-ms
  "How long to wait for a render process to answer before assuming it has wedged: we kill it and fail the
  render, so a stuck process can't hold its pool slot forever."
  (* 60 1000))

(defrecord ^:private NodeProcess [^Process process ^BufferedWriter writer ^BufferedReader reader])

(defn- read-response-line
  "Read one line from the process, killing it and throwing if it doesn't answer within
  [[render-timeout-ms]] (so a wedged process can't hold its pool slot forever). Killing the process closes
  its stdout, which unblocks the reader future."
  ^String [^BufferedReader reader ^Process process]
  (let [fut  (future (.readLine reader))
        line (deref fut render-timeout-ms ::timeout)]
    (if (identical? ::timeout line)
      (do (.destroy process)
          (future-cancel fut)
          (throw (ex-info "static-viz node render timed out" {})))
      line)))

(defn- script-path
  "Path of the static-viz node entrypoint, from
  [[metabase.channel.settings/static-viz-node-script-path]]. Throws if the setting is unset or the file
  does not exist: the script is provisioned at deploy time (e.g. copied into the Docker image, owned by
  root), so a missing file is a deployment error — deliberately not fixed by copying it out of the jar at
  runtime, which would put the executed JS somewhere the Metabase process can write."
  ^String []
  (let [path (channel.settings/static-viz-node-script-path)]
    (when (str/blank? path)
      (throw (ex-info (str "MB_STATIC_VIZ_MODE is `node` but MB_STATIC_VIZ_NODE_SCRIPT_PATH is not set —"
                           " point it at app-static-viz-cli.bundle.js (built by `bun run build-static-viz`),"
                           " or set MB_STATIC_VIZ_MODE to graalvm")
                      {})))
    (when-not (.isFile (io/file path))
      (throw (ex-info (str "static-viz node script not found: " path) {:path path})))
    path))

(defn- start-process!
  "Spawn `node app-static-viz-cli.bundle.js` (from [[script-path]]) and block until it reports it has
  loaded. The process's stderr is inherited (for debugging); stdout carries the line protocol."
  ^NodeProcess []
  (common/assert-tests-not-initializing!)
  (let [script           (script-path)
        ^Process process (try
                           (.. (ProcessBuilder. ^"[Ljava.lang.String;" (into-array String ["node" script]))
                               (redirectError ProcessBuilder$Redirect/INHERIT)
                               (start))
                           (catch IOException e
                             (throw (ex-info (str "could not start `node` for static-viz rendering — is node installed"
                                                  " and on PATH? (otherwise set MB_STATIC_VIZ_MODE to graalvm)")
                                             {} e))))
        writer           (BufferedWriter. (OutputStreamWriter. (.getOutputStream process) StandardCharsets/UTF_8))
        reader           (BufferedReader. (InputStreamReader. (.getInputStream process) StandardCharsets/UTF_8))
        ready            (read-response-line reader process)]
    (when-not (some-> ready json/decode+kw :ready)
      (.destroy process)
      (throw (ex-info "static-viz node process failed to start" {:line ready})))
    (->NodeProcess process writer reader)))

(defn- stop-process!
  [{:keys [^Process process ^BufferedWriter writer ^BufferedReader reader]}]
  (try (.close writer) (catch Exception _))
  (try (.close reader) (catch Exception _))
  (try (.destroy process) (catch Exception _)))

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
        (throw (ex-info (str "static-viz node render failed: " error) {}))))))

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
  returning the render result parsed into Clojure data. A failed render's process may be in a bad state, so
  it is disposed (dropped from the pool) rather than released back for reuse. Retries once if the acquired
  process turned out to be already dead (e.g. reaped or killed while parked in the pool), since a fresh one
  should succeed."
  [fn-name arg]
  (loop [retries 1]
    (let [node-process (.acquire node-process-pool pool-key)
          outcome      (try
                         (let [result (render-on-process node-process fn-name arg)]
                           (.release node-process-pool pool-key node-process)
                           {:result result})
                         (catch Throwable t
                           (.dispose node-process-pool pool-key node-process)
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
