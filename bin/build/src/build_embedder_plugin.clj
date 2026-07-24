(ns build-embedder-plugin
  "Build the manifest-based in-process embedder plugin jar."
  (:require
   [build.embedder-model :as embedder-model]
   [build.plugin-uberjar :as plugin-uberjar]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.tasks.uber]
   [metabuild-common.core :as u]
   [org.corfield.log4j2-conflict-handler :refer [log4j2-conflict-handler]]))

(set! *warn-on-reflection* true)

(def ^:private project-dir
  (u/filename u/project-root-directory "modules" "embedder"))

(def jar-path
  "Output path used by packaging and artifact-only smoke tests."
  (u/filename project-dir "target" "metabase-embedder-plugin.jar"))

(defn- plugin-basis
  []
  (-> (plugin-uberjar/project-basis project-dir)
      (plugin-uberjar/prune-provided-libs! plugin-uberjar/metabase-core-provided-libs)
      (dissoc :deps :aliases :mvn/repos)))

(defn build-plugin!
  "Fetch pinned bundles and assemble the separately installable plugin jar."
  [_]
  (u/step "Build metabase-embedder-plugin.jar"
    (embedder-model/fetch-model! nil)
    (let [class-dir (u/filename project-dir "target" "classes")]
      (b/delete {:path class-dir})
      (b/copy-dir {:src-dirs   [(u/filename project-dir "src")
                                (u/filename project-dir "resources")]
                   :target-dir class-dir})
      (b/uber {:class-dir         class-dir
               :uber-file         jar-path
               :basis             (plugin-basis)
               :conflict-handlers log4j2-conflict-handler
               :exclude           ["META-INF/LICENSE"]})
      (u/announce "Created %s" jar-path))))
