(ns build-drivers.build-driver
  "Logic for building a single driver."
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]
             [install-driver-locally :as install-locally]
             [metabase :as metabase]
             [plugin-manifest :as manifest]
             [verify :as verify]]
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
    (u/delete-file! (c/driver-jar-destination-path driver))
    (u/create-directory-unless-exists! c/driver-jar-destination-directory)
    (u/copy-file! (c/driver-jar-build-path driver)
                  (c/driver-jar-destination-path driver))))

(defn- clean-driver-artifacts!
  "Delete built JARs of `driver`."
  [driver]
  (u/step (format "Delete %s driver artifacts" driver)
    (u/delete-file! (c/driver-target-directory driver))
    (u/delete-file! (c/driver-jar-destination-path driver))))

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
  [driver]
  (u/step (format "Build %s parent drivers" driver)
    (doseq [parent (manifest/parent-drivers driver)]
      (build-parents! parent)
      (install-locally/install-locally! parent)
      (build-driver! parent))
    (u/announce "%s parents built successfully." driver)))

(defn- strip-and-compress-uberjar!
  "Remove any classes in compiled `driver` that are also present in the Metabase uberjar or parent drivers. The classes
  will be available at runtime, and we don't want to make things unpredictable by including them more than once in
  different drivers.

  This is only needed because `lein uberjar` does not seem to reliably exclude classes from `:provided` Clojure
  dependencies like `metabase-core` and the parent drivers."
  ([driver]
   (u/step (str (format "Strip out any classes in %s driver JAR found in core Metabase uberjar or parent JARs" driver)
                " and recompress with higher compression ratio")
     (let [uberjar (u/assert-file-exists (c/driver-jar-build-path driver))]
       (u/step "strip out any classes also found in the core Metabase uberjar"
         (strip-and-compress-uberjar! uberjar (u/assert-file-exists c/metabase-uberjar-path)))
       (u/step "remove any classes also found in any of the parent JARs"
         (doseq [parent (manifest/parent-drivers driver)]
           (strip-and-compress-uberjar! uberjar (u/assert-file-exists (c/driver-jar-build-path parent))))))))

  ([target source]
   (u/step (format "Remove classes from %s that are present in %s and recompress" target source)
     (u/sh {:dir u/project-root-directory}
           "lein"
           "strip-and-compress"
           (u/assert-file-exists target)
           (u/assert-file-exists source)))))

(defn- build-uberjar! [driver]
  (u/step (format "Build %s uberjar" driver)
    (u/delete-file! (c/driver-target-directory driver))
    (u/sh {:dir (c/driver-project-dir driver)} "lein" "clean")
    (u/sh {:dir (c/driver-project-dir driver)
           :env {"LEIN_SNAPSHOTS_IN_RELEASE" "true"
                 "HOME"                      (env/env :user-home)
                 "PATH"                      (env/env :path)
                 "JAVA_HOME"                 (env/env :java-home)}}
          "lein" "uberjar")
    (strip-and-compress-uberjar! driver)
    (u/announce "%s uberjar build successfully." driver)))

(defn- build-and-verify!
  "Build `driver` and verify the built JAR. This function ignores any existing artifacts and will always rebuild."
  [driver]
  (u/step (str (colorize/green "Build ") (colorize/yellow driver) (colorize/green " driver"))
    (clean-driver-artifacts! driver)
    (metabase/build-metabase!)
    (build-parents! driver)
    (build-uberjar! driver)
    (copy-driver! driver)
    (verify/verify-driver driver)
    (u/step (format "Save checksum for %s driver to %s" driver (c/driver-checksum-filename driver))
      (spit (c/driver-checksum-filename driver) (checksum/driver-checksum driver)))))

(defn- driver-checksum-matches?
  "Check whether the saved checksum for the driver from the last build is the same as the current one. If so, we don't
  need to build again. This checksum is based on driver sources as well as the checksums for Metabase sources and
  parent drivers."
  [driver]
  (u/step (format "Determine whether %s driver source files have changed since last build" driver)
    (let [existing-checksum (checksum/existing-driver-checksum driver)
          current-checksum  (checksum/driver-checksum driver)
          same?             (= existing-checksum current-checksum)]
      (u/announce (if same?
                    "Checksum is the same. Do not need to rebuild driver."
                    "Checksum is different. Need to rebuild driver."))
      same?)))

(defn build-driver!
  "Build `driver`, if needed."
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Build ") (colorize/yellow driver) (colorize/green " driver if needed"))
    ;; When we build a driver, we save a checksum of driver source code + metabase source code + parent drivers
    ;; alongside the built driver JAR. The next time this script is called, we recalculate that checksum -- if the
    ;; current checksum matches the saved one associated with the built driver JAR, we do not need to rebuild the
    ;; driver. If anything relevant has changed, we have to rebuild the driver.
    (if (driver-checksum-matches? driver)
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
          (build-driver! driver)))
      ;; if checksum does not match, build and verify the driver
      (try
        (build-and-verify! driver)
        ;; if building fails, clean everything, including metabase-core, the metabase uberjar, and parent
        ;; dependencies, *then* retry.
        (catch Throwable e
          (u/announce "Cleaning ALL and retrying...")
          (clean-all! driver)
          (try
            (build-and-verify! driver)
            ;; if building the driver failed again, even after cleaning, delete anything that was built and then
            ;; give up.
            (catch Throwable e
              (u/safe-println (colorize/red (format "Failed to build %s driver." driver)))
              (clean-driver-artifacts! driver)
              (throw e))))))
    ;; if we make it this far, we've built the driver successfully.
    (u/announce "Success.")))
