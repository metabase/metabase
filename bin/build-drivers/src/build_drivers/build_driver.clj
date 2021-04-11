(ns build-drivers.build-driver
  "Logic for building a single driver."
  (:require [build-drivers.checksum :as checksum]
            [build-drivers.common :as c]
            [build-drivers.install-driver-locally :as install-locally]
            [build-drivers.metabase :as metabase]
            [build-drivers.plugin-manifest :as manifest]
            [build-drivers.strip-and-compress :as strip-and-compress]
            [build-drivers.verify :as verify]
            [clojure.string :as str]
            [colorize.core :as colorize]
            [environ.core :as env]
            [metabuild-common.core :as u]))

(defn- copy-driver!
  "Copy the driver JAR from its `target/` directory to `resources/modules`/."
  [driver]
  (u/step (format "Copy %s driver uberjar from %s -> %s"
                  driver
                  (u/assert-file-exists (c/driver-jar-build-path driver))
                  (c/driver-jar-destination-path driver))
    (u/delete-file-if-exists! (c/driver-jar-destination-path driver))
    (u/create-directory-unless-exists! c/driver-jar-destination-directory)
    (u/copy-file! (c/driver-jar-build-path driver)
                  (c/driver-jar-destination-path driver))))

(defn- clean-driver-artifacts!
  "Delete built JARs of `driver`."
  [driver]
  (u/step (format "Delete %s driver artifacts" driver)
    (u/delete-file-if-exists! (c/driver-target-directory driver))
    (u/delete-file-if-exists! (c/driver-jar-destination-path driver))))

(defn- clean-parents!
  "Delete built JARs and local Maven installations of the parent drivers of `driver`."
  [driver]
  (u/step (format "Clean %s parent driver artifacts" driver)
    (doseq [parent (manifest/parent-drivers driver)]
      (clean-driver-artifacts! parent)
      (install-locally/clean! parent)
      (clean-parents! parent))))

(defn- clean-all!
  "Delete all artifacts relating to building `driver`, including the driver JAR itself and installed
  `metabase-core`/Metabase uberjar and any parent driver artifacts."
  [driver]
  (u/step "Clean all"
    (clean-driver-artifacts! driver)
    (clean-parents! driver)
    (metabase/clean-metabase!)))

(declare build-driver!)

(defn- build-parents!
  "Build and install to the local Maven repo any parent drivers of `driver` (e.g. `:google` is a parent of `:bigquery`).
  The driver must be built as an uberjar so we can remove duplicate classes during the `strip-and-compress` stage; it
  must be installed as a library so we can use it as a `:provided` dependency when building the child driver."
  [driver edition]
  (u/step (format "Build %s parent drivers" driver)
    (when-let [parents (not-empty (manifest/parent-drivers driver))]
      (doseq [parent parents]
        (build-parents! parent edition)
        (install-locally/install-locally! parent edition)
        (build-driver! parent edition))
      (u/announce "%s parents built successfully." driver))))

(defn- build-uberjar! [driver edition]
  (u/step (format "Build %s uberjar (%s edition)" driver edition)
    (u/delete-file-if-exists! (c/driver-target-directory driver))
    (u/sh {:dir (c/driver-project-dir driver)} "lein" "clean")
    (u/sh {:dir (c/driver-project-dir driver)
           :env {"LEIN_SNAPSHOTS_IN_RELEASE" "true"
                 "HOME"                      (env/env :user-home)
                 "PATH"                      (env/env :path)
                 "JAVA_HOME"                 (env/env :java-home)}}
          "lein" "with-profile" (format "+%s" (name edition)) "uberjar")
    (strip-and-compress/strip-and-compress-uberjar! driver)
    (u/announce "%s uberjar (%s edition) built successfully." driver edition)))

(defn- build-and-verify!
  "Build `driver` and verify the built JAR. This function ignores any existing artifacts and will always rebuild."
  [driver edition]
  {:pre [(#{:oss :ee} edition)]}
  (u/step (str/join " " [(colorize/green "Build")
                         (colorize/yellow driver)
                         (colorize/green "driver")
                         (colorize/yellow (format "(%s edition)" edition))])
    (clean-driver-artifacts! driver)
    (u/step (format "Build %s driver (%s edition) prerequisites if needed" driver edition)
      (metabase/build-metabase!)
      (build-parents! driver edition))
    (build-uberjar! driver edition)
    (copy-driver! driver)
    (verify/verify-driver driver)
    (u/step (format "Save checksum for %s driver (%s edition) to %s"
                    driver edition (c/driver-checksum-filename driver))
      (let [filename (c/driver-checksum-filename driver)
            checksum (checksum/driver-checksum driver edition)]
        (spit filename checksum)
        (u/announce "Wrote checksum %s to file %s" (pr-str checksum) filename)))))

(defn- driver-checksum-matches?
  "Check whether the saved checksum for the driver from the last build is the same as the current one. If so, we don't
  need to build again. This checksum is based on driver sources as well as the checksums for Metabase sources and
  parent drivers."
  [driver edition]
  (u/step (format "Determine whether %s driver (%s edition) source files have changed since last build" driver edition)
    (let [existing-checksum (checksum/existing-driver-checksum driver)]
      (cond
        (not existing-checksum)
        (do
          (u/announce "No previous checksum. Need to rebuild driver")
          false)

        (= existing-checksum (checksum/driver-checksum driver edition))
        (do
          (u/announce "Checksum is the same. Do not need to rebuild driver.")
          true)

        :else
        (do
          (u/announce "Checksum is different. Need to rebuild driver.")
          false)))))

(defn build-driver!
  "Build `driver`, if needed."
  [driver edition]
  {:pre [(#{:oss :ee nil} edition)]}
  (let [edition (or edition :oss)]
    (u/step (str/join " " [(colorize/green "Build")
                           (colorize/yellow driver)
                           (colorize/green "driver")
                           (colorize/yellow (format "(%s edition)" edition))
                           (colorize/green "if needed")])
      ;; When we build a driver, we save a checksum of driver source code + metabase source code + parent drivers
      ;; alongside the built driver JAR. The next time this script is called, we recalculate that checksum -- if the
      ;; current checksum matches the saved one associated with the built driver JAR, we do not need to rebuild the
      ;; driver. If anything relevant has changed, we have to rebuild the driver.
      (if (driver-checksum-matches? driver edition)
        ;; even if we're not rebuilding the driver, copy the artifact from `modules/drivers/<driver>/target/uberjar/`
        ;; to `resources/modules` so we can be sure we have the most up-to-date version there.
        (try
          (copy-driver! driver)
          (verify/verify-driver driver)
          ;; if verification fails, delete all the existing artifacts and just rebuild the driver from scratch.
          (catch Throwable e
            (u/error "Error verifying existing driver:\n%s" (pr-str e))
            (u/announce "Deleting existing driver artifacts and rebuilding.")
            (clean-driver-artifacts! driver)
            (build-driver! driver edition)))
        ;; if checksum does not match, build and verify the driver
        (try
          (build-and-verify! driver edition)
          ;; if building fails, clean everything, including metabase-core, the metabase uberjar, and parent
          ;; dependencies, *then* retry.
          (catch Throwable e
            (u/announce "Cleaning ALL and retrying...")
            (clean-all! driver)
            (try
              (build-and-verify! driver edition)
              ;; if building the driver failed again, even after cleaning, delete anything that was built and then
              ;; give up.
              (catch Throwable e
                (u/safe-println (colorize/red (format "Failed to build %s driver." driver)))
                (clean-driver-artifacts! driver)
                (throw e))))))
      ;; if we make it this far, we've built the driver successfully.
      (u/announce "Success."))))
