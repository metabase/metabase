(ns build-drivers.common
  (:require
   [clojure.tools.deps.alpha :as deps]
   [metabuild-common.core :as u]))

(def ^:dynamic *driver-project-dir*
  "Override [[driver-project-dir]]."
  nil)

(def ^:dynamic *target-directory*
  "Override the target directory where we'll put the finished uberjar ([[driver-jar-destination-directory]])."
  nil)

(defn driver-project-dir
  "e.g. \"/home/cam/metabase/modules/drivers/redshift\""
  ^String [driver]
  (or *driver-project-dir*
      (u/filename u/project-root-directory "modules" "drivers" (name driver))))

(defn- driver-jar-name
  "e.g. \"redshift.metabase-driver.jar\""
  ^String [driver]
  (format "%s.metabase-driver.jar" (name driver)))

(defn- driver-jar-destination-directory ^String []
  (or *target-directory*
      (u/filename u/project-root-directory "resources" "modules")))

(defn driver-jar-destination-path
  "e.g. \"/home/cam/metabase/resources/modules/redshift.metabase-driver.jar\""
  ^String [driver]
  (u/filename (driver-jar-destination-directory) (driver-jar-name driver)))

(defn compiled-source-target-dir
  "Directory compiled source lives in, e.g.

    \"/home/cam/metabase/modules/drivers/redshift/target/jar\""
  [driver]
  (u/filename (driver-project-dir driver) "target" "jar"))

(defn driver-edn-filename
  "Driver deps.edn filename, e.g.

    \"/home/cam/metabase/modules/drivers/redshift/deps.edn\""
  [driver]
  (u/filename (driver-project-dir driver) "deps.edn"))

(defn- ->absolute [driver path]
  (if (u/absolute? path)
    path
    (u/filename (driver-project-dir driver) path)))

(defn driver-edn
  "Parsed `deps.edn` file for `driver` with the `:oss` or `:ee` aliases merged in, if present, based on `edition`."
  [driver edition]
  (let [edn      (deps/merge-edns ((juxt :root-edn :project-edn) (deps/find-edn-maps (driver-edn-filename driver))))
        combined (deps/combine-aliases edn #{edition})]
    (-> (deps/tool edn combined)
        ;; make sure :paths are absolute
        (update :paths (partial mapv (partial ->absolute driver))))))
