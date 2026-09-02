(ns mage.shell
  (:require
   [clojure.string :as str]
   [mage.util :as u])
  (:import
   (java.io BufferedReader File InputStreamReader)
   (java.lang ProcessHandle)))

(set! *warn-on-reflection* true)

(defn- start-process!
  "Starts `args` as a subprocess, using `dir` as its working directory when provided.
  When non-nil, `env` must be a map and completely replaces the parent environment."
  ^Process [args env dir]
  (let [builder (ProcessBuilder. ^java.util.List (mapv str args))]
    (when dir
      (.directory builder (File. ^String dir)))
    (when env
      (assert (map? env))
      (doto (.environment builder)
        (.clear)
        (.putAll (into {} (map (fn [[k v]] [(name k) (str v)])) env))))
    (.start builder)))

(defn- read-lines [^BufferedReader reader {:keys [quiet?]}]
  (loop [lines []]
    (if-let [line (.readLine reader)]
      (do
        (when-not quiet?
          (println line))
        (recur (conj lines line)))
      lines)))

(def ^:private ns-per-ms 1000000)

;; How long a signalled process gets to wind itself down before the next, harsher signal.
(def ^:private kill-grace-period-ms (* 5 1000)) ; 5 seconds

;; How often we re-ask a signalled process whether it has exited yet.
(def ^:private exit-poll-interval-ms 50)

;; After a command exits, its output readers receive at least this much time to finish.
(def ^:private drain-floor-ms (* 2 1000)) ; 2 seconds

(def ^:private drain-failed-message
  ;; Returning partial output as complete would hide data loss, so this is an error.
  "Command exited, but something it left running is holding its output pipe open.")

(defn- deadline-in
  "Returns the `System/nanoTime` deadline `timeout-ms` milliseconds from now."
  [timeout-ms]
  ;; A monotonic reading, so an NTP correction or a DST shift cannot move the deadline.
  (+ (System/nanoTime) (* timeout-ms ns-per-ms)))

(defn- remaining-ms
  "Returns the milliseconds left before `deadline`, or zero once it has passed."
  [deadline]
  (max 0 (quot (- deadline (System/nanoTime)) ns-per-ms)))

(defn- deref-by-deadline
  "Returns the value of `dereffable` if it becomes available by `deadline`.
  Throws `ExceptionInfo` with `message` and `:timed-out? true` if the deadline passes first."
  [dereffable deadline message]
  (let [result (deref dereffable (remaining-ms deadline) ::timed-out)]
    (when (= result ::timed-out)
      (throw (ex-info message {:timed-out? true})))
    result))

(defn- close-quietly [^java.io.Closeable closeable]
  (try
    (.close closeable)
    (catch java.io.IOException _ nil)))

(defn- wait-for-exit
  "Waits until every process in `handles` exits or `timeout-ms` elapses."
  [handles timeout-ms]
  (let [deadline (deadline-in timeout-ms)]
    (loop []
      (when (and (some #(.isAlive ^ProcessHandle %) handles)
                 (pos? (remaining-ms deadline)))
        (Thread/sleep exit-poll-interval-ms)
        (recur)))))

(defn- kill-process!
  "Attempts to stop `proc` and every descendant reachable from it when this function begins.
  Returns after every captured process exits or after two grace periods.
  A process that has already outlived its parent is unreachable and cannot be stopped."
  [^Process proc]
  (let [root    (.toHandle proc)
        ;; Capture descendants before signalling the root, which can make them unreachable when it exits.
        handles (cons root (iterator-seq (.iterator (.descendants root))))]
    (run! #(.destroy ^ProcessHandle %) handles)
    (wait-for-exit handles kill-grace-period-ms)
    ;; Signal every survivor directly because its parent may already have exited.
    (run! (fn [^ProcessHandle handle]
            (when (.isAlive handle)
              (.destroyForcibly handle)))
          handles)
    (wait-for-exit handles kill-grace-period-ms)))

(def ^:private command-timeout-ms (* 15 60 1000)) ; 15 minutes

(defn sh*
  "Runs a command and returns a map with `:exit`, `:out`, and `:err`; output values are vectors of lines.
  Unlike [[clojure.java.shell/sh]], prints output as it arrives and does not throw for a nonzero exit status.

  Options:

  * `:env` replaces the parent environment when it is a map; `nil` uses the parent environment.
    Include variables such as `JAVA_HOME` and `PATH` when replacing the environment.

  * `:dir` sets the working directory and defaults to the repository root.

  * `:quiet?` suppresses output while the command runs.

  * `:timeout-ms` is the total budget for the command to exit and for stdout and stderr to be collected.
    It defaults to 15 minutes.
    On timeout, kills the command and its reachable descendants and throws `ExceptionInfo`.
    After the command exits, allows at least two seconds to finish collecting its output.
    Throws rather than return partial output if another process keeps an output pipe open.

  When `MAGE_VERBOSE` is present in the environment, prints the command before running it."
  {:arglists '([cmd & args] [{:keys [env dir quiet? timeout-ms]} cmd & args])}
  [& args]
  (when (u/env "MAGE_VERBOSE" (constantly nil))
    (println (str "$ " (str/join " " (map (comp pr-str str) (if (map? (first args))
                                                              (rest args)
                                                              args))))))
  (let [[opts & args]     (if (map? (first args))
                            args
                            (cons nil args))
        opts              (merge
                           {:dir u/project-root-directory}
                           opts)
        {:keys [env dir]}  opts
        ;; `or` rather than `:or`, which fills in a default only when the key is absent. A caller that
        ;; computes the timeout and comes up with nil would otherwise get nil.
        timeout-ms        (or (:timeout-ms opts) command-timeout-ms)
        proc              (start-process! args env dir)]
    ;; Closing child stdin tells subprocesses that no input is coming, so they do not wait forever.
    (.close (.getOutputStream proc))
    (let [out-stream (.getInputStream proc)
          err-stream (.getErrorStream proc)
          out-reader (BufferedReader. (InputStreamReader. out-stream))
          err-reader (BufferedReader. (InputStreamReader. err-stream))
          ;; The command exit and both output reads share one deadline.
          deadline   (deadline-in timeout-ms)
          exit-code  (future (.waitFor proc))
          out        (future (read-lines out-reader opts))
          err        (future (read-lines err-reader opts))]
      (try
        (let [exit  (deref-by-deadline exit-code deadline (format "Timed out after %d ms." timeout-ms))
              ;; A process can exit near its deadline while readers still have buffered output to consume.
              ;; Give them a small minimum window so a successful command is not mistaken for a timeout.
              drain (max deadline (deadline-in drain-floor-ms))]
          {:exit exit
           :out  (deref-by-deadline out drain drain-failed-message)
           :err  (deref-by-deadline err drain drain-failed-message)})
        ;; Any exception can leave the command running, including a reader failure or thread interruption.
        ;; Stop it whenever it is still alive, regardless of which exception reached us.
        (catch Throwable e
          (when (.isAlive proc)
            (kill-process! proc))
          (throw e))
        (finally
          ;; Close the pipes rather than the readers. `BufferedReader.close` waits on the same lock a
          ;; blocked `readLine` holds, so it cannot return until EOF -- and a process the command left
          ;; holding our stdout can withhold EOF for as long as it lives. Closing the stream underneath
          ;; ends the read at once.
          (close-quietly out-stream)
          (close-quietly err-stream))))))

(defn sh
  "Runs [[sh*]] and returns its stdout lines followed by its stderr lines.
  Throws `ExceptionInfo` containing the response and command arguments when the exit status is nonzero.
  Accepts the same options as [[sh*]]."
  {:arglists '([cmd & args] [{:keys [env dir quiet? timeout-ms]} cmd & args])}
  [& args]
  (let [{:keys [exit out err], :as response} (apply sh* args)]
    (if (zero? exit)
      (concat out err)
      (throw (ex-info (str "Error running command: " (str/join "\n" (concat out err)))
                      (assoc response :cmd args))))))
