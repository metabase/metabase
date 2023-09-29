(ns build-drivers.create-uberjar
  (:require
   [build-drivers.common :as c]
   [clojure.java.io :as io]
   [clojure.tools.deps.alpha :as deps]
   [clojure.tools.deps.alpha.util.dir :as deps.dir]
   [colorize.core :as colorize]
   [hf.depstar.api :as depstar]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn- driver-basis [driver edition]
  (let [edn (c/driver-edn driver edition)]
    (binding [deps.dir/*the-dir* (io/file (c/driver-project-dir driver))]
      (deps/calc-basis edn))))

(defonce ^:private metabase-core-edn
  (deps/merge-edns
   ((juxt :root-edn :project-edn)
    (deps/find-edn-maps (u/filename u/project-root-directory "deps.edn")))))

(defonce ^:private metabase-core-basis
  (binding [deps.dir/*the-dir* (io/file u/project-root-directory)]
    (deps/calc-basis metabase-core-edn)))

(defonce ^:private metabase-core-provided-libs
  (set (keys (:libs metabase-core-basis))))

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
        (map (fn [lib]
               [lib 'metabase-core]))
        metabase-core-provided-libs))

(defn- remove-provided-libs [basis driver edition]
  (let [provided-lib->provider (into {}
                                     (filter (fn [[lib]]
                                               (get-in basis [:libs lib])))
                                     (provided-libs driver edition))]
    ;; log which libs we're including and excluding.
    (doseq [lib (sort (keys (:libs basis)))]
      (u/announce (if-let [provider (get provided-lib->provider lib)]
                    (format "SKIP    %%s (provided by %s)" provider)
                    "INCLUDE %s")
                  (colorize/yellow lib)))
    ;; now remove the provide libs from `:classpath`, `:classpath-roots`, and `:libs`
    (let [provided-libs-set  (into #{} (keys provided-lib->provider))
          provided-paths-set (into #{} (mapcat #(get-in basis [:libs % :paths])) provided-libs-set)]
      (-> basis
          (update :classpath-roots #(vec (remove provided-paths-set %)))
          (update :libs            #(into {} (remove (fn [[lib]] (provided-libs-set lib))) %))
          (update :classpath       #(into {} (remove (fn [[path]] (provided-paths-set path))) %))))))

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
    (let [start-time-ms (System/currentTimeMillis)]
      (depstar/uber
       {:class-dir (c/compiled-source-target-dir driver)
        :uber-file (c/driver-jar-destination-path driver)
        :basis     (uberjar-basis driver edition)})
      (u/announce "Created uberjar in %d ms." (- (System/currentTimeMillis) start-time-ms)))))
