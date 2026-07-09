(ns metabase.channel.render.js.node
  "The `:node` [[metabase.channel.render.js.protocol/StaticVizRenderer]]: runs the static-viz JS in a pool
  of external Node.js child processes rather than in-process on GraalVM. Each process runs the CLI harness
  (`resources/app-static-viz-cli.js`), which loads the static-viz bundle and answers newline-delimited
  JSON render requests over stdin/stdout.

  The bundle and the CLI are copied out of the classpath into a temp working directory on first use (both
  may live inside the jar at runtime, and `node` needs real files on disk). The pool holds up to two
  processes, each held exclusively per render (so at most two renders run at once); with a min of 0 it
  shrinks to 0 when idle, killing the processes after ~10 minutes with no work.

  Requires a `node` binary on the host's PATH."
  (:require
   [clojure.java.io :as io]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.config.core :as config]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste IPool$Generator Pool Pools)
   (java.io BufferedReader BufferedWriter InputStreamReader OutputStreamWriter)
   (java.lang ProcessBuilder$Redirect)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private bundle-resource-path "frontend_client/app/dist/lib-static-viz.bundle.js")
(def ^:private cli-resource-path "app-static-viz-cli.js")

(defn- assert-tests-not-initializing!
  "Guard against spawning a render process (and loading the bundle) as a side effect of loading
  namespaces during test-runner startup, when the bundle might not have been built yet."
  []
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))

(def ^:private working-dir
  "Temp directory holding the two files the render process needs — the static-viz bundle and the CLI entry
  point — copied out of the classpath. Done once, on first use, and cleaned up on JVM exit."
  (delay
    (let [dir (.toFile (Files/createTempDirectory "mb-static-viz-node" (into-array FileAttribute [])))]
      (.deleteOnExit dir)
      (doseq [[resource filename] [[bundle-resource-path "lib-static-viz.bundle.js"]
                                   [cli-resource-path "app-static-viz-cli.js"]]]
        (let [resource-url (io/resource resource)]
          (when (nil? resource-url)
            (throw (ex-info (str "static-viz resource not found: " resource) {:resource resource})))
          (let [target (io/file dir filename)]
            (with-open [in (io/input-stream resource-url)]
              (io/copy in target))
            (.deleteOnExit target))))
      dir)))

;;; ------------------------------------------------ process ----------------------------------------------

(defrecord ^:private NodeProcess [^Process process ^BufferedWriter writer ^BufferedReader reader])

(defn- start-process!
  "Copy the files (first use only), spawn `node app-static-viz-cli.js`, and block until it reports it has
  loaded the bundle. The process's stderr is inherited (for debugging); stdout carries the line protocol."
  ^NodeProcess []
  (assert-tests-not-initializing!)
  (let [cli     (.getAbsolutePath (io/file ^java.io.File @working-dir "app-static-viz-cli.js"))
        process (.. (ProcessBuilder. (into-array String ["node" cli]))
                    (redirectError ProcessBuilder$Redirect/INHERIT)
                    (start))
        writer  (BufferedWriter. (OutputStreamWriter. (.getOutputStream process) StandardCharsets/UTF_8))
        reader  (BufferedReader. (InputStreamReader. (.getInputStream process) StandardCharsets/UTF_8))]
    (let [ready (.readLine reader)]
      (when-not (some-> ready json/decode+kw :ready)
        (.destroy process)
        (throw (ex-info "static-viz node process failed to start" {:line ready}))))
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
  own — the pool hands a process to one render at a time."
  [{:keys [^BufferedWriter writer ^BufferedReader reader]} fn-name arg]
  (.write writer ^String (str (json/encode {:fn fn-name :arg arg}) "\n"))
  (.flush writer)
  (let [line (.readLine reader)]
    (when (nil? line)
      (throw (ex-info "static-viz node process closed unexpectedly" {})))
    (let [{:keys [ok result error]} (json/decode+kw line)]
      (if ok
        result
        (throw (ex-info (str "static-viz node render failed: " error) {}))))))

;;; ------------------------------------------------ pool -------------------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key is arbitrary, it just has to be the same for every operation."
  :static-viz-node)

(def ^:private ^Pool node-process-pool
  "A pool of up to two static-viz Node.js processes, each held exclusively per render. The utilization
  controller targets 100% utilization with a max of 2 and a min of 0, so when nothing is rendering it
  shrinks to 0 and the generator's `destroy` kills the process. It rechecks every 10 minutes, so an idle
  process lingers up to ~10 minutes before being reaped (keeping it warm through gaps between renders)."
  (let [max-pool-size       2
        max-queued-acquires 65000
        sample-period-ms    (.toMillis TimeUnit/MILLISECONDS 25)
        control-period-ms   (.toMillis TimeUnit/MINUTES 10)]
    (Pool. (reify IPool$Generator
             (generate [_ _]
               (start-process!))
             (destroy [_ _ node-process]
               (stop-process! node-process)))
           (Pools/utilizationController 1.0 max-pool-size max-pool-size)
           max-queued-acquires
           sample-period-ms
           control-period-ms
           TimeUnit/MILLISECONDS)))

(defn- call-node
  "Run static-viz bundle function `fn-name` with `arg` (a Clojure data structure) on a pooled Node process,
  returning the render result parsed into Clojure data."
  [fn-name arg]
  (let [node-process (.acquire node-process-pool pool-key)]
    (try
      (let [result (render-on-process node-process fn-name arg)]
        (.release node-process-pool pool-key node-process)
        result)
      (catch Throwable t
        ;; A failed render may have left the process in a bad state; drop it from the pool rather than
        ;; returning it for reuse.
        (.dispose node-process-pool pool-key node-process)
        (throw t)))))

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
