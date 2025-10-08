#!/usr/bin/env bb

(ns representation
  (:require [babashka.tasks :as bt]
            [clojure.string :as str]
            [representation.color :as c]))

(set! *warn-on-reflection* true)

(defn- summarize-exception [^Exception e]
  (cond-> {:exception-type (-> e class .getName)
           :ex-message (.getMessage e)}
    (instance? clojure.lang.ExceptionInfo e)
    (assoc :data (ex-data e))
    (.getCause e)
    (assoc :cause (summarize-exception (.getCause e)))))

(defn- handle-exception [e]
  (let [message (ex-message e)
        data (ex-data e)]
    (when (and e (not (:repr/error data)))
      (println (c/yellow "\nException:\n")
               (if (System/getenv "REPR_DEBUG")
                 e
                 (summarize-exception e))))

    (when (and message (not (str/blank? message)))
      (println (c/red (c/reverse-color "ex-message : ")) message))

    (when data
      (println (c/yellow (c/reverse-color "ex-data    : "))
               (pr-str (dissoc data :repr/error))))

    (when (:repr/error data)
      (println (c/blue (c/reverse-color "repr/error : "))
               (:repr/error data)))

    (System/exit (:babashka/exit data 1))))

(defn- print-help []
  (println (c/bold " ✨ Metabase Representations CLI ✨"))
  (println "")
  (println "Manage Metabase collections as YAML files for version control.")
  (println "")
  (println "Usage: ./bin/representation.bb <command> [options]")
  (println "")
  (println "Commands:")
  (println "  export    Export collections from Metabase to local files")
  (println "  import    Import collections from local files to Metabase")
  (println "  lint      Validate collections without importing")
  (println "")
  (println "Run './bin/representation.bb <command> -h' for command-specific help.")
  (println ""))

(defn- invalid-task? []
  (let [task (first *command-line-args*)
        valid-tasks #{"export" "import" "lint"}]
    (and task (not (contains? valid-tasks task)))))

(defn -main [& _]
  (cond
    (or (nil? *command-line-args*)
        (= *command-line-args* ["-h"])
        (= *command-line-args* ["--help"]))
    (print-help)

    (invalid-task?)
    (do
      (println (c/red "Unknown command:" (first *command-line-args*)))
      (print-help)
      (System/exit 1))

    :else
    (try
      (let [[task & args] *command-line-args*]
        (binding [*command-line-args* args]
          (bt/run task)))
      (catch Exception e
        (handle-exception e)))))

(-main)
