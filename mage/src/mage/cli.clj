(ns mage.cli
  (:require
   [clojure.string :as str]
   [clojure.tools.cli :as tools.cli]
   [mage.color :as c]
   [mage.util :as u]
   [malli.core :as mc]
   [malli.transform :as mtx]))

(set! *warn-on-reflection* true)

(defn- arg-name
  ([arg]
   (arg-name nil arg))
  ([idx arg]
   ;; TODO: support `:maybe` as an optional argument?
   (or (:name (mc/properties arg))
       (cond-> "arg"
         ;; Don't zero index generated argument names
         idx (str (inc idx))))))

(defn- seq-arg-name
  [arg]
  (str (arg-name arg) "..."))

(defn- name-arguments
  [arg-schema]
  (case (mc/type arg-schema)
    :or (map name-arguments (mc/children arg-schema))
    :tuple (str/join " " (map-indexed arg-name (mc/children arg-schema)))
    :sequential (seq-arg-name (first (mc/children arg-schema)))))

(defn- desc-arguments
  [arg-schema]
  (case (mc/type arg-schema)
    :or (reduce merge {} (map desc-arguments (mc/children arg-schema)))
    :tuple (reduce (fn [acc [idx arg]]
                     (let [desc (:desc (mc/properties arg))]
                       (cond-> acc
                         desc (assoc (arg-name idx arg) desc))))
                   {} (map-indexed vector (mc/children arg-schema)))
    :sequential (when-let [desc (-> arg-schema mc/children first :desc)]
                  {(name-arguments arg-schema) desc})))

(defn- check-print-help [{:keys [options usage-fn arg-schema] :as current-task}]
  (let [command-line-args *command-line-args*
        summary (:summary (tools.cli/parse-opts *command-line-args* options))
        usage-name (str "  " (:name current-task) (when-not (str/blank? summary) " [OPTIONS]"))]
    (when (or (get (set command-line-args) "-h")
              (get (set command-line-args) "--help"))
      (println "Task Name:" (:name current-task))
      (println (str "  "  (c/green (:doc current-task))))
      (println "\nUsages:")
      (if-not arg-schema
        (println usage-name)
        (let [arg-usages (name-arguments (mc/schema arg-schema))
              argument-descriptions (desc-arguments arg-schema)]
          (if (seq? arg-usages)
            (doseq [arg-usage arg-usages]
              (println (str usage-name " " arg-usage)))
            (println (str usage-name " " arg-usages)))
          (when (seq argument-descriptions)
            (println "\nArguments:")
            (doseq [[name desc] argument-descriptions]
              (println (str "  " name ": " desc))))))
      (when-not (str/blank? summary)
        (println "\nOptions:")
        (println summary))
      (when-let [examples (:examples current-task)]
        (println "\nExamples:")
        (doseq [[cmd effect] examples]
          (println "\n" cmd "\n -" (c/magenta effect))))
      (when usage-fn
        (println "\n"
                 #_:clj-kondo/ignore
                 ((eval usage-fn) current-task)))
      #_{:clj-kondo/ignore [:discouraged-java-method]}
      (System/exit 0))))

(defn- coerce-arguments [arg-schema current-task arguments]
  (if-not arg-schema
    arguments
    (let [decoded-args (try (mc/decode arg-schema arguments mtx/string-transformer)
                            (catch Exception _e arguments))]
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
            #_{:clj-kondo/ignore [:discouraged-java-method]}
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
      #_{:clj-kondo/ignore [:discouraged-java-method]}
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
  (try
    (check-print-help current-task)
    (let [;; options are defined in bb.edn, as data,
          ;; so we need to eval them to get any functions to work
          options #_:clj-kondo/ignore (eval options)
          *error-hit? (atom false)
          {:keys [summary]
           option-errors :errors
           :as parsed-opts} (tools.cli/parse-opts *command-line-args* options)
          _ (check-option-errors option-errors *error-hit? summary)
          parsed (update parsed-opts :arguments (partial coerce-arguments arg-schema current-task))]
      (u/debug (c/green "UNPARSED: ") *command-line-args*)
      (u/debug (c/green "PARSED:   ") parsed)
      parsed)
    (catch Exception e
      (println (c/red "Mage CLI parsing Error:") (.getMessage e))
      #_{:clj-kondo/ignore [:discouraged-java-method]}
      (System/exit 1))))

(comment

  {:options {:force-check true},
   :arguments ["asd" "qwe"],
   :summary "  -c, --force-check  false  Check staged files",
   :errors ["Unknown option: \"-j\""]})
