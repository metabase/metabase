;; -*- mode: clojure -*-

;; You may want to set an alias for mage:
;; alias mage='cd ~/your/repo/metabase && ./bin/mage'

(ns mage
  (:require
   [babashka.tasks :as bt]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as sh]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn lolcat [f]
  (if (try (u/sh "command -v lolcat")
           (catch Exception _ false))
    (bt/shell (str "lolcat " f))
    (do
      (println (slurp f))
      (when (> (rand) 0.8)
        (println (c/yellow "Tip: install lolcat for a better experience!"))))))

(defn invalid-task? []
  (let [task-name (first *command-line-args*)]
    (when-not (contains? (set (u/all-bb-tasks-list)) task-name)
      (println (c/red (str "Unknown task: " task-name)))
      true)))

(defn- zen []
  (mapv (comp #(str "Zen of Metabase: " %) #(apply str %) #(drop 2 %))
        (filter (fn [x] (str/starts-with? x "-"))
                (str/split-lines (slurp "zen.md")))))

(defn tip-o-day []
  (rand-nth
   (concat ["Did you know? You can use `./bin/mage <task> --help` to get more information about a specific task."
            "Pro tip: Use `./bin/mage <task>` to run a specific task."
            "Remember: You can always check available tasks with `./bin/mage`"
            "Fun fact: The word 'mage' comes from the Latin 'magus', meaning 'wise'"
            "Pro tip: You can setup autocomplete for mage to speed up your workflow with mage setup-autocomplete."
            "Tip: we reccomend aliasing mage like: `alias mage='cd $MB_DIR && ./bin/mage'`"]
           (zen))))

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
    ;; at this point, we always have a valid task,
    ;; and we know there is a bb executable at `./bin/bb`.
    (apply sh/sh (into ["./bin/bb"] *command-line-args*))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
