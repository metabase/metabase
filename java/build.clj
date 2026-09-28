(ns build
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.tools.build.api :as b]))

(defn compile
  "Compile `src/**/*.java` into `target/classes`."
  [_]
  (b/delete {:path "target/classes"})
  (b/javac {:src-dirs   ["src"]
            :class-dir  "target/classes"
            :basis      (b/create-basis {:project "deps.edn"})
            :javac-opts ["--release" "25" "-Xlint:all" "-Werror"]}))
