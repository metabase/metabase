(ns mage.start-maildev
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]))

(defn start-maildev!
  "Start Maildev"
  []
  (println (c/red "Killing existing `mb-maildev` container..."))
  (shell/sh* {:quiet? true} "docker" "kill" "mb-maildev")
  (shell/sh* {:quiet? true} "docker" "rm" "mb-maildev")
  (let [cmd ["docker" "run" "-d"
             "-p" "1080:1080"
             "-p" "1025:1025"
             "--name" "mb-maildev"
             "maildev/maildev"]]
    (println "Running:" (c/magenta (str/join " " cmd)))
    (apply shell/sh cmd)
    (println (str "Configure Metabase to send emails using " (c/cyan "localhost:1025")))
    (println (str "View Maildev UI at " (c/cyan "http://localhost:1080")))))
