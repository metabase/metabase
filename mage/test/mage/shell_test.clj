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

(defn- gone?
  "Whether the process `pid` has exited within two seconds, once its parent has reaped it."
  [pid]
  (let [deadline (+ (System/currentTimeMillis) 2000)]
    (loop []
      (let [state (str/trim (str/join (:out (shell/sh* {:quiet? true} "ps" "-o" "stat=" "-p" (str pid)))))]
        (cond
          (or (str/blank? state) (str/starts-with? state "Z")) true
          (< (System/currentTimeMillis) deadline)                (do (Thread/sleep 50) (recur))
          :else                                                  false)))))

(deftest timeout-kills-the-command-and-its-descendants-test
  (let [pids    (File/createTempFile "mage-shell-timeout" ".pids")
        started (System/nanoTime)]
    (try
      ;; The sleep is a grandchild that ignores SIGTERM, so it only dies when the kill is aimed at it
      ;; directly, after its parent shell has already gone.
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Timed out after 200 ms"
                            (shell/sh* {:quiet? true, :timeout-ms 200}
                                       "sh" "-c"
                                       "echo $$ > \"$0\"; sh -c 'trap \"\" TERM; sleep 30' & echo $! >> \"$0\"; wait"
                                       (str pids))))
      ;; Five seconds of grace before the forced kill; anything near the sleep's 30 s means the kill never
      ;; landed and the command was simply waited out.
      (is (< (/ (- (System/nanoTime) started) 1e6) 15000) "the timed-out command was waited out instead of killed")
      (let [[root child] (map parse-long (str/split-lines (slurp pids)))]
        (is (some? child) "the command did not record its descendant")
        (is (gone? root) "the timed-out shell was left running")
        (is (gone? child) "the shell's descendant was left running"))
      (finally
        (.delete pids)))))
