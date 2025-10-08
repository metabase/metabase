(ns representation.manifest
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [representation.util :as u]))

(set! *warn-on-reflection* true)

(defn read-manifest
  "Read and parse manifest file.
   Returns map with :collections key mapping names to paths."
  [manifest-path]
  (u/debug "Reading manifest from" manifest-path)
  (when-let [f (io/file manifest-path)]
    (when (.exists f)
      (edn/read-string (slurp f)))))

(defn get-collection-path
  "Get filesystem path for a collection from manifest."
  [manifest collection-name]
  (get-in manifest [:collections collection-name]))

(defn parse-collection-names
  "Parse comma-separated collection names string."
  [coll-str]
  (when coll-str
    (map clojure.string/trim (clojure.string/split coll-str #","))))
