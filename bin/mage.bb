;; -*- mode: clojure -*-

;; You may want to set an alias for mage:
;; alias mage='cd ~/your/repo/metabase && ./bin/mage'

(ns mage
  (:require
   [babashka.tasks :as bt]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]
   [puget.printer]))

(set! *warn-on-reflection* true)

(defn- lolcat [f]
  (if (try (u/sh "command -v lolcat")
           (catch Exception _ false))
    (bt/shell (str "lolcat " f))
    (do
      (println (slurp f))
      (when (> (rand) 0.8)
        (println (c/yellow "Tip: install lolcat for a better experience!"))))))

(defn- invalid-task? []
  (let [task-name (first *command-line-args*)]
    (when-not (contains? (set (u/all-bb-tasks-list)) task-name)
      (println (c/red (str "Unknown task: " task-name)))
      true)))

(defn- zen []
  (mapv (comp #(str "Zen of Metabase: " %) #(apply str %) #(drop 2 %))
        (filter (fn [x] (str/starts-with? x "-"))
                (str/split-lines (slurp "zen.md")))))

(defn- tip-o-day []
  (rand-nth
   (concat ["Did you know? You can use `./bin/mage <task> --help` to get more information about a specific task."
            "Pro tip: Use `./bin/mage <task>` to run a specific task."
            "Remember: You can always check available tasks with `./bin/mage`"
            "Fun fact: The word 'mage' comes from the Latin 'magus', meaning 'wise'"
            "Pro tip: You can setup autocomplete for mage to speed up your workflow with mage setup-autocomplete."
            "Tip: we reccomend aliasing mage like: `alias mage='cd $MB_DIR && ./bin/mage'`"]
           (zen))))

(defn- print-help []
  (lolcat "./mage/resource.txt")
  (flush)
  (println (c/bold " ✨ Metabase Automation Genius Engine ✨"))
  (println "")
  (println (u/sh "bb tasks"))
  (println (tip-o-day)))

(defn show-exception [e]
  (println (c/on-red "* Exception: " (type e) " *"))
  (.printStackTrace e))

(defn- -main
  "Babashka Entrypoint for Mage task runner.

   Tasks may throw exceptions to signal failure. The task runner supports structured
   error handling via metadata in the exception's `ex-data` map:

   - `:mage/error-report` — A user-facing error message string. If present, this will be
     printed instead of the exception or stack trace. Intended for friendly, concise output.
     Put output of failing tasks that are meant to be printed in this key.

   - `:mage/exit-code` — An integer exit code to use when the task fails. Defaults to 1 if omitted.

   If no `:mage/error-report` is provided, the runner will fall back to printing the exception's
   message (via `ex-message`), and optionally `ex-data` or the full stack trace depending on
   debugging settings.

   To enable debug output (e.g., for CI runs or local troubleshooting), set the environment variable:

   MAGE_DEBUG=true

   This will print the full exception stack trace and any exception.
   Debug mode is also automatically enabled in common CI environments by checking:
     - `MAGE_DEBUG`
     - `CI`
     - `GITHUB_ACTIONS`

  This design helps produce clean output by default, while still allowing detailed diagnostics
  in development or continuous integration environments."
  [& _]
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
    ;; at this point, we always have a valid task, and we are running in bb, so
    ;; we can call the task directly with `bt/run`.
    (try
      ;; the task is the first command-line argument
      (let [[task & args] *command-line-args*]
        (binding [*command-line-args* args]
          (try (bt/run task)
               (catch Exception e
                 (let [message (ex-message e)
                       data (ex-data e)
                       report (:mage/error-report data)
                       debug? (some System/getenv ["MAGE_DEBUG" "CI" "GITHUB_ACTIONS"])]
                   (when debug?
                     (binding [*out* *err*] (show-exception e))
                     (println ""))
                   (when report
                     (println (c/on-red "  * mage/error-report *  "))
                     (println report))
                   (when message
                     (println (c/on-red "  * ex-message *  "))
                     (println message))
                   (when data
                     (println (c/on-red "  * ex-data *  "))
                     (-> data
                         (dissoc :mage/error-report :mage/exit-code)
                         puget.printer/pprint
                         puget.printer/with-color))
                   (if (and (not data) (not message) (not report))
                     (binding [*out* *err*] (show-exception e))
                     (when-not debug?
                       (println "\nException hidden: Run with MAGE_DEBUG set for more information.")))
                   (System/exit (:mage/exit-code data 1))))))))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
