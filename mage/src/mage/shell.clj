(ns mage.shell
  (:require
   [clojure.string :as str]
   [mage.util :as u])
  (:import
   (java.io BufferedReader File InputStreamReader)
   (java.lang ProcessHandle)))

(set! *warn-on-reflection* true)

(defn- start-process!
  "Start the command `args` as a subprocess. `dir` is its working directory. `env`, when given, replaces the
  parent environment rather than adding to it."
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

;; How long the readers get to drain the pipes once the command itself has exited, over and above whatever
;; is left of its budget.
(def ^:private drain-floor-ms (* 2 1000)) ; 2 seconds

(def ^:private drain-failed-message
  ;; Loud, because half a command's output returned as if it were all of it is worse than a failure.
  "Command exited, but something it left running is holding its output pipe open.")

(defn- deadline-in
  "A `nanoTime` instant `timeout-ms` from now, to measure against with [[remaining-ms]].
  Wall-clock time is no good for this: an NTP correction or a DST shift would move the deadline."
  [timeout-ms]
  (+ (System/nanoTime) (* timeout-ms ns-per-ms)))

(defn- remaining-ms
  "How many milliseconds are left before `deadline`, or 0 once it has passed."
  [deadline]
  (max 0 (quot (- deadline (System/nanoTime)) ns-per-ms)))

(defn- deref-by-deadline
  "Deref `dereffable`, throwing an ex-info carrying `message` if `deadline` passes first."
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
  "Wait up to `timeout-ms` for every process in `handles` to exit."
  [handles timeout-ms]
  (let [deadline (deadline-in timeout-ms)]
    (loop []
      (when (and (some #(.isAlive ^ProcessHandle %) handles)
                 (pos? (remaining-ms deadline)))
        (Thread/sleep exit-poll-interval-ms)
        (recur)))))

(defn- kill-process!
  "Stop `proc` and every process it started, so a timed-out command cannot keep running behind the caller.
  The descendants are listed before anything is signalled, and each survivor is force-killed on its own,
  so a child that ignores the first signal dies even after its parent has gone.
  A child that had already outlived its parent is not reachable from the root handle."
  [^Process proc]
  (let [root    (.toHandle proc)
        handles (cons root (iterator-seq (.iterator (.descendants root))))]
    (run! #(.destroy ^ProcessHandle %) handles)
    (wait-for-exit handles kill-grace-period-ms)
    (run! (fn [^ProcessHandle handle]
            (when (.isAlive handle)
              (.destroyForcibly handle)))
          handles)
    (wait-for-exit handles kill-grace-period-ms)))

(def ^:private command-timeout-ms (* 15 60 1000)) ; 15 minutes

(defn sh*
  "Run a shell command. Like [[clojure.java.shell/sh]], but prints output to stdout/stderr and returns a map with keys
  `:exit`, `:out`, and `:err` (`:out` and `:err` are vectors of lines). Does not throw Exception if process exits with
  non-zero status code.

  Options:

  * `env` -- environment variables (as a map) to use when running `cmd`. If `:env` is `nil`, the default parent
    environment (i.e., the environment in which this Clojure code itself is ran) will be used; if `:env` IS passed, it
    completely replaces the parent environment in which this script is ran -- make sure you pass anything that might be
    needed such as `JAVA_HOME` and `PATH` if you do this

  * `dir` -- current directory to use when running the shell command. If not specified, command is run in the repo
    root directory.

  * `quiet?` -- whether to suppress output from this shell command.

  * `timeout-ms` -- how long to wait for the command before killing it and throwing; defaults to 15 minutes.

  * If you set MAGE_VERBOSE env var to true , the command will be printed before running it."
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
        ;; `or`, not `:or`: a caller computing the timeout from an env var or an option map can hand us an
        ;; explicit nil, which `:or` passes straight through.
        timeout-ms        (or (:timeout-ms opts) command-timeout-ms)
        proc              (start-process! args env dir)]
    ;; Close child stdin so subprocesses that read from it see EOF immediately
    ;; instead of blocking forever on the JVM-owned pipe.
    (.close (.getOutputStream proc))
    (let [out-stream (.getInputStream proc)
          err-stream (.getErrorStream proc)
          out-reader (BufferedReader. (InputStreamReader. out-stream))
          err-reader (BufferedReader. (InputStreamReader. err-stream))
          ;; One deadline covers the whole command: `timeout-ms` is its total budget, not a budget per wait.
          deadline   (deadline-in timeout-ms)
          exit-code  (future (.waitFor proc))
          out        (future (read-lines out-reader opts))
          err        (future (read-lines err-reader opts))]
      (try
        (let [exit  (deref-by-deadline exit-code deadline (format "Timed out after %d ms." timeout-ms))
              ;; The command has exited, so everything it wrote is already in the pipe -- but `deadline`
              ;; may have just run out, and a pipe holds a bounded amount, so the readers can still have
              ;; work to do. Without a floor here a command that finished a millisecond inside its budget
              ;; would have its output thrown away and be reported as a timeout.
              drain (max deadline (deadline-in drain-floor-ms))]
          {:exit exit
           :out  (deref-by-deadline out drain drain-failed-message)
           :err  (deref-by-deadline err drain drain-failed-message)})
        ;; A timeout is not the only way out of here. A reader future can fail on the pipe, and the calling
        ;; thread can be interrupted; either way the command keeps running unless we stop it. Whether the
        ;; process is still alive is the question that matters, not which exception got us here.
        (catch Throwable e
          (when (.isAlive proc)
            (kill-process! proc))
          (throw e))
        (finally
          ;; Close the pipes rather than the readers. `BufferedReader.close` takes the same lock `readLine`
          ;; holds while blocked, so it waits for EOF -- and a process the command orphaned onto our stdout
          ;; can withhold EOF for as long as it lives. Closing the stream underneath ends the read at once.
          (close-quietly out-stream)
          (close-quietly err-stream))))))

(defn sh
  "Like [[sh*]], but throws an Exception if the command exits with a non-zero status. Options are the same as `sh*` --
  see its documentation for more information.

  Returns sequence of output lines."
  {:arglists '([cmd & args] [{:keys [env dir quiet? timeout-ms]} cmd & args])}
  [& args]
  (let [{:keys [exit out err], :as response} (apply sh* args)]
    (if (zero? exit)
      (concat out err)
      (throw (ex-info (str "Error running command: " (str/join "\n" (concat out err)))
                      (assoc response :cmd args))))))
