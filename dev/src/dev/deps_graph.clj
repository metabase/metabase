(ns dev.deps-graph
  (:require
   [clojure.java.io :as io]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]))

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
                      (keep (fn [dep-symb]
                              (when-let [module (module dep-symb)]
                                {:namespace dep-symb
                                 :module    module})))
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

(defn module-dependencies
  "Build a graph of module => set of modules it refers to."
  ([]
   (letfn [(reduce-module-deps [module-deps module deps]
             (reduce
              (fn [module-deps {dep-module :module, :as _dep}]
                (cond-> module-deps
                  (not= dep-module module) (conj dep-module)))
              (or module-deps (sorted-set))
              deps))
           (reduce-deps [module->deps {:keys [module deps]}]
             (update module->deps module reduce-module-deps module deps))]
     (reduce reduce-deps (sorted-map) (dependencies))))

  ([module]
   (get (module-dependencies) module)))

(defn circular-dependencies
  "Build a graph of module => set of modules it refers to that also refer to this module."
  ([]
   (let [module->deps (module-dependencies)]
     (letfn [(circular-dependency? [module-x module-y]
               (and (contains? (get module->deps module-x) module-y)
                    (contains? (get module->deps module-y) module-x)))
             (circular-deps [module]
               (let [module-deps (get module->deps module)]
                 (not-empty (into (sorted-set)
                                  (filter (fn [dep]
                                            (circular-dependency? module dep)))
                                  module-deps))))]
       (into (sorted-map)
             (keep (fn [module]
                     (when-let [circular-deps (circular-deps module)]
                       [module circular-deps])))
             (keys module->deps)))))

  ([module]
   (get (circular-dependencies) module)))

(defn non-circular-module-dependencies
  "A graph of [[module-dependencies]], but with modules that have any circular dependencies filtered out. This is mostly
  meant to make it easier to fill out the `:metabase/ns-module-checker` `:allowed-modules` section of the Kondo
  config, or to figure out which ones can easily get a consolidated API namespace without drama."
  []
  (let [circular-dependencies (circular-dependencies)]
    (into (sorted-map)
          (remove (fn [[module _deps]]
                    (contains? circular-dependencies module)))
          (module-dependencies))))

(defn module-usages-of-other-module
  "Information about how `module-x` uses `module-y`."
  [module-x module-y]
  (let [module-x-ns->module-y-ns   (->> (external-usages module-y)
                                        (filter #(= (:module %) module-x))
                                        (map (juxt :namespace :depends-on-namespace)))]
    (reduce
     (fn [m [module-x-ns module-y-ns]]
       (update m module-x-ns (fn [deps]
                               (conj (or deps (sorted-set)) module-y-ns))))
     (sorted-map)
     module-x-ns->module-y-ns)))
