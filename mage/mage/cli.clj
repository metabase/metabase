(ns mage.cli
  (:require
   [clojure.string :as str]
   [clojure.tools.cli :as tools.cli]
   [mage.color :as c]
   [mage.util :as u]
   [malli.core :as mc]))

(set! *warn-on-reflection* true)

(defn- check-print-help [{:keys [options] :as current-task}]
  (let [command-line-args *command-line-args*]
    (when (or (get (set command-line-args) "-h")
              (get (set command-line-args) "--help"))
      (println (:name current-task))
      (println (str " "  (c/green (:doc current-task))))
      (println (:summary (tools.cli/parse-opts *command-line-args* options)))
      (when-let [examples (:examples current-task)]
        (println "\nExamples:")
        (doseq [[cmd effect] examples]
          (println "\n" cmd "\n -" (c/magenta effect))))
      (System/exit 0))))

(defn parse!
  "Options are pulled from the current task map in bb.edn.

  Returns a map of options and args.

  TLDR:
  Option specifications are a sequence of vectors with the following format:

  [short-opt long-opt-with-required-description description
  :property value]

  See: https://clojure.github.io/tools.cli/index.html#clojure.tools.cli/parse-opts"
  [{:keys [options] :as current-task}]
  (check-print-help current-task)
  (let [*error-hit? (atom false)
        {:keys [summary errors] :as parsed} (tools.cli/parse-opts *command-line-args* options)]
    (when errors
      (doseq [error-or-warning errors]
        (if (str/starts-with? error-or-warning "Unknown option:")
          (println (c/yellow error-or-warning))
          (do (reset! *error-hit? true)
              (println (c/red error-or-warning)))))
      (when @*error-hit?
        (println "Usage:")
        (println summary)
        (System/exit 0)))
    (u/debug "parsed: " parsed)
    parsed))

{:options {:force-check true},
 :arguments ["asd" "qwe"],
 :summary "  -c, --force-check  false  Check staged files",
 :errors ["Unknown option: \"-j\""]}
