(ns metabase.linters.common
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn source-paths
  "Find all the Metabase Clojure source and test paths to lint."
  []
  (filter (fn [^java.io.File file]
            (and (.isDirectory ^java.io.File file)
                 (not (str/ends-with? (.getName file) "resources"))))
          (classpath/system-classpath)))
