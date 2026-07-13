(ns metabase.sql-parsing.python
  "The `:python` [[metabase.sql-parsing.protocol/SqlParser]]: runs sqlglot in a pool of external native
  CPython child processes rather than in-process on GraalPy. Each process runs `sql_tools_cli.py`, which
  answers newline-delimited JSON requests over stdin/stdout.

  The Python sources come straight out of the classpath: in dev the child imports directly from
  `resources/python-sources`; from the jar they are written to a fresh temp zip at every process spawn
  (CPython imports from zips via zipimport), put on the child's PYTHONPATH, and deleted when the process
  is destroyed — so there is no long-lived on-disk copy to drift out of sync or be tampered with, and no
  deploy-time provisioning.

  The pool holds a single process, held exclusively per call (so calls serialize onto it); with a min of
  0 it shrinks to 0 when idle, killing the process after 10 minutes with no work. We cap it at one
  process — spawning a fresh `python3` (interpreter init + sqlglot import) is costly, and a warm process
  parses fast enough that queuing a second call behind it beats paying that startup cost for
  concurrency.

  Requires a `python3` binary on the host's PATH."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.sql-parsing.common :as common]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json])
  (:import
   (io.aleph.dirigiste Pool)
   (java.io BufferedReader BufferedWriter File IOException InputStreamReader OutputStreamWriter)
   (java.lang ProcessBuilder$Redirect)
   (java.nio.charset StandardCharsets)
   (java.nio.file FileVisitOption Files LinkOption)
   (java.nio.file.attribute FileAttribute)
   (java.util.concurrent TimeoutException)
   (java.util.zip ZipEntry ZipOutputStream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ process ----------------------------------------------

(def ^:private ^:const call-timeout-ms
  "How long to wait for the process to answer before assuming it has wedged: we kill it and fail the
  call, so a stuck process can't hold its pool slot forever."
  30000)

(defrecord ^:private PythonProcess [^Process process ^BufferedWriter writer ^BufferedReader reader ^File sources-zip])

(defn- read-response-line
  "Read one line from the process, killing it and throwing if it doesn't answer within
  [[call-timeout-ms]] (so a wedged process can't hold its pool slot forever). `destroyForcibly`
  (SIGKILL) rather than the polite `destroy`: a process wedged hard enough to miss the deadline may
  ignore SIGTERM, and killing it also closes its stdout, which unblocks the reader future."
  ^String [^BufferedReader reader ^Process process]
  (let [fut  (future (.readLine reader))
        line (deref fut call-timeout-ms ::timeout)]
    (if (identical? ::timeout line)
      (do (.destroyForcibly process)
          (future-cancel fut)
          (throw (TimeoutException. (str "Python execution timed out after " call-timeout-ms "ms"))))
      line)))

(defn- create-sources-zip!
  "Write the python-sources tree from the jar to a fresh temp zip, importable by the child via zipimport,
  to be put on its PYTHONPATH and deleted when its process is destroyed (`deleteOnExit` is only a
  backstop for JVM death)."
  ^File []
  (let [file (.toFile (Files/createTempFile "mb-sql-tools" ".zip" (into-array FileAttribute [])))]
    (.deleteOnExit file)
    (try
      (with-open [jar-fs (u.files/nio-fs (u.files/get-jar-path))
                  zos    (ZipOutputStream. (io/output-stream file))]
        (let [root (.getPath jar-fs (str "/" common/python-sources-resource) (into-array String []))]
          (with-open [paths (Files/walk root (into-array FileVisitOption []))]
            (doseq [^java.nio.file.Path path (iterator-seq (.iterator paths))
                    :when (and (not (Files/isDirectory path (into-array LinkOption [])))
                               (not (str/includes? (str path) "__pycache__")))]
              (.putNextEntry zos (ZipEntry. (str (.relativize root path))))
              (Files/copy path zos)
              (.closeEntry zos)))))
      file
      (catch Throwable t
        (.delete file)
        (throw t)))))

(defn- python-path
  "The PYTHONPATH entry for a new child process, plus the temp zip to delete with it (nil in dev, where
  the child imports straight from `resources/python-sources`)."
  []
  (if (common/jar-resource? common/python-sources-resource)
    (let [zip (create-sources-zip!)]
      {:path (.getAbsolutePath zip) :sources-zip zip})
    (do
      (common/ensure-sqlglot-installed!)
      {:path common/dev-python-sources-dir :sources-zip nil})))

(defn- start-process!
  "Spawn `python3 -m sql_tools_cli` with the Python sources on PYTHONPATH and block until it reports it
  has loaded. The process's stderr is inherited (for debugging); stdout carries the line protocol. On
  any failure to reach a ready state the process is destroyed and the temp zip deleted, so nothing
  leaks."
  ^PythonProcess []
  (let [{:keys [path ^File sources-zip]} (python-path)
        ^Process process (try
                           (let [builder (.. (ProcessBuilder. ^"[Ljava.lang.String;" (into-array String ["python3" "-m" "sql_tools_cli"]))
                                             (redirectError ProcessBuilder$Redirect/INHERIT))]
                             (doto (.environment builder)
                               (.put "PYTHONPATH" path)
                               (.put "PYTHONUNBUFFERED" "1"))
                             (.start builder))
                           (catch Throwable t
                             (some-> sources-zip .delete)
                             (if (instance? IOException t)
                               (throw (ex-info (str "could not start `python3` for SQL parsing — is python3"
                                                    " installed and on PATH? (otherwise set MB_SQL_PARSING_MODE"
                                                    " to graalvm)")
                                               {} t))
                               (throw t))))]
    (try
      (let [writer (BufferedWriter. (OutputStreamWriter. (.getOutputStream process) StandardCharsets/UTF_8))
            reader (BufferedReader. (InputStreamReader. (.getInputStream process) StandardCharsets/UTF_8))
            ready  (read-response-line reader process)]
        (when-not (some-> ready json/decode+kw :ready)
          (throw (ex-info "sql-parsing python process failed to start" {:line ready})))
        (->PythonProcess process writer reader sources-zip))
      (catch Throwable t
        (.destroy process)
        (some-> sources-zip .delete)
        (throw t)))))

(defn- stop-process!
  [{:keys [^Process process ^BufferedWriter writer ^BufferedReader reader ^File sources-zip]}]
  (try (.close writer) (catch Exception _))
  (try (.close reader) (catch Exception _))
  (try (.destroy process) (catch Exception _))
  (some-> sources-zip .delete))

(defn- call-on-process
  "Send one request to `python-process` and read its response. Returns the `sql_tools` function's result
  string. Not thread-safe on its own — the pool hands a process to one call at a time. A write failure
  (broken pipe) means the pooled process had already died; it is thrown as `:retryable` so [[call-python]]
  can get a fresh one."
  ^String [{:keys [^BufferedWriter writer ^BufferedReader reader ^Process process]} fn-name args]
  (try
    (.write writer ^String (str (json/encode {:fn fn-name :args args}) "\n"))
    (.flush writer)
    (catch IOException e
      (throw (ex-info "sql-parsing python process is not writable" {:retryable true} e))))
  (let [line (read-response-line reader process)]
    (when (nil? line)
      (throw (ex-info "sql-parsing python process closed unexpectedly" {:retryable true})))
    (let [{:keys [ok result error]} (json/decode+kw line)]
      (if ok
        result
        ;; The process answered the protocol correctly, so it is healthy; only this call failed.
        ;; [[call-python]] releases (rather than disposes) the process on these.
        (throw (common/call-failed-ex error))))))

;;; ------------------------------------------------ pool -------------------------------------------------

(def ^:private pool-key
  "Dirigiste pools are keyed; the key is arbitrary, it just has to be the same for every operation."
  :sql-parsing-python)

(def ^:private ^Pool python-process-pool
  "A pool of a single sql-parsing CPython process, held exclusively per call (so calls serialize onto
  it); when idle it shrinks to 0 and the generator's `destroy` kills the process. Capped at one because
  a warm process is fast and spawning another is costly. See
  [[metabase.sql-parsing.common/create-pool]]."
  (common/create-pool start-process! stop-process! {:max-size 1, :idle-minutes 10}))

(defn- call-python
  "Execute `sql_tools.<fn-name>` with `args` on a pooled CPython process and return the result as a
  string. A Python-side failure (the process answered `ok: false` — it is healthy, only the call
  failed, thrown as the transport-agnostic [[metabase.sql-parsing.common/call-failed-ex]]) releases the
  process back for reuse, like the graal parser does with its context; any other failure may have left
  the process in a bad state, so it is disposed (dropped from the pool). Retries once if the acquired
  process turned out to be already dead (e.g. reaped or killed while parked in the pool), since a fresh
  one should succeed."
  ^String [fn-name & args]
  (loop [retries 1]
    (let [python-process (.acquire python-process-pool pool-key)
          outcome        (try
                           (let [result (call-on-process python-process fn-name args)]
                             (.release python-process-pool pool-key python-process)
                             {:result result})
                           (catch Throwable t
                             (if (:sql-parsing/error (ex-data t))
                               (.release python-process-pool pool-key python-process)
                               (.dispose python-process-pool pool-key python-process))
                             (if (and (:retryable (ex-data t)) (pos? retries))
                               {:retry true}
                               (throw t))))]
      (if (:retry outcome)
        (recur (dec retries))
        (:result outcome)))))

(defn parser
  "The `:python` [[metabase.sql-parsing.protocol/SqlParser]] — runs sqlglot in a pool of external native
  CPython processes."
  []
  (common/make-parser call-python))
