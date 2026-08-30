(ns mage.shell-test
  (:require
   [clojure.test :refer [deftest is]]
   [mage.shell :as shell]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(set! *warn-on-reflection* true)

(defn- running? [marker]
  (zero? (:exit (shell/sh* {:quiet? true} "pgrep" "-f" marker))))

(deftest timeout-kills-the-command-test
  (let [marker (str "mage-shell-timeout-" (random-uuid))]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Timed out after 200 ms"
                          (shell/sh* {:quiet? true, :timeout-ms 200} "sh" "-c" (str "sleep 30 # " marker))))
    (is (not (running? marker)) "the timed-out shell and its sleep were left running")))
