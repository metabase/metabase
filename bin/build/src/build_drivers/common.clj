(ns build-drivers.common
  (:require
   [clojure.tools.deps.alpha :as deps]
   [metabuild-common.core :as u]))

(def ^:dynamic *driver-project-dir* nil)

(def ^:dynamic *target-directory* nil)

(defn driver-project-dir
  "e.g. \"/home/cam/metabase/modules/drivers/redshift\""
  ^String [driver]
  (or *driver-project-dir*
      (u/filename u/project-root-directory "modules" "drivers" (name driver))))

(defn driver-jar-name
  "e.g. \"redshift.metabase-driver.jar\""
  ^String [driver]
  (format "%s.metabase-driver.jar" (name driver)))

(defn driver-jar-destination-directory ^String []
  (or *target-directory*
      (u/filename u/project-root-directory "resources" "modules")))

(defn driver-jar-destination-path
  "e.g. \"/home/cam/metabase/resources/modules/redshift.metabase-driver.jar\""
  ^String [driver]
  (u/filename (driver-jar-destination-directory) (driver-jar-name driver)))

(defn compiled-source-target-dir [driver]
  (u/filename (driver-project-dir driver) "target" "jar"))

(defn driver-edn-filename [driver]
  (u/filename (driver-project-dir driver) "deps.edn"))

(defn- ->absolute [driver path]
  (if (u/absolute? path)
    path
    (u/filename (driver-project-dir driver) path)))

(defn driver-edn [driver edition]
  (let [edn      (deps/merge-edns ((juxt :root-edn :project-edn) (deps/find-edn-maps (driver-edn-filename driver))))
        combined (deps/combine-aliases edn #{edition})]
    (-> (deps/tool edn combined)
        ;; make sure :paths are absolute
        (update :paths (partial mapv (partial ->absolute driver))))))
