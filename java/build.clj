(ns build
  (:require [clojure.pprint :as pprint]
            [clojure.tools.build.api :as b]))

(def target-dir "target/classes")

(defn compile-java [_]
  (b/delete {:path target-dir})
  (try
    (b/javac
     {:src-dirs   ["."]
      :class-dir  target-dir
      :basis      (b/create-basis {:aliases #{:compilation-basis}})
      :javac-opts ["-source" "8", "-target" "8"]})
    (catch Throwable e
      (println "Error compiling Java sources:" (ex-message e))
      (pprint/pprint (Throwable->map e))
      (b/delete {:path target-dir})
      (throw e))))
