(ns build
  (:require [clojure.pprint :as pprint]
            [clojure.tools.build.api :as b]))

(def target-dir "target/classes")

(defn aot [_]
  (b/delete {:path target-dir})
  (try
    (b/compile-clj
     {:src-dirs   ["src"]
      :class-dir  target-dir
      :basis      (b/create-basis {:aliases #{:compilation-basis}})
      :ns-compile '[metabase.driver.FixedHiveConnection
                    metabase.driver.FixedHiveDriver]})
    (catch Throwable e
      (println "Error AOT compiling Spark SQL namespaces:" (ex-message e))
      (pprint/pprint (Throwable->map e))
      (b/delete {:path target-dir})
      (throw e))))
