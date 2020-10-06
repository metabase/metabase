(ns build-drivers.install-driver-locally
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]
             [util :as u]]
            [colorize.core :as colorize]))

(defn- driver-local-install-path [driver]
  (c/filename c/maven-repository-path "metabase" (format "%s-driver" (name driver))))

(defn- driver-local-install-checksum-filename [driver]
  (c/filename (driver-local-install-path driver) "checksum.md5"))

(defn clean! [driver]
  (u/step (format "Deleting existing Maven installation of %s driver" driver)
    (u/delete-file! (driver-local-install-path driver))))

(defn- local-install-checksum-matches?
  [driver]
  (u/step "Determine whether %s driver source files have changed since last local install"
    (let [existing-checksum (checksum/checksum-from-file (driver-local-install-checksum-filename driver))
          current-checksum  (checksum/driver-checksum driver)
          same?             (= existing-checksum current-checksum)]
      (u/announce (if same?
                    "Checksum is the same. Do not need to rebuild driver."
                    "Checksum is different. Need to rebuild driver."))
      same?)))

(defn install-locally!
  "Install `driver` to local Maven repo so descendant drivers can use it as a dependency."
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Install ") (colorize/yellow driver) (colorize/green " driver to local Maven repo if needed"))
    (if (local-install-checksum-matches? driver)
      (u/announce "Already installed locally.")
      (u/step (str (colorize/green "Install ") (colorize/yellow driver) (colorize/green " driver to local Maven repo"))
        (u/sh {:dir (c/driver-project-dir driver)} "lein" "clean")
        (u/sh {:dir (c/driver-project-dir driver)} "lein" "install-for-building-drivers")
        (u/step (format "Save checksum to %s" driver (driver-local-install-checksum-filename driver))
          (spit (driver-local-install-checksum-filename driver) (checksum/driver-checksum driver)))))))

(defn needs-reinstall? [driver]
  (local-install-checksum-matches? driver))
