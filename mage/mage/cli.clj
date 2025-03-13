(ns mage.cli
  (:require
   [clojure.string :as str]
   [clojure.tools.cli :as tools.cli]
   [mage.color :as c]
   [mage.util :as u]
   [malli.core :as mc]
   [malli.transform :as mtx]))

(set! *warn-on-reflection* true)

(defn- check-print-help [{:keys [options usage-fn] :as current-task}]
  (let [command-line-args *command-line-args*]
    (when (or (get (set command-line-args) "-h")
              (get (set command-line-args) "--help"))
      (println "Task Name:" (:name current-task))
      (println (str " "  (c/green (:doc current-task))))
      (println "Usages:")
      (println (:summary (tools.cli/parse-opts *command-line-args* options)))
      (when-let [examples (:examples current-task)]
        (println "\nExamples:")
        (doseq [[cmd effect] examples]
          (println "\n" cmd "\n -" (c/magenta effect))))
      (when usage-fn
        (println "\n"
                 #_:clj-kondo/ignore
                 ((eval usage-fn) current-task)))
      (System/exit 0))))

(defn- coerce-arguments [arg-schema current-task arguments]
  (if-not arg-schema
    arguments
    (let [decoded-args (mc/decode arg-schema arguments mtx/string-transformer)]
      #_:clj-kondo/ignore ;; TODO: don't run all linters on these files
      (if (mc/validate arg-schema decoded-args)
        decoded-args
        (do (doseq [{:keys [path schema value]} (:errors
                                                 #_:clj-kondo/ignore
                                                 (mc/explain arg-schema decoded-args))]
              (println (c/red "Invalid Argument at " path
                              ". It should match: " (mc/form schema)
                              " got: " (pr-str value))))
            (binding [*command-line-args* ["-h"]]
              (check-print-help current-task))
            (System/exit 0))))))

(defn- check-option-errors [option-errors *error-hit? summary]
  (when option-errors
    (doseq [error-or-warning option-errors]
      (if (str/starts-with? error-or-warning "Unknown option:")
        (println (c/yellow error-or-warning))
        (do (reset! *error-hit? true)
            (println (c/red error-or-warning)))))
    (when @*error-hit?
      (println "Usage:")
      (println summary)
      (System/exit 0))))

(defn parse!
  "Options are pulled from the current task map in bb.edn.

  Returns a map of options and args.

  TLDR:
  Option specifications are a sequence of vectors with the following format:

  [short-opt long-opt-with-required-description description
  :property value]

  See: https://clojure.github.io/tools.cli/index.html#clojure.tools.cli/parse-opts"
  [{:keys [options arg-schema] :as current-task}]
  (check-print-help current-task)
  (let [*error-hit? (atom false)
        {:keys [summary]
         option-errors :errors
         :as parsed-opts} (tools.cli/parse-opts *command-line-args* options)
        _ (check-option-errors option-errors *error-hit? summary)
        parsed (update parsed-opts :arguments (partial coerce-arguments arg-schema current-task))]
    (u/debug (c/green "UNPARSED: ") *command-line-args*)
    (u/debug (c/green "PARSED:   ") parsed)
    parsed))

(comment

  {:options {:force-check true},
   :arguments ["asd" "qwe"],
   :summary "  -c, --force-check  false  Check staged files",
   :errors ["Unknown option: \"-j\""]})
