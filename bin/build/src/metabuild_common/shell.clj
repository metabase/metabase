(ns metabuild-common.shell
  (:require
   [clojure.string :as str]
   [colorize.core :as colorize]
   [metabuild-common.output :as out]
   [metabuild-common.steps :as steps])
  (:import
   (java.io BufferedReader File InputStreamReader)))

(set! *warn-on-reflection* true)

(defn- read-lines [^java.io.BufferedReader reader {:keys [quiet? err?]}]
  (loop [lines []]
    (if-let [line (.readLine reader)]
      (do
        (when-not quiet?
          (out/safe-println (if err? (colorize/red line) line)))
        (recur (conj lines line)))
      lines)))

(defn- deref-with-timeout [dereffable timeout-ms]
  (let [result (deref dereffable timeout-ms ::timed-out)]
    (when (= result ::timed-out)
      (throw (ex-info (format "Timed out after %d ms." timeout-ms) {})))
    result))

(def ^:private command-timeout-ms (* 15 60 1000)) ; 15 minutes

(defn sh*
  "Run a shell command. Like `clojure.java.shell/sh`, but prints output to stdout/stderr and returns a map with keys
  `:exit`, `:out`, and `:err` (`:out` and `:err` are vectors of lines). Does not throw Exception if process exits with
  non-zero status code.

  Options:

  * `env` -- environment variables (as a map) to use when running `cmd`. If `:env` is `nil`, the default parent
    environment (i.e., the environment in which this Clojure code itself is ran) will be used; if `:env` IS passed, it
    completely replaces the parent environment in which this script is ran -- make sure you pass anything that might be
    needed such as `JAVA_HOME` and `PATH` if you do this

  * `dir` -- current directory to use when running the shell command. If not specified, command is run in the same
    current directory as the Clojure scripts, `bin/build-drivers`

  * `quiet?` -- whether to suppress output from this shell command."
  {:arglists '([cmd & args] [{:keys [env dir quiet?]} cmd & args])}
  [& args]
  (steps/step (colorize/blue (str "$ " (str/join " " (map (comp pr-str str) (if (map? (first args))
                                                                              (rest args)
                                                                              args)))))
    (let [[opts & args]     (if (map? (first args))
                              args
                              (cons nil args))
          {:keys [env dir]} opts
          cmd-array         (into-array (map str args))
          env-array         (when env
                              (assert (map? env))
                              (into-array String (for [[k v] env]
                                                   (format "%s=%s" (name k) (str v)))))
          proc              (.exec (Runtime/getRuntime)
                                   ^"[Ljava.lang.String;" cmd-array
                                   ^"[Ljava.lang.String;" env-array
                                   ^File (when dir (File. ^String dir)))]
      (with-open [out-reader (BufferedReader. (InputStreamReader. (.getInputStream proc)))
                  err-reader (BufferedReader. (InputStreamReader. (.getErrorStream proc)))]
        (let [exit-code (future (.waitFor proc))
              out       (future (read-lines out-reader opts))
              err       (future (read-lines err-reader (assoc opts :err? true)))]
          {:exit (deref-with-timeout exit-code command-timeout-ms)
           :out  (deref-with-timeout out command-timeout-ms)
           :err  (deref-with-timeout err command-timeout-ms)})))))

(defn sh
  "Like `sh*`, but throws an Exception if the command exits with a non-zero status. Options are the same as `sh*` -- see
  its documentation for more information."
  {:arglists '([cmd & args] [{:keys [env dir quiet?]} cmd & args])}
  [& args]
  (let [{:keys [exit out err], :as response} (apply sh* args)]
    (if (zero? exit)
      (concat out err)
      (throw (ex-info (str/join "\n" (concat out err)) response)))))
