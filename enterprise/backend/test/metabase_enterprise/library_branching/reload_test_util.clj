(ns metabase-enterprise.library-branching.reload-test-util
  "Reloads library-branching namespaces in a running JVM. A plain `(require 'ns :reload)` of a namespace with a
  `defprotocol` defines the protocol again, and every `reify`, `defrecord` and `deftype` made before it no longer
  implements it. [[reload!]] reloads the namespaces together with their dependents, so each protocol and its
  implementations are defined again together."
  (:require
   [clojure.java.io :as io]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]))

(set! *warn-on-reflection* true)

(defn- folder
  "The folder of the classpath resource `path`."
  [path]
  (.getParentFile (io/file (or (io/resource path)
                               (throw (ex-info (str "No classpath resource " path) {:path path}))))))

(defn- module-folders
  "The source folder and the test folder of the module."
  []
  [(folder "metabase_enterprise/library_branching/instance.clj")
   (folder "metabase_enterprise/library_branching/reload_test_util.clj")])

(defn module-deps
  "`{ns #{dep}}`: each namespace of the module's source and test folders, with the namespaces it requires, as its file
  declares them now."
  []
  (into {}
        (comp (mapcat #(ns.find/find-ns-decls-in-dir % ns.find/clj))
              (map (juxt ns.parse/name-from-ns-decl ns.parse/deps-from-ns-decl)))
        (module-folders)))

(defn deps-graph
  "The dependency graph of `deps`, a map `{ns #{dep}}`."
  [deps]
  (reduce-kv (fn [g n ds] (reduce #(ns.deps/depend %1 n %2) g ds))
             (ns.deps/graph)
             deps))

(defn reload-order
  "The namespaces that a reload of the namespaces `changed` reloads, in order: each of `changed`, and each namespace
  that depends on one of them in `graph`, directly or not, and for which `loaded?` is true. Each namespace comes after
  every namespace of the result that it depends on, directly or not."
  [graph changed loaded?]
  (let [changed (set changed)]
    (->> (ns.deps/transitive-dependents-set graph changed)
         (filter loaded?)
         (into changed)
         (sort (ns.deps/topo-comparator graph))
         vec)))

(defn reload!
  "Reloads `nses`, namespaces of the module's source or test folders, and each loaded namespace of those folders that
  depends on one of them, directly or not, with `(require ns :reload)`, in [[reload-order]]. Returns the reloaded
  namespaces in order. Throws, and reloads nothing, when a namespace of `nses` has no file in those folders. A load
  that throws stops the reload: the namespaces after it keep their old definitions."
  [& nses]
  (let [deps    (module-deps)
        unknown (remove deps nses)]
    (when (seq unknown)
      (throw (ex-info (str "Not a namespace of library branching: " (pr-str (vec unknown))) {:namespaces unknown})))
    (let [order (reload-order (deps-graph deps) nses #(some? (find-ns %)))]
      (doseq [n order]
        (require n :reload))
      order)))
