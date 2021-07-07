(ns build-drivers.common
  "Shared constants and functions related to source and artifact paths used throughout this code."
  (:require [environ.core :as env]
            [leiningen.core.project :as lein.project]
            [metabuild-common.core :as u]))

(def ^String maven-repository-path
  (u/filename (env/env :user-home) ".m2" "repository"))

;;; -------------------------------------------------- Driver Paths --------------------------------------------------

(defn driver-project-dir
  "e.g. \"/home/cam/metabase/modules/drivers/redshift\""
  [driver]
  (u/filename u/project-root-directory "modules" "drivers" (name driver)))

(defn driver-jar-name
  "e.g. \"redshift.metabase-driver.jar\""
  [driver]
  (format "%s.metabase-driver.jar" (name driver)))

(defn driver-target-directory
  [driver]
  (u/filename (driver-project-dir driver) "target"))

(defn driver-jar-build-path
  "e.g. \"/home/cam/metabase/modules/drivers/redshift/target/uberjar/redshift.metabase-driver.jar\""
  [driver]
  (u/filename (driver-target-directory driver) "uberjar" (driver-jar-name driver)))

(def ^String driver-jar-destination-directory
  (u/filename u/project-root-directory "resources" "modules"))

(defn driver-jar-destination-path
  "e.g. \"/home/cam/metabase/resources/modules/redshift.metabase-driver.jar\""
  ^String [driver]
  (u/filename driver-jar-destination-directory (driver-jar-name driver)))

(defn- lein-project-map
  "Read the `project.clj` file for `driver` and return it as a map."
  [driver & profiles]
  (let [project-filename (u/assert-file-exists (u/filename (driver-project-dir driver) "project.clj"))]
    (lein.project/read project-filename profiles)))

(defn has-edition-profile?
  "Whether `driver` has a separate profile for `edition`, e.g. `:ee`. This means this version of the driver is different
  from other versions of the driver (e.g. :ee Oracle ships with the non-free Oracle JDBC driver, :oss does not)."
  [driver edition]
  (let [has-profile? (boolean
                      (contains? (:profiles (lein-project-map driver)) edition))]
    (u/safe-println (format "%s %s have a separate %s profile" driver (if has-profile? "DOES" "DOES NOT") edition))
    has-profile?))

(defn edition-checksum-prefix
  "Prefix to add to checksums of driver for `edition` -- normally this is `nil`, but if the driver has a specific
  profile for `edition` (e.g. Oracle has a different profile for `:ee` builds) this is a prefix to make the checksum
  different from the normal one."
  [driver edition]
  (when (has-edition-profile? driver edition)
    (format "%s-" (name edition))))

(defn driver-checksum-filename
  "e.g. \"/home/cam/metabase/modules/drivers/redshift/target/checksum.md5\""
  [driver]
  (u/filename (driver-project-dir driver) "target" "checksum.md5"))

(defn driver-plugin-manifest-filename
  "e.g. \"/home/cam/metabase/modules/drivers/bigquery/resources/plugin-manifest.yaml\""
  [driver]
  (u/filename (driver-project-dir driver) "resources" "metabase-plugin.yaml"))


;;; ------------------------------------------ Metabase Local Install Paths ------------------------------------------

(def ^String metabase-uberjar-path
  "e.g. \"home/cam/metabase/target/uberjar/metabase.jar\""
  (u/filename u/project-root-directory "target" "uberjar" "metabase.jar"))
