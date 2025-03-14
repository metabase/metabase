;; -*- mode: clojure -*-

;; You may want to set an alias for mage:
;; alias mage='cd ~/your/repo/metabase && ./bin/mage'

(ns mage
  (:require
   [babashka.tasks :as bt]
   [mage.color :as c]
   [mage.shell :as sh]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn lolcat [f]
  (if (try (u/sh "command -v lolcat")
           (catch Exception _ false))
    (bt/shell (str "lolcat " f))
    (println (slurp f))))

(defn invalid-task? []
  (let [task-name (first *command-line-args*)]
    (when-not (contains? (set (u/all-bb-tasks-list)) task-name)
      (println (c/red (str "Unknown task: " task-name)))
      true)))

(defn tip-o-day []
  (rand-nth
   ["Did you know? You can use `mage <task> --help` to get more information about a specific task."
    "Pro tip: Use `mage <task>` to run a specific task."
    "Remember: You can always check available tasks with `bb tasks`."
    "Fun fact: The word 'mage' comes from the Latin 'magus', meaning 'wise"
    "Pro tip: You can setup autocomplete for mage to speed up your workflow with mage setup-autocomplete."]))

(defn- print-help []
  (do
    (lolcat "./mage/resource.txt")
    (flush)
    (println (c/bold " ✨ Metabase Automation Genius Engine ✨"))
    (println "")
    (println (u/sh "bb tasks"))
    (println (tip-o-day))))

(defn -main [& _]
  (cond
    ;; help
    (or
     (nil? *command-line-args*)
     (= *command-line-args* ["-h"])
     (= *command-line-args* ["--help"]))
    (print-help)

    ;; errors
    (invalid-task?)
    (do (print-help) (System/exit 1))

    :else
    (apply sh/sh (into ["bb"] *command-line-args*))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
