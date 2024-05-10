(ns dev.deps-graph
  (:require
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [clojure.java.io :as io]))

(set! *warn-on-reflection* true)

(defn- project-root-directory ^java.io.File []
  (.. (java.nio.file.Paths/get (.toURI (io/resource "dev/deps_graph.clj")))
      toFile          ; /home/cam/metabase/dev/src/dev/deps_graph.clj
      getParentFile   ; /home/cam/metabase/dev/src/dev/
      getParentFile   ; /home/cam/metabase/dev/src/
      getParentFile   ; /home/cam/metabase/dev/
      getParentFile)) ; /home/cam/metabase/

(defn- source-root
  "This is basically a non-hardcoded version of

    (io/file \"/home/cam/metabase/src/metabase\")"
  ^java.io.File []
  (io/file (str (.getAbsolutePath (project-root-directory)) "/src/metabase")))

(defn- find-ns-decls []
  (ns.find/find-ns-decls [(source-root)]))

(defn- module [ns-symb]
  (some-> (re-find #"^metabase\.[^.]+" (str ns-symb)) symbol))

(defn- dependencies []
  (for [decl (find-ns-decls)
        :let [ns-symb (ns.parse/name-from-ns-decl decl)
              deps    (ns.parse/deps-from-ns-decl decl)]]
    {:namespace ns-symb
     :module    (module ns-symb)
     :deps      (into #{}
                      (map (fn [dep-symb]
                             {:namespace dep-symb
                              :module    (module dep-symb)}))
                      deps)}))

(defn external-usages
  "All usages of a module named by `module-symb` outside that module."
  [module-symb]
  (for [dep    (dependencies)
        :when  (not= (:module dep) module-symb)
        ns-dep (:deps dep)
        :when  (= (:module ns-dep) module-symb)]
    {:namespace            (:namespace dep)
     :module               (:module dep)
     :depends-on-namespace (:namespace ns-dep)
     :depends-on-module    (:module ns-dep)}))

(defn externally-used-namespaces
  "All namespaces from a module that are used outside that module."
  [module-symb]
  (into (sorted-set) (map :depends-on-namespace) (external-usages module-symb)))
