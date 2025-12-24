;; -*- mode: clojure -*-

;; You may want to set an alias for mage:
;; alias mage='cd ~/your/repo/metabase && ./bin/mage'

(ns mage
  (:require
   [babashka.tasks :as bt]
   [bling.banner :refer [banner]]
   [bling.fonts.ansi-shadow :as ansi-shadow]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- invalid-task? []
  (let [task-name (first *command-line-args*)]
    (when-not (contains? (set (u/all-bb-tasks-list)) task-name)
      (println (c/red (str "Unknown task: " task-name)))
      true)))

(defn- zen []
  (mapv (comp #(str (c/bold "Zen") " of Metabase: " %) #(apply str %) #(drop 2 %))
        (filter (fn [x] (str/starts-with? x "-"))
                (str/split-lines (slurp "zen.md")))))

(defn- tip-o-day []
  (rand-nth
   (concat ["You can use `./bin/mage <task> --help` to get more information? It works with every task."
            "Remember: You can check private tasks with `./bin/mage ls`"
            "Fun fact: The word 'mage' comes from the Latin 'magus', meaning 'wise'"
            (str "Pro tip: You can setup autocomplete for mage to speed up your workflow with " (c/cyan  "./bin/mage alias."))]
           (zen))))

(defn- print-help []
  (println
   (banner {:font ansi-shadow/ansi-shadow
            :text (str (when (> (rand-int 100) 98) (str (u/sh "whoami") "'s ")) "Mage")
            :gradient-direction (rand-nth [:to-top :to-bottom :to-right :to-left])
            :margin-left 3
            :margin-top 1
            :gradient-colors (rand-nth [[:green :blue] [:red :magenta] [:orange :purple] [:cool :warm]])}))
  (flush)
  (println (c/bold " ✨ Metabase Automation Genius Engine ✨"))
  (println "")
  (println (u/sh (str u/project-root-directory "/bin/bb tasks")))
  (println (tip-o-day)))

(defn- summarize-exception [^Exception e]
  (cond-> {:exception-type (-> e class .getName)
           :ex-message (.getMessage e)}

    ;; Include ex-data if it's an ExceptionInfo
    (instance? clojure.lang.ExceptionInfo e)
    (assoc :data (ex-data e))

    ;; Recursively handle cause
    (.getCause e)
    (assoc :cause (summarize-exception (.getCause e)))))

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
    (do (print-help)
        (throw (ex-info "" {:babashka/exit 1})))

    :else
    ;; at this point, we always have a valid task, and we are running in bb, so
    ;; we can call the task directly with `bt/run`.
    (try
      ;; the task is the first command-line argument
      (let [[task & args] *command-line-args*]
        (binding [*command-line-args* args]
          (try (bt/run task)
               (catch Exception e
                 ;; To signal a problem in your mage task:
                 ;; - Exceptions get summarized unless you set MAGE_DEBUG in your environment
                 ;;   so they aren't so noisy
                 ;; - The ex-message will be printed
                 ;; - The ex-data will be printed
                 ;;   - the (optional) `:babashka/exit` ex-data key will be used to determine the exit code
                 ;;   - the (optional) `:mage/quiet` ex-data key will suppress all error output, 
                 ;;   - the (optional) `:mage/error` ex-data key will suppress printing the entire exception:
                 ;;                    use this when you know what the problem is and want to avoid noise
                 ;;
                 ;; Avoid using `System/exit` in your tasks, as it will hurt repl-ability of tasks:
                 ;; it will close your repl, prefer `mage.util/exit`
                 (let [message (ex-message e)
                       data (ex-data e)]
                   (when-not (:mage/quiet data)
                     (when (and e (not (:mage/error data)))
                       (println (c/yellow "\nException:\n")
                                (cond-> e
                                  (not (u/env "MAGE_DEBUG" (constantly nil)))
                                  summarize-exception)))
                     (when (and message (not (str/blank? message)))
                       (println (c/red (c/reverse-color "ex-message : ")) message))
                     (when data
                       (println (c/yellow (c/reverse-color "ex-data    : ")) (pr-str
                                                                              (dissoc data :mage/error))))
                     (when (:mage/error data)
                       (println (c/blue (c/reverse-color "mage/error : ")) (:mage/error data))))
                   #_{:clj-kondo/ignore [:discouraged-java-method]}
                   (System/exit (:babashka/exit data 1))))))))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
