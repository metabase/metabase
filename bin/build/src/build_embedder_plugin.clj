(ns build-embedder-plugin
  "Build metabase-embedder-plugin.jar: the modules/embedder source, the bundled INT8 model, and the
  DJL/ONNX Runtime dependency stack — minus every lib the core Metabase uberjar already provides.

  The jar deliberately has no metabase-plugin.yaml manifest: manifest-less jars in the plugins directory
  are classpath-added at boot without loading anything, which is what keeps the DJL/ONNX native init
  deferred until the in-process embedding provider is actually used.

  Usage:

    ./bin/build-embedder-plugin.sh
    # or
    clojure -X:build:build/embedder-plugin

  Output: modules/embedder/target/metabase-embedder-plugin.jar"
  (:require
   [build-drivers.create-uberjar :as create-uberjar]
   [build.embedder-model :as embedder-model]
   [clojure.java.io :as io]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.tasks.uber] ;; workaround for (#50940), same as build-drivers.create-uberjar
   [clojure.tools.deps.alpha :as deps]
   [clojure.tools.deps.alpha.util.dir :as deps.dir]
   [colorize.core :as colorize]
   [metabuild-common.core :as u]
   [org.corfield.log4j2-conflict-handler :refer [log4j2-conflict-handler]]))

(set! *warn-on-reflection* true)

(def ^:private embedder-project-dir
  (u/filename u/project-root-directory "modules" "embedder"))

(def ^:private jar-destination-path
  (u/filename embedder-project-dir "target" "metabase-embedder-plugin.jar"))

(defn- embedder-basis []
  (let [edn (deps/merge-edns
             ((juxt :root-edn :project-edn)
              (deps/find-edn-maps (u/filename embedder-project-dir "deps.edn"))))]
    (binding [deps.dir/*the-dir* (io/file embedder-project-dir)]
      (deps/calc-basis edn))))

(defn- remove-core-provided-libs
  "Drop libs (and their classpath entries) that the core uberjar already provides.
  Same filtering as the driver builds, without the parent-driver layer."
  [basis]
  (let [provided-libs-set  (into #{}
                                 (filter #(get-in basis [:libs %]))
                                 create-uberjar/metabase-core-provided-libs)
        provided-paths-set (into #{} (mapcat #(get-in basis [:libs % :paths])) provided-libs-set)]
    (doseq [lib (sort (keys (:libs basis)))]
      (u/announce (if (provided-libs-set lib)
                    "SKIP    %s (provided by metabase-core)"
                    "INCLUDE %s")
                  (colorize/yellow lib)))
    (-> basis
        (update :classpath-roots #(vec (remove provided-paths-set %)))
        (update :libs            #(into {} (remove (fn [[lib]] (provided-libs-set lib))) %))
        (update :classpath       #(into {} (remove (fn [[path]] (provided-paths-set path))) %))
        ;; remove unneeded keys so the uber task doesn't try to re-resolve anything
        (dissoc :deps :aliases :mvn/repos))))

(defn build-plugin!
  "Fetch the pinned model bundles, then write the plugin jar.
  Clojure sources ship as source: the jar is loaded at runtime long after boot, so there is nothing for
  AOT to speed up, and skipping it avoids baking in core class versions."
  [_]
  (u/step "Build metabase-embedder-plugin.jar"
    (embedder-model/fetch-model! nil)
    (u/step (format "Write uberjar -> %s" jar-destination-path)
      (let [timer     (u/start-timer)
            ;; b/uber packs :class-dir + lib jars only, so the module's source and resources
            ;; (incl. the model bundles) must be staged into the class dir explicitly.
            class-dir (u/filename embedder-project-dir "target" "classes")]
        (b/delete {:path class-dir})
        (b/copy-dir {:src-dirs   [(u/filename embedder-project-dir "src")
                                  (u/filename embedder-project-dir "resources")]
                     :target-dir class-dir})
        (b/uber
         {:class-dir         class-dir
          :uber-file         jar-destination-path
          :basis             (remove-core-provided-libs (embedder-basis))
          ;; merge Log4j2Plugins.dat files. (#50721)
          :conflict-handlers log4j2-conflict-handler
          ;; on MacOS META-INF/LICENSE conflicts with license directories inside dep jars, see:
          ;; https://ask.clojure.org/index.php/13231/switch-tools-build-pull-from-jars-rather-than-exploding-onto
          :exclude           ["META-INF/LICENSE"]})
        (u/announce "Created %s in %d ms." jar-destination-path (u/since-ms timer))))))
