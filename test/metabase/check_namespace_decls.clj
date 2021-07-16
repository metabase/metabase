(ns metabase.check-namespace-decls
  (:require [check-namespace-decls.core :as check-ns]
            [clojure.java.classpath :as classpath]
            [clojure.string :as str]))

(defn check-namespace-decls [options]
  (check-ns/check-namespace-decls
   (merge
    {:source-paths (filter (fn [^java.io.File file]
                             (and (.isDirectory ^java.io.File file)
                                  (not (str/ends-with? (.getName file) "resources"))))
                           (classpath/system-classpath))}
    options)))
