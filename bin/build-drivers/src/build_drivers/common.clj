(ns build-drivers.common
  (:require [clojure.java.io :as io]
            [clojure.tools.deps.alpha :as deps]
            [clojure.tools.deps.alpha.util.dir :as deps.dir]
            [metabuild-common.core :as u]
            [yaml.core :as yaml])
  (:import [java.util.zip ZipEntry ZipFile]))

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

(defn current-deps-project-root
  "Returns the root of the current `deps.edn` project (ex: a third party driver, or Metabase itself is running from the
  core project root).  See [[clojure.tools.deps.alpha/find-edn-maps]] for justification of this impl (we use the same
  underlying var here)."
  []
  deps.dir/*the-dir*)

(defn- ->absolute [_driver path]
  (if (u/absolute? path)
    path
    (u/filename (current-deps-project-root) path)))

(defn driver-edn [driver edition]
  (let [edn      (deps/merge-edns ((juxt :root-edn :project-edn) (deps/find-edn-maps (driver-edn-filename driver))))
        combined (deps/combine-aliases edn #{edition})]
    (-> (deps/tool edn combined)
        ;; make sure :paths are absolute
        (update :paths (partial mapv (partial ->absolute driver))))))

(defn get-jar-entry ^ZipEntry [^String jar-path ^String filename]
  (with-open [zip-file (ZipFile. jar-path)]
    (first
      (filter
        (fn [^ZipEntry zip-entry]
          (= (str zip-entry) filename))
        (enumeration-seq (.entries zip-file))))))

(defn jar-contains-file? [^String jar-path ^String filename]
  (some? (get-jar-entry jar-path filename)))

(defn get-driver-manifest-yaml
  "For the given `driver`, return the manifest file from its jar file, in the form of a [[ZipEntry]]."
  ^ZipEntry [driver]
  (when-let [jar-filename (driver-jar-destination-path driver)]
    (get-jar-entry jar-filename "metabase-plugin.yaml")))

(defn driver-manifest->yml
  "For the given `jar-filename`, extract the given `manifest-entry` from the jar file, and return the parsed YAML
  contents."
  ([]
   (let [yaml-file (io/file (current-deps-project-root) "resources/metabase-plugin.yaml")]
     (if (.exists yaml-file)
       (yaml/parse-string (slurp yaml-file))
       (throw (ex-info (format "No resources/metabase-plugin.yaml file found in %s"
                               (current-deps-project-root))
                {})))))
  ([jar-filename manifest-entry]
   (with-open [zip-file (ZipFile. jar-filename)]
     (let [entry-is (.getInputStream zip-file manifest-entry)
           yaml-str (slurp entry-is)]
       (yaml/parse-string yaml-str)))))
