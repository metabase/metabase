(ns build-drivers.common
  "Shared constants and functions related to source and artifact paths used throughout this code."
  (:require [clojure.string :as str]
            [environ.core :as env])
  (:import java.io.File))

;; since this file is used pretty much everywhere, this seemed like a good place to put this.
(set! *warn-on-reflection* true)

(when-not (str/ends-with? (env/env :user-dir) "/build-drivers")
  (throw (ex-info "Please run build-driver scripts from the `bin/build-drivers` directory e.g. `cd bin/build-drivers; clojure -m build-driver`"
                  {:user-dir (env/env :user-dir)})))

(defn env-or-throw
  "Fetch an env var value or throw an Exception if it is unset."
  [k]
  (or (get env/env k)
      (throw (Exception. (format "%s is unset. Please set it and try again." (str/upper-case (str/replace (name k) #"-" "_")))))))

(defn filename [& path-components]
  (str/join File/separatorChar path-components))

(def ^String project-root-directory
  "e.g. /Users/cam/metabase"
  (.. (File. ^String (env/env :user-dir)) getParentFile getParentFile getAbsolutePath))

(def ^String maven-repository-path
  (filename (env/env :user-home) ".m2" "repository"))


;;; -------------------------------------------------- Driver Paths --------------------------------------------------

(defn driver-project-dir
  "e.g. \"/home/cam/metabase/modules/drivers/redshift\""
  [driver]
  (filename project-root-directory "modules" "drivers" (name driver)))

(defn driver-jar-name
  "e.g. \"redshift.metabase-driver.jar\""
  [driver]
  (format "%s.metabase-driver.jar" (name driver)))

(defn driver-target-directory
  [driver]
  (filename (driver-project-dir driver) "target"))

(defn driver-jar-build-path
  "e.g. \"/home/cam/metabase/modules/drivers/redshift/target/uberjar/redshift.metabase-driver.jar\""
  [driver]
  (filename (driver-target-directory driver) "uberjar" (driver-jar-name driver)))

(def ^String driver-jar-destination-directory
  (filename project-root-directory "resources" "modules"))

(defn driver-jar-destination-path
  "e.g. \"/home/cam/metabase/resources/modules/redshift.metabase-driver.jar\""
  [driver]
  (filename driver-jar-destination-directory (driver-jar-name driver)))

(defn driver-checksum-filename
  "e.g. \"/home/cam/metabase/modules/drivers/redshift/target/checksum.txt\""
  [driver]
  (filename (driver-project-dir driver) "target" "checksum.txt")) ; TODO - rename to checksum.md5

(defn driver-plugin-manifest-filename
  "e.g. \"/home/cam/metabase/modules/drivers/bigquery/resources/plugin-manifest.yaml\""
  [driver]
  (filename (driver-project-dir driver) "resources" "metabase-plugin.yaml"))


;;; ------------------------------------------ Metabase Local Install Paths ------------------------------------------

(def ^String metabase-uberjar-path
  "e.g. \"home/cam/metabase/target/uberjar/metabase.jar\""
  (filename project-root-directory "target" "uberjar" "metabase.jar"))
