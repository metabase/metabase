(ns build.plugin-uberjar
  "Shared basis preparation for runtime-loaded plugin uberjars."
  (:require
   [clojure.java.io :as io]
   [clojure.tools.deps.alpha :as deps]
   [clojure.tools.deps.alpha.util.dir :as deps.dir]
   [colorize.core :as colorize]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn project-basis
  "Basis for the `deps.edn` project rooted at `dir`, resolved relative to that directory."
  [dir]
  (let [edn (deps/merge-edns
             ((juxt :root-edn :project-edn)
              (deps/find-edn-maps (u/filename dir "deps.edn"))))]
    (binding [deps.dir/*the-dir* (io/file dir)]
      (deps/calc-basis edn))))

(defonce ^:private metabase-core-basis
  (project-basis u/project-root-directory))

(defonce ^{:doc "Map of core-provided library symbol to the `metabase-core` provider label."}
  metabase-core-provided-libs
  (into {} (map (fn [lib] [lib 'metabase-core])) (keys (:libs metabase-core-basis))))

(defn prune-provided-libs!
  "Remove `lib->provider`'s libraries and classpath entries from `basis`.

  Runtime-loaded plugins share the core classloader, so packaging those libraries again risks duplicate
  classes and linkage errors. `lib->provider` maps each library symbol to the component that supplies it."
  [basis lib->provider]
  (let [provided-lib->provider (into {}
                                     (filter (fn [[lib]]
                                               (get-in basis [:libs lib])))
                                     lib->provider)]
    (doseq [lib (sort (keys (:libs basis)))]
      (u/announce (if-let [provider (get provided-lib->provider lib)]
                    (format "SKIP    %%s (provided by %s)" provider)
                    "INCLUDE %s")
                  (colorize/yellow lib)))
    (let [provided-libs  (set (keys provided-lib->provider))
          provided-paths (into #{} (mapcat #(get-in basis [:libs % :paths])) provided-libs)]
      (-> basis
          (update :classpath-roots #(vec (remove provided-paths %)))
          (update :libs            #(into {} (remove (fn [[lib]] (provided-libs lib))) %))
          (update :classpath       #(into {} (remove (fn [[path]] (provided-paths path))) %))))))
