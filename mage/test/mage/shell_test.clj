(ns mage.shell-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is]]
   [mage.shell :as shell])
  (:import
   (java.io File)))

;; core_test.clj references this var to ensure this namespace is loaded.
(def keep-me :loaded)

(set! *warn-on-reflection* true)

(def ^:private ns-per-ms 1000000)

;; The test waits this long for a killed process to disappear from `ps`.
(def ^:private gone-timeout-ms (* 2 1000))

(def ^:private gone-poll-interval-ms 50)

(defn- gone?
  "Returns true if `pid` exits or becomes a zombie within [[gone-timeout-ms]]."
  [pid]
  (let [deadline (+ (System/nanoTime) (* gone-timeout-ms ns-per-ms))]
    (loop []
      (let [state (str/trim (str/join (:out (shell/sh* {:quiet? true} "ps" "-o" "stat=" "-p" (str pid)))))]
        (cond
          (or (str/blank? state) (str/starts-with? state "Z")) true
          (< (System/nanoTime) deadline)                       (do (Thread/sleep gone-poll-interval-ms) (recur))
          :else                                                false)))))

;; The timeout keeps the test quick while still giving a loaded runner time to fork twice and record
;; both pids before the kill.
(def ^:private command-timeout-ms 1000)

;; The grandchild lives long enough that waiting it out cannot finish within [[kill-bound-ms]].
(def ^:private grandchild-sleep-seconds 30)

;; The command's timeout plus both grace periods, with room to spare on a loaded machine.
(def ^:private kill-bound-ms (* 15 1000))

(deftest timeout-kills-the-command-and-its-descendants-test
  (let [pids    (File/createTempFile "mage-shell-timeout" ".pids")
        started (System/nanoTime)]
    (try
      ;; The sleep is a grandchild that inherits its parent shell's decision to ignore SIGTERM.
      ;; Its parent may exit before the forced-kill pass, so the kill must be aimed directly at the sleep.
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

;; The orphan outlives the command by design.
;; Once it is reparented, the command's process handle can no longer reach it, so the test records its
;; pid for cleanup.
(def ^:private orphan-sleep-seconds 20)

(def ^:private orphan-timeout-ms 500)

;; The bound sits above the drain floor but far below the orphan's lifetime.
;; If `sh*` exceeds it, it waited for the orphan instead of closing the pipe beneath the blocked read.
(def ^:private orphan-bound-ms (* 8 1000))

(deftest orphan-holding-the-output-pipe-does-not-hold-the-caller-test
  (let [pid-file (File/createTempFile "mage-shell-orphan" ".pid")
        started  (System/nanoTime)]
    (try
      ;; The command exits at once but leaves an orphan holding stdout open, so the pipe never reaches EOF.
      ;; Closing the reader would wait out the orphan's full 20 seconds, far past [[orphan-bound-ms]].
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
