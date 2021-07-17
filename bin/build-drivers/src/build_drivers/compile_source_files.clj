(ns build-drivers.compile-source-files
  (:require [build-drivers.common :as c]
            [clojure.java.io :as io]
            [clojure.tools.namespace.find :as tools.ns.find]
            [metabuild-common.core :as u]
            potemkin.macros))

(defn driver-source-paths [driver edition]
  (for [path (:paths (c/driver-edn driver edition))]
    (u/filename (c/driver-project-dir driver) path)))

(defn source-path-namespaces [source-paths]
  (mapcat
   (fn [path]
     (tools.ns.find/find-namespaces-in-dir (io/file path)))
   source-paths))

(defn compile-clojure-source-files! [driver edition]
  (u/step "Compile clojure source files"
    (let [start-time-ms (System/currentTimeMillis)
          source-paths  (driver-source-paths driver edition)
          target-dir    (c/compiled-source-target-dir driver)
          namespaces    (source-path-namespaces source-paths)]
      (u/announce "Compiling Clojure source files in %s to %s" (pr-str source-paths) target-dir)
      (u/create-directory-unless-exists! target-dir)
      (u/announce "Compiling namespaces %s" (pr-str namespaces))
      ;; force Potemkin to recompile classes
      (with-redefs [potemkin.macros/equivalent? (constantly false)]
        (binding [*compile-path* target-dir]
          (doseq [a-namespace namespaces]
            (#'clojure.core/serialized-require a-namespace)
            (compile a-namespace))))
      (u/announce "Compiled %d namespace(s) in %d ms."
                  (count namespaces)
                  (- (System/currentTimeMillis) start-time-ms)))))
