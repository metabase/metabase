(ns build
  (:require [clojure.tools.build.api :as b]))

(defn aot [_]
  (b/compile-clj
   {:src-dirs   ["src"]
    :class-dir  "target/classes"
    :basis      (b/create-basis {:aliases #{:compilation-basis}})
    :ns-compile '[metabase.driver.FixedHiveConnection
                  metabase.driver.FixedHiveDriver]}))
