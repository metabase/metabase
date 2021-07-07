(ns metabuild-common.output
  (:require [clojure
             [pprint :as pprint]
             [string :as str]]
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

(defn pretty-print-exception [^Throwable e]
  (let [e-map (Throwable->map e)]
    (println (colorize/red (str "Step failed: " (.getMessage e))))
    (binding [pprint/*print-right-margin* 120]
      (pprint/pprint e-map))))

(defn format-bytes
  "Nicely format `num-bytes` in a human-readable way (e.g. KB/MB/etc.)"
  [num-bytes]
  (loop [n num-bytes [suffix & more] ["B" "KB" "MB" "GB"]]
    (if (and (seq more)
             (>= n 1024))
      (recur (/ n 1024.0) more)
      (format "%.1f %s" n suffix))))
