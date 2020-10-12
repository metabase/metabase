(ns metabuild-common.output
  (:require [clojure.string :as str]
            [colorize.core :as colorize]))

(def ^:dynamic *steps* [])

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
  "Like `safe-println` + `format`, but outputs text in magenta. Use this for printing messages such as when starting
  build steps."
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
