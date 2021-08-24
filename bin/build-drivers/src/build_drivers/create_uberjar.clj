(ns build-drivers.create-uberjar
  (:require [build-drivers.common :as c]
            [clojure.java.io :as io]
            [clojure.tools.build.api :as build]
            [clojure.tools.deps.alpha :as deps]
            [clojure.tools.deps.alpha.util.dir :as deps.dir]
            [colorize.core :as colorize]
            [hf.depstar.api :as depstar]
            [metabuild-common.core :as u]))

(defn driver-basis [driver edition]
  (let [edn (c/driver-edn driver edition)]
    (binding [deps.dir/*the-dir* (io/file (c/driver-project-dir driver))]
      (deps/calc-basis edn))))

(defonce metabase-core-edn
  (deps/merge-edns
   ((juxt :root-edn :project-edn)
    (deps/find-edn-maps (u/filename u/project-root-directory "deps.edn")))))

(defonce metabase-core-basis
  (binding [deps.dir/*the-dir* (io/file u/project-root-directory)]
    (deps/calc-basis metabase-core-edn)))

(defonce metabase-core-provided-libs
  (set (keys (:libs metabase-core-basis))))

(defn driver-parents [driver edition]
  (when-let [parents (not-empty (:metabase.build-driver/parents (c/driver-edn driver edition)))]
    (u/announce "Driver has parent drivers %s" (pr-str parents))
    parents))

(defn parent-provided-libs [driver edition]
  (into {} (for [parent (driver-parents driver edition)
                 lib    (keys (:libs (driver-basis parent edition)))]
             [lib parent])))

(defn remove-provided-libs [libs driver edition]
  (let [parent-provided (parent-provided-libs driver edition)]
    (into {} (for [[lib info] (sort-by first (seq libs))
                   :let       [provider (if (contains? metabase-core-provided-libs lib)
                                          "metabase-core"
                                          (get parent-provided lib))
                               _ (u/announce (if provider
                                               (format "SKIP    %%s (provided by %s)" provider)
                                               "INCLUDE %s")
                                             (colorize/yellow lib))]
                   :when      (not provider)]
               [lib info]))))

(defn uberjar-basis [driver edition]
  (u/step "Determine which dependencies to include"
    (update (driver-basis driver edition) :libs remove-provided-libs driver edition)))

(defn create-uberjar! [driver edition]
  (u/step (format "Write %s %s uberjar -> %s" driver edition (c/driver-jar-destination-path driver))
    (let [start-time-ms (System/currentTimeMillis)]
      (depstar/uber
       {:class-dir (c/compiled-source-target-dir driver)
        :uber-file (c/driver-jar-destination-path driver)
        :basis     (uberjar-basis driver edition)})
      (u/announce "Created uberjar in %d ms." (- (System/currentTimeMillis) start-time-ms)))))
