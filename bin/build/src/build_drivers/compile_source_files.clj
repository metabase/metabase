(ns build-drivers.compile-source-files
  (:require
   [build-drivers.common :as c]
   [clojure.java.io :as io]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn- driver-source-paths [driver edition]
  (let [dirs (:paths (c/driver-edn driver edition))]
    (assert (every? u/absolute? dirs)
            (format "All dirs should be absolute, got: %s" (pr-str dirs)))
    dirs))

(defn- dependencies-graph
  "Return a `clojure.tools.namespace` dependency graph of namespaces named by `ns-symbol`."
  [ns-decls]
  (reduce
   (fn [graph ns-decl]
     (let [ns-symbol (ns.parse/name-from-ns-decl ns-decl)]
       (reduce
        (fn [graph dep]
          (ns.deps/depend graph ns-symbol dep))
        graph
        (ns.parse/deps-from-ns-decl ns-decl))))
   (ns.deps/graph)
   ns-decls))

(defn source-path-namespaces
  "Topologically sort the namespaces so we don't end up with weird compilation issues."
  [source-paths]
  (let [ns-decls   (mapcat
                    (comp ns.find/find-ns-decls-in-dir io/file)
                    source-paths)
        ns-symbols (set (map ns.parse/name-from-ns-decl ns-decls))]
    (->> (dependencies-graph ns-decls)
         ns.deps/topo-sort
         (filterv ns-symbols))))

(defn compile-clojure-source-files!
  "Compile the Clojure source files for a driver."
  [driver edition]
  (u/step "Compile clojure source files"
    (let [start-time-ms (System/currentTimeMillis)
          source-paths  (driver-source-paths driver edition)
          target-dir    (c/compiled-source-target-dir driver)
          namespaces    (source-path-namespaces source-paths)]
      (u/announce "Compiling Clojure source files in %s to %s" (pr-str source-paths) target-dir)
      (u/create-directory-unless-exists! target-dir)
      (u/announce "Compiling namespaces %s" (pr-str namespaces))
      (binding [*compile-path* target-dir]
        (doseq [a-namespace namespaces]
          (#'clojure.core/serialized-require a-namespace)
          (compile a-namespace)))
      (u/announce "Compiled %d namespace(s) in %d ms."
                  (count namespaces)
                  (- (System/currentTimeMillis) start-time-ms)))))
