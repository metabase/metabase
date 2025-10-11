(ns representation.util
  (:require [clojure.java.io :as io]
            [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^String project-root-directory
  "Root directory of the repo."
  (.. (java.io.File. (.toURI (io/resource "representation/util.clj")))
      getParentFile
      getParentFile
      getParentFile
      getCanonicalPath))

(defn env
  "Get environment variable value."
  ([]
   (into {} (System/getenv)))
  ([env-var]
   (System/getenv env-var))
  ([env-var default-val]
   (or (System/getenv env-var) default-val)))

(defn debug
  "Print debug info when REPR_DEBUG is set."
  [& content]
  (when (env "REPR_DEBUG")
    (binding [*out* *err*]
      (apply println "[DEBUG]" content)
      (flush))))
