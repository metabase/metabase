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

(defn- deref-with-timeout [dereffable timeout-ms]
  (let [result (deref dereffable timeout-ms ::timed-out)]
    (when (= result ::timed-out)
      (throw (ex-info (format "Timed out after %d ms." timeout-ms) {:timed-out? true})))
    result))

(def ^:private ns-per-ms 1000000)

;; How long a signalled process gets to wind itself down before the next, harsher signal.
(def ^:private kill-grace-period-ms (* 5 1000)) ; 5 seconds

;; How often we re-ask a signalled process whether it has exited yet.
(def ^:private exit-poll-interval-ms 50)

(defn- wait-for-exit
  "Wait up to `timeout-ms` for every process in `handles` to exit."
  [handles timeout-ms]
  ;; nanoTime rather than wall-clock time, so an NTP correction or a DST shift cannot move the deadline.
  (let [deadline (+ (System/nanoTime) (* timeout-ms ns-per-ms))]
    (loop []
      (when (and (some #(.isAlive ^ProcessHandle %) handles)
                 (< (System/nanoTime) deadline))
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
        {:keys [env dir timeout-ms]
         :or   {timeout-ms command-timeout-ms}} opts
        proc              (start-process! args env dir)]
    ;; Close child stdin so subprocesses that read from it see EOF immediately
    ;; instead of blocking forever on the JVM-owned pipe.
    (.close (.getOutputStream proc))
    (with-open [out-reader (BufferedReader. (InputStreamReader. (.getInputStream proc)))
                err-reader (BufferedReader. (InputStreamReader. (.getErrorStream proc)))]
      (let [exit-code (future (.waitFor proc))
            out       (future (read-lines out-reader opts))
            err       (future (read-lines err-reader opts))]
        (try
          {:exit (deref-with-timeout exit-code timeout-ms)
           :out  (deref-with-timeout out timeout-ms)
           :err  (deref-with-timeout err timeout-ms)}
          (catch clojure.lang.ExceptionInfo e
            (when (:timed-out? (ex-data e))
              (kill-process! proc))
            (throw e)))))))

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
