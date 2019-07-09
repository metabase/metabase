(ns metabase.util.yaml
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [yaml.core :as yaml])
  (:import [java.nio.file FileSystem FileSystems Path]))

(defmacro with-resource
  "Setup all the JVM scaffolding to be able to treat /resources dir in a JAR the same as a normal directory.
  Ie. support directory listing and such."
  [[identifier path] & body]
  `(let [[jar# path#] (-> ~path io/resource .toURI .toString (str/split #"!" 2))]
     (if path#
       (with-open [^FileSystem fs# (-> jar#
                                       java.net.URI/create
                                       (FileSystems/newFileSystem (java.util.HashMap.)))]
         (let [~identifier (.getPath fs# path# (into-array String []))]
           ~@body))
       (let [~identifier (.getPath (FileSystems/getDefault) (.getPath ~path) (into-array String []))]
         ~@body))))

(defn load-yaml
  "Load YAML at path `f`, parse it, and (optionally) pass the result to `constructor` fn."
  ([f] (load-yaml identity f))
  ([constructor ^Path f]
   (try
     (->> f
          .toUri
          slurp
          yaml/parse-string
          constructor)
     (catch Exception e
       (log/error (trs "Error parsing {0}:\n{1}"
                       (.getFileName f)
                       (or (some-> e
                                   ex-data
                                   (select-keys [:error :value])
                                   u/pprint-to-str)
                           e)))
       (throw e)))))
