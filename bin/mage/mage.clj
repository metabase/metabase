#!/usr/bin/env bb
(ns mage
  (:require [babashka.cli :as cli]
            [babashka.nrepl.server :as nrepl.server]
            [clojure.string :as str]
            [indent :as indent]
            [splash :as splash]
            [util :as u]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; CLI
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn help [m]
  (println splash/screen)
  (println "Protip: to add mage to your path, run:")
  (println "  ./mage add-to-path >> ~/.bashrc")
  (println "  source ~/.bashrc"))

(defn mage-nrepl
  "Starts the babashka nrepl server for mage development."
  [m]
  (spit ".nrepl-port" 1667)
  (nrepl.server/start-server!)
  (deref (promise)))

(defn print-path! [& _m]
  (println (str "export PATH=$PATH:" (u/sh! "pwd"))))

(def table
  [{:cmds ["add-to-path"] :fn print-path!}
   {:cmds ["nrepl"] :fn mage-nrepl}
   {:cmds ["indent"] :fn indent/indent}
   {:cmds ["indent" "help"] :fn indent/help}
   {:cmds ["help"] :fn help}
   {:cmds [] :fn help}])

(defn -main [& args]
  (cli/dispatch table args {:coerce {:depth :long}}))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
