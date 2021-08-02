(ns build
  (:require [clojure.tools.build.api :as b]))

(defn compile-java [_]
  (b/javac
   {:src-dirs   ["."]
    :class-dir  "target/classes"
    :basis      (b/create-basis {:aliases #{:compilation-basis}})
    :javac-opts ["-source" "8", "-target" "8"]}))
