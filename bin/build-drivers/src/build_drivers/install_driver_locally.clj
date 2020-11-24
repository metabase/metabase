(ns build-drivers.install-driver-locally
  "Logic related to installing a driver as a library in the local Maven repository so it can be used as a dependency
  when building descandant drivers. Right now this is only used for `:google`, which is used by `:bigquery` and
  `:googleanalytics`."
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]]
            [colorize.core :as colorize]
            [metabuild-common.core :as u]))

(defn- driver-local-install-path [driver]
  (u/filename c/maven-repository-path "metabase" (format "%s-driver" (name driver))))

(defn- driver-local-install-checksum-filename [driver]
  (u/filename (driver-local-install-path driver) "checksum.md5"))

(defn clean!
  "Delete local Maven installation of the library version of `driver`."
  [driver]
  (u/step (format "Deleting existing Maven installation of %s driver" driver)
    (u/delete-file! (driver-local-install-path driver))))

(defn- local-install-checksum-matches?
  "After installing the library version of `driver`, we save a checksum based on its sources; next time we call
  `install-locally!`, we can recalculate the checksum; if the saved one matches the current one, we do not need to
  reinstall."
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
  "Install `driver` as a library in the local Maven repository IF NEEDED so descendant drivers can use it as a
  `:provided` dependency when building. E.g. before building `:bigquery` we need to install `:google` as a library
  locally."
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
