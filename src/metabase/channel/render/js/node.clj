(ns metabase.channel.render.js.node
  "The `:node` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS in a pool
  of external Node.js child processes rather than in-process on GraalVM. Each process runs the CLI harness
  (`resources/app-static-viz-cli.js`), which loads the static-viz bundle and answers newline-delimited
  JSON render requests over stdin/stdout.

  The bundle and the CLI are copied out of the classpath into a temp working directory on first use (both
  may live inside the jar at runtime, and `node` needs real files on disk). The pool holds up to two
  processes, each held exclusively per render (so at most two renders run at once); with a min of 0 it
  shrinks to 0 when idle, killing the processes after 1 minute with no work.

  Requires a `node` binary on the host's PATH."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.common :as common]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io BufferedReader BufferedWriter IOException InputStreamReader OutputStreamWriter)
   (java.lang ProcessBuilder$Redirect)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def ^:private cli-resource-path "app-static-viz-cli.js")

(def ^:private render-timeout-ms
  "How long to wait for a render process to answer before assuming it has wedged: we kill it and fail the
  render, so a stuck process can't hold its pool slot forever."
  (* 60 1000))

(defn- create-working-dir!
  "Copy the two files the render process needs — the static-viz bundle and the CLI entry point — out of the
  classpath into a fresh temp directory, cleaned up on JVM exit."
  ^java.io.File []
  (let [dir (.toFile (Files/createTempDirectory "mb-static-viz-node" (into-array FileAttribute [])))]
    (.deleteOnExit dir)
    (doseq [[resource filename] [[common/bundle-resource-path "lib-static-viz.bundle.js"]
                                 [cli-resource-path "app-static-viz-cli.js"]]]
      (let [resource-url (io/resource resource)]
        (when (nil? resource-url)
          (throw (ex-info (str "static-viz resource not found: " resource) {:resource resource})))
        (let [target (io/file dir filename)]
          (with-open [in (io/input-stream resource-url)]
            (io/copy in target))
          (.deleteOnExit target))))
    dir))

(def ^:private working-dir*
  "Caches the working directory once created. An atom (not a `delay`) so a failed first attempt isn't
  cached — a transient copy failure, or a not-yet-built bundle in dev, self-heals on the next render."
  (atom nil))

(defn- working-dir
  "The temp dir holding the bundle + CLI, created (copied out of the classpath) on first use."
  ^java.io.File []
  (or @working-dir*
      (locking working-dir*
        (or @working-dir*
            (reset! working-dir* (create-working-dir!))))))

;;; ------------------------------------------------ process ----------------------------------------------

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

(defn- start-process!
  "Copy the files (first use only), spawn `node app-static-viz-cli.js`, and block until it reports it has
  loaded the bundle. The process's stderr is inherited (for debugging); stdout carries the line protocol."
  ^NodeProcess []
  (common/assert-tests-not-initializing!)
  (let [cli     (.getAbsolutePath (io/file (working-dir) "app-static-viz-cli.js"))
        process (try
                  (.. (ProcessBuilder. (into-array String ["node" cli]))
                      (redirectError ProcessBuilder$Redirect/INHERIT)
                      (start))
                  (catch IOException e
                    (throw (ex-info (str "could not start `node` for static-viz rendering — is node installed"
                                         " and on PATH? (otherwise set static-viz-mode to graalvm)")
                                    {} e))))
        writer  (BufferedWriter. (OutputStreamWriter. (.getOutputStream process) StandardCharsets/UTF_8))
        reader  (BufferedReader. (InputStreamReader. (.getInputStream process) StandardCharsets/UTF_8))
        ready   (read-response-line reader process)]
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
  "A pool of up to two static-viz Node.js processes, each held exclusively per render; when idle it shrinks
  to 0 and the generator's `destroy` kills the process. See
  [[metabase.channel.render.js.common/make-pool]]."
  (common/make-pool start-process! stop-process!))

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
