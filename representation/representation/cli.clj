(ns representation.cli
  (:require [clojure.string :as str]
            [clojure.tools.cli :as tools.cli]
            [representation.color :as c]))

(set! *warn-on-reflection* true)

(defn parse!
  "Parse CLI options for representation commands."
  [options]
  (let [*error-hit? (atom false)
        options-with-help (conj options ["-h" "--help" "Show help"])
        {:keys [summary options]
         option-errors :errors
         :as parsed-opts} (tools.cli/parse-opts *command-line-args* options-with-help)]

    (when (:help options)
      (println summary)
      (System/exit 0))

    (when option-errors
      (doseq [error-or-warning option-errors]
        (if (str/starts-with? error-or-warning "Unknown option:")
          (println (c/yellow error-or-warning))
          (do (reset! *error-hit? true)
              (println (c/red error-or-warning)))))
      (when @*error-hit?
        (println "Usage:")
        (println summary)
        (System/exit 1)))

    parsed-opts))
