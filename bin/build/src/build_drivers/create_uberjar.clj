(ns build-drivers.create-uberjar
  "Create the uberjar for an individual driver."
  (:require
   [build-drivers.common :as c]
   [build.plugin-uberjar :as plugin-uberjar]
   [clojure.java.io :as io]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.tasks.uber] ;; workaround for (#50940)
   [clojure.tools.deps.alpha :as deps]
   [clojure.tools.deps.alpha.util.dir :as deps.dir]
   [metabuild-common.core :as u]
   [org.corfield.log4j2-conflict-handler :refer [log4j2-conflict-handler]]))

(set! *warn-on-reflection* true)

(defn- driver-basis [driver edition]
  (let [edn (c/driver-edn driver edition)]
    (binding [deps.dir/*the-dir* (io/file (c/driver-project-dir driver))]
      (deps/calc-basis edn))))

(defn- driver-parents [driver edition]
  (when-let [parents (not-empty (:metabase.driver/parents (c/driver-edn driver edition)))]
    (u/announce "Driver has parent drivers %s" (pr-str parents))
    parents))

(defn- parent-provided-libs [driver edition]
  (into {} (for [parent (driver-parents driver edition)
                 lib    (keys (:libs (driver-basis parent edition)))]
             [lib parent])))

(defn- provided-libs
  "Return a map of lib -> provider, where lib is a symbol like `com.h2database/h2` and provider is either
  `metabase-core` or the parent driver that provided that lib."
  [driver edition]
  (into (parent-provided-libs driver edition)
        @plugin-uberjar/metabase-core-provided-libs))

(defn- remove-provided-libs [basis driver edition]
  (plugin-uberjar/prune-provided-libs! basis (provided-libs driver edition)))

(defn- uberjar-basis [driver edition]
  (u/step "Determine which dependencies to include"
    (-> (driver-basis driver edition)
        (remove-provided-libs driver edition)
        ;; remove unneeded keys so Depstar doesn't try to do anything clever and resolve them
        (dissoc :deps :aliases :mvn/repos))))

(defn create-uberjar!
  "Build a driver jar for `driver`, either an `:oss` or `:ee` `edition`."
  [driver edition]
  (u/step (format "Write %s %s uberjar -> %s" driver edition (c/driver-jar-destination-path driver))
    (let [timer (u/start-timer)]
      (b/uber
       {:class-dir         (c/compiled-source-target-dir driver)
        :uber-file         (c/driver-jar-destination-path driver)
        :basis             (uberjar-basis driver edition)
        ;; merge Log4j2Plugins.dat files. (#50721)
        :conflict-handlers log4j2-conflict-handler
        ;; we need to skip this file since on MacOS it conflicts with other licenses, see:
        ;; https://ask.clojure.org/index.php/13231/switch-tools-build-pull-from-jars-rather-than-exploding-onto
        :exclude           ["META-INF/LICENSE"]})
      (u/announce "Created uberjar in %d ms." (u/since-ms timer)))))
