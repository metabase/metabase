(ns build-drivers.common
  "Shared constants and functions related to source and artifact paths used throughout this code."
  (:require [environ.core :as env]
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
  [driver]
  (u/filename driver-jar-destination-directory (driver-jar-name driver)))

(defn driver-checksum-filename
  "e.g. \"/home/cam/metabase/modules/drivers/redshift/target/checksum.txt\""
  [driver]
  (u/filename (driver-project-dir driver) "target" "checksum.txt")) ; TODO - rename to checksum.md5

(defn driver-plugin-manifest-filename
  "e.g. \"/home/cam/metabase/modules/drivers/bigquery/resources/plugin-manifest.yaml\""
  [driver]
  (u/filename (driver-project-dir driver) "resources" "metabase-plugin.yaml"))


;;; ------------------------------------------ Metabase Local Install Paths ------------------------------------------

(def ^String metabase-uberjar-path
  "e.g. \"home/cam/metabase/target/uberjar/metabase.jar\""
  (u/filename u/project-root-directory "target" "uberjar" "metabase.jar"))
