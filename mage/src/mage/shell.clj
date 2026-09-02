(ns mage.shell
  (:require
   [clojure.string :as str]
   [mage.util :as u])
  (:import
   (java.io BufferedReader File InputStreamReader)
   (java.lang ProcessHandle)))

(set! *warn-on-reflection* true)

(defn- discarding
  "A builder for `command` with both output streams thrown away."
  ^ProcessBuilder [command]
  (doto (ProcessBuilder. ^java.util.List command)
    (.redirectOutput java.lang.ProcessBuilder$Redirect/DISCARD)
    (.redirectError java.lang.ProcessBuilder$Redirect/DISCARD)))

;; A command started the ordinary way joins our own process group, so there is no group we could signal
;; without signalling ourselves. Prefixing this puts it in a group of its own instead. `setpgrp(0,0)` makes
;; the child a group leader, and `exec` then replaces perl with the real command, so the pid, the exit
;; status and the stream wiring are all unchanged. The block form of `exec` matters: `exec @ARGV` sends a
;; one-element list through /bin/sh, which would hand a command shell semantics it does not have here.
(def ^:private pgroup-wrapper
  ["perl" "-e" "setpgrp(0,0); exec {$ARGV[0]} @ARGV or die $!" "--"])

(def ^:private perl-available?
  ;; Perl ships with macOS and is essential on Debian and Ubuntu, but a stripped container may not have it.
  ;; Probed once, on first use, and everything still works without it -- strays are simply left running.
  (delay
    (try
      (zero? (.waitFor (.start (discarding ["perl" "-e" "exit 0"]))))
      (catch java.io.IOException _ false))))

(defn- start-process!
  "Starts `args` as a subprocess, using `dir` as its working directory when provided.
  When non-nil, `env` must be a map and completely replaces the parent environment."
  ^Process [args env dir]
  (let [command (into (if @perl-available? pgroup-wrapper []) (map str) args)
        builder (ProcessBuilder. ^java.util.List command)]
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
(def ^:private kill-grace-period-ms (* 5 1000))

;; How often we check whether a signalled process has exited.
(def ^:private exit-poll-interval-ms 50)

;; After a command exits, its output readers receive at least this much time to finish.
(def ^:private drain-floor-ms (* 2 1000))

(def ^:private drain-failed-message
  ;; Returning partial output as complete would hide data loss, so this is an error.
  "Command exited, but something it left running is holding its output pipe open.")

(defn- deadline-in
  "Returns the `System/nanoTime` deadline `timeout-ms` milliseconds from now."
  [timeout-ms]
  ;; A monotonic reading, so an NTP correction or a manual clock change cannot move the deadline.
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

(defn- signal-process-group!
  "Sends `signal` to the whole process group led by `pid`.
  Does nothing useful unless the command was started through [[pgroup-wrapper]], since without it the
  command leads no group of its own."
  [pid signal]
  (try
    (.waitFor (.start (discarding ["kill" (str "-" signal) (str "-" pid)])))
    (catch java.io.IOException _ nil)))

(defn- kill-process!
  "Attempts to stop `proc` and everything it started.
  Returns after every process it can see has exited, or after two grace periods."
  [^Process proc]
  (let [root    (.toHandle proc)
        ;; Capture descendants before signalling the root, which can make them unreachable when it exits.
        handles (cons root (iterator-seq (.iterator (.descendants root))))
        group?  @perl-available?]
    (run! #(.destroy ^ProcessHandle %) handles)
    ;; A process that outlived its parent is reparented away and drops out of `descendants`, but it keeps
    ;; the process group it was born into, so the group signal still reaches it.
    (when group?
      (signal-process-group! (.pid proc) "TERM"))
    (wait-for-exit handles kill-grace-period-ms)
    ;; Signal every survivor directly because its parent may already have exited.
    (run! (fn [^ProcessHandle handle]
            (when (.isAlive handle)
              (.destroyForcibly handle)))
          handles)
    (when group?
      (signal-process-group! (.pid proc) "KILL"))
    (wait-for-exit handles kill-grace-period-ms)))

(def ^:private command-timeout-ms (* 15 60 1000))

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
        ;; `or` selects the default for a missing key or an explicit nil.
        ;; Destructuring `:or` only covers a missing key.
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
          ;; Close the streams rather than the readers.
          ;; `BufferedReader.close` waits for the lock a blocked `readLine` holds, so it cannot return until EOF.
          ;; A process left holding the pipe can withhold EOF for as long as it lives; closing the stream
          ;; underneath ends the read at once.
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
