#!/usr/bin/env bb
(ns mage
  (:require [babashka.cli :as cli]
            [babashka.nrepl.server :as nrepl.server]
            [clojure.string :as str]
            [format :as format]
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

;; TODOs:
;; - kondo for a file / dir

(def table
  [{:cmds ["add-to-path"] :fn print-path!}
   {:cmds ["nrepl"] :fn mage-nrepl}
   {:cmds ["format"] :fn format/format}
   {:cmds ["format" "help"] :fn format/help}
   {:cmds ["help"] :fn help}
   {:cmds [] :fn help}])

(defn -main [& args]
  (cli/dispatch table args {:coerce {:depth :long}}))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
