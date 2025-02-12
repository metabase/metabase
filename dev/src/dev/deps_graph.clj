(ns dev.deps-graph
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [lambdaisland.deep-diff2 :as ddiff]
   [clojure.walk :as walk]))

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
  (io/file (str (.getAbsolutePath (project-root-directory)) "/src")))

(defn- enterprise-source-root
  ^java.io.File []
  (io/file (str (.getAbsolutePath (project-root-directory)) "/enterprise/backend/src")))

(defn- drivers-source-roots
  []
  (for [file (.listFiles (io/file (str (.getAbsolutePath (project-root-directory)) "/modules/drivers")))]
    (io/file file "src")))

(defn- find-ns-decls []
  (ns.find/find-ns-decls (concat [(source-root) (enterprise-source-root)] (drivers-source-roots))))

(defn- module
  "E.g.

    (module 'metabase.qp.middleware.wow) => 'qp
    (module 'metabase-enterprise.whatever.core) => enterprise/whatever"
  [ns-symb]
  (or (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
               second
               (symbol "enterprise"))
      (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
              second
              symbol)))

(def ^{:arglists '([])} dependencies
  (memoize/ttl
   (fn []
     (mapv (fn [decl]
             (let [ns-symb (ns.parse/name-from-ns-decl decl)
                   deps    (ns.parse/deps-from-ns-decl decl)]
               {:namespace ns-symb
                :module    (module ns-symb)
                :deps      (into #{}
                                 (keep (fn [dep-symb]
                                         (when-let [module (module dep-symb)]
                                           {:namespace dep-symb
                                            :module    module})))
                                 deps)}))
           (find-ns-decls)))
   ;; memoize for one second
   :ttl/threshold 1000))

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

(defn external-usages-by-namespace
  "Return a map of module namespace => set of external namespaces using it"
  [module-symb]
  (into (sorted-map)
        (map (fn [[k v]]
               [k (into (sorted-set) (map :namespace) v)]))
        (group-by :depends-on-namespace (external-usages module-symb))))

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
  meant to make it easier to fill out the `:metabase/modules` `:uses` section of the Kondo config, or to figure out
  which ones can easily get a consolidated API namespace without drama."
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

(defn full-dependencies
  "Like [[dependencies]] but also includes transient dependencies."
  []
  (let [deps-graph  (module-dependencies)
        expand-deps (fn expand-deps [deps]
                      (let [deps' (into (sorted-set)
                                        (mapcat deps-graph)
                                        deps)]
                        (if (= deps deps')
                          deps
                          (expand-deps deps'))))]
    (into (sorted-map)
          (map (fn [[k v]]
                 [k (expand-deps v)]))
          deps-graph)))

(defn module-dependencies-mermaid []
  (doseq [[module deps] (module-dependencies)
          dep deps]
    (printf "%s-->%s\n" module dep)))

(defn generate-config
  "Generate the Kondo config that should go in `.clj-kondo/config/modules/config.edn`."
  []
  (into (sorted-map)
        (map (fn [[module uses]]
               [module {:api (externally-used-namespaces module)
                        :uses uses}]))
        (module-dependencies)))

(defn kondo-config
  "Read out the Kondo config for the modules linter."
  []
  (-> (with-open [r (java.io.PushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
        (edn/read r))
      :metabase/modules
      ;; ignore the config for [[metabase.connection-pool]] which comes from one of our libraries.
      (dissoc 'connection-pool)))

(defn- kondo-config-diff-ignore-any
  "Ignore entries in the config that use `:any`."
  [diff]
  (walk/postwalk
   (fn [x]
     (when-not (and (instance? lambdaisland.deep_diff2.diff_impl.Mismatch x)
                    (= (:- x) :any)
                    (set? (:+ x))
                    (seq (:+ x)))
       x))
   diff))

(defn kondo-config-diff
  []
  (-> (ddiff/diff (kondo-config) (generate-config))
      ddiff/minimize
      kondo-config-diff-ignore-any
      ddiff/minimize))

(defn print-kondo-config-diff
  "Print the diff between how the config would look if regenerated with [[generate-config]] versus how it looks in
  reality ([[kondo-config]]). Use this to suggest updates to make to the config file."
  []
  (ddiff/pretty-print (kondo-config-diff)))
