(ns mage.shell-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is]]
   [mage.shell :as shell])
  (:import
   (java.io File)))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(set! *warn-on-reflection* true)

(def ^:private ns-per-ms 1000000)

;; How long a killed process gets to disappear from `ps` before we call it a survivor.
(def ^:private gone-timeout-ms (* 2 1000)) ; 2 seconds

(def ^:private gone-poll-interval-ms 50)

(defn- gone?
  "Whether the process `pid` has exited within [[gone-timeout-ms]], once its parent has reaped it."
  [pid]
  (let [deadline (+ (System/nanoTime) (* gone-timeout-ms ns-per-ms))]
    (loop []
      (let [state (str/trim (str/join (:out (shell/sh* {:quiet? true} "ps" "-o" "stat=" "-p" (str pid)))))]
        (cond
          (or (str/blank? state) (str/starts-with? state "Z")) true
          (< (System/nanoTime) deadline)                       (do (Thread/sleep gone-poll-interval-ms) (recur))
          :else                                                false)))))

;; Short, so the test spends no longer than it has to waiting for the timeout to fire -- but long enough
;; that a loaded CI runner can still fork twice and write both pids before the kill lands. At 200 ms the
;; file could come up one line short and fail the `child` assertion for the wrong reason.
(def ^:private command-timeout-ms 1000)

;; Long enough that a run which merely waits the command out cannot come in under [[kill-bound-ms]].
(def ^:private grandchild-sleep-seconds 30)

;; The timeout plus both of `kill-process!`'s grace periods, with slack for a loaded machine.
(def ^:private kill-bound-ms (* 15 1000)) ; 15 seconds

(deftest timeout-kills-the-command-and-its-descendants-test
  (let [pids    (File/createTempFile "mage-shell-timeout" ".pids")
        started (System/nanoTime)]
    (try
      ;; The sleep is a grandchild that ignores SIGTERM, so it only dies when the kill is aimed at it
      ;; directly, after its parent shell has already gone.
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "Timed out after " command-timeout-ms " ms"))
                            (shell/sh* {:quiet? true, :timeout-ms command-timeout-ms}
                                       "sh" "-c"
                                       (str "echo $$ > \"$0\"; sh -c 'trap \"\" TERM; sleep "
                                            grandchild-sleep-seconds "' & echo $! >> \"$0\"; wait")
                                       (str pids))))
      (is (< (quot (- (System/nanoTime) started) ns-per-ms) kill-bound-ms)
          "the timed-out command was waited out instead of killed")
      (let [[root child] (map parse-long (str/split-lines (slurp pids)))]
        (is (some? child) "the command did not record its descendant")
        (is (gone? root) "the timed-out shell was left running")
        (is (gone? child) "the shell's descendant was left running"))
      (finally
        (.delete pids)))))

;; The orphan outlives the command by design: once its parent exits it is reparented away and is no longer
;; reachable from our process handle, so the test records its pid and cleans up after itself.
(def ^:private orphan-sleep-seconds 20)

(def ^:private orphan-timeout-ms 500)

;; Above the drain floor and far below the orphan's lifetime. Anything in between means sh* sat waiting for
;; the orphan rather than closing the pipe out from under the read.
(def ^:private orphan-bound-ms (* 8 1000)) ; 8 seconds

(deftest orphan-holding-the-output-pipe-does-not-hold-the-caller-test
  (let [pid-file (File/createTempFile "mage-shell-orphan" ".pid")
        started  (System/nanoTime)]
    (try
      ;; The command exits immediately but leaves a process holding the stdout pipe, so the pipe never
      ;; reaches EOF. Closing the BufferedReader would block until the orphan died -- 62 s against a 500 ms
      ;; budget in the case that prompted this.
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"holding its output pipe open"
                            (shell/sh* {:quiet? true, :timeout-ms orphan-timeout-ms}
                                       "sh" "-c"
                                       (str "sleep " orphan-sleep-seconds " & echo $! > \"$0\"; exit 0")
                                       (str pid-file))))
      (is (< (quot (- (System/nanoTime) started) ns-per-ms) orphan-bound-ms)
          "sh* waited out the orphan instead of closing the pipe")
      (finally
        (when-let [pid (parse-long (str/trim (slurp pid-file)))]
          (shell/sh* {:quiet? true} "kill" "-9" (str pid)))
        (.delete pid-file)))))
