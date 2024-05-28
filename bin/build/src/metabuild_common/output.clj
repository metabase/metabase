(ns metabuild-common.output
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [colorize.core :as colorize]))

(set! *warn-on-reflection* true)

(def ^:dynamic *steps*
  "Vector of all the parent steps/substeps we're currently in the process of working on. (See [[metabuild-common.steps]]
  for more info."
  [])

(def ^:private step-indent (str/join (repeat 2 \space)))

(defn- steps-indent []
  (str/join (repeat (count *steps*) step-indent)))

(defn safe-println
  "Thread-safe version of `println` that also indents output based on the current step build step."
  [& args]
  (locking println
    (print (steps-indent))
    (apply println args)))

(defn announce
  "Like `safe-println` + `format`, but outputs text in magenta. Use this for printing messages such as when something
  has succeeded."
  ([s]
   (safe-println (colorize/magenta s)))

  ([format-string & args]
   (announce (apply format (str format-string) args))))

(defn error
  "Life `safe-println` + `format`, but outputs text in red. Use this for printing error messages or Exceptions."
  ([s]
   (safe-println (colorize/red s)))

  ([format-string & args]
   (error (apply format format-string args))))

(defn pretty-print-exception
  "Pretty print an Exception when a step fails to stdout."
  [^Throwable e]
  (let [e-map (Throwable->map e)]
    (println (colorize/red (str "Step failed: " (.getMessage e))))
    (binding [pprint/*print-right-margin* 120]
      (pprint/pprint e-map))))
