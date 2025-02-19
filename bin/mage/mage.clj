#!/usr/bin/env bb
(ns mage
  (:require
   [babashka.cli :as cli]
   [babashka.nrepl.server :as nrepl.server]
   [clojure.string :as str]
   [format :as format]
   [kondo :as kondo]
   [splash :as splash]
   [util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; CLI
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn help [m]
  (println splash/screen))

(defn mage-nrepl
  "Starts the babashka nrepl server for mage development."
  [m]
  (spit ".nrepl-port" 1667)
  (nrepl.server/start-server!)
  (deref (promise)))

(defn print-path! [& _m]
  (println "Protip: to add mage to your path, run either of :")
  (println (str "  export PATH=$PATH:" (u/sh! "pwd") "/bin >> ~/.bashrc && source ~/.bashrc"))
  (println (str "  export PATH=$PATH:" (u/sh! "pwd") "/bin >> ~/.zshrc && source ~/.zshrc"))
  (println "Then you can use 'mage.sh' directly from the terminal."))

;; TODOs:
;; - kondo for a file / dir

(def table
  [{:cmds ["add-to-path"] :fn print-path!}
   {:cmds ["nrepl"] :fn mage-nrepl}
   {:cmds ["format"] :fn format/format}
   {:cmds ["kondo"] :fn kondo/kondo}
   {:cmds ["kondo-updated"] :fn kondo/kondo-updated}
   {:cmds ["help"] :fn help}
   {:cmds [] :fn help}])

(defn -main [& args]
  (cli/dispatch table args {:coerce {:depth :long}}))

(when (= *file* (System/getProperty "babashka.file"))
  ;; (prn "cli" *command-line-args*)
  (apply -main *command-line-args*))
