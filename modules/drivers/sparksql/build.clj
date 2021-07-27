(ns build
  (:require [clojure.pprint :as pprint]
            [clojure.tools.build.api :as b]))

(defn aot [_]
  (try
    (b/compile-clj
     {:src-dirs   ["src"]
      :class-dir  "target/classes"
      :basis      (b/create-basis {:aliases #{:compilation-basis}})
      :ns-compile '[metabase.driver.FixedHiveConnection
                    metabase.driver.FixedHiveDriver]})
    (catch Throwable e
      (println "Error AOT compiling Spark SQL namespaces:" (ex-message e))
      (pprint/pprint (Throwable->map e))
      (throw e))))
