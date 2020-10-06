(ns build-drivers.build-driver
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]
             [install-driver-locally :as install-locally]
             [metabase :as metabase]
             [plugin-manifest :as manifest]
             [util :as u]
             [verify :as verify]]
            [colorize.core :as colorize]
            [environ.core :as env]))

(defn- copy-driver!
  "copy the target uberjar to the dest location"
  [driver]
  (u/step (format "Copy %s driver uberjar from %s -> %s"
                  driver
                  (u/assert-file-exists (c/driver-jar-build-path driver))
                  (c/driver-jar-destination-path driver))
    (u/delete-file! (c/driver-jar-destination-path driver))
    (u/copy-file! (c/driver-jar-build-path driver)
                  (c/driver-jar-destination-path driver))))

(defn- clean-driver-artifacts! [driver]
  (u/step (format "Delete %s driver artifacts" driver)
    (u/delete-file! (c/driver-target-directory driver))
    (u/delete-file! (c/driver-jar-destination-path driver))))

(defn- clean-parents! [driver]
  (u/step (format "Clean %s parent driver artifacts" driver)
    (doseq [parent (manifest/parent-drivers driver)]
      (clean-driver-artifacts! parent)
      (install-locally/clean! parent)
      (clean-parents! parent))))

(defn- clean-all! [driver]
  (u/step "Clean all"
    (clean-driver-artifacts! driver)
    (clean-parents! driver)
    (metabase/clean-metabase!)))

(declare build-driver!)

(defn- build-parents! [driver]
  (u/step (format "Build %s parent drivers" driver)
    (doseq [parent (manifest/parent-drivers driver)]
      (build-parents! parent)
      (install-locally/install-locally! parent)
      (build-driver! parent))
    (u/announce "%s parents built successfully." driver)))

(defn- strip-and-compress-uberjar!
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
     (u/sh {:dir c/project-root-directory}
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
                 #_"DEBUG"                     #_"1"
                 "JAVA_HOME"                 (env/env :java-home)
                 "HOME"                      (env/env :user-home)}}
          "lein" "uberjar")
    (strip-and-compress-uberjar! driver)
    (u/announce "%s uberjar build successfully." driver)))

(defn- build-and-verify! [driver]
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
  [driver]
  {:pre [(keyword? driver)]}
  (u/step (str (colorize/green "Build ") (colorize/yellow driver) (colorize/green " driver if needed"))
    (try
      (if (driver-checksum-matches? driver)
        (do
          (verify/verify-driver driver)
          (copy-driver! driver))
        (build-and-verify! driver))
      (catch Throwable e
        (u/safe-println (colorize/red (format "Error building driver:\n%s" (pr-str e))))
        (u/announce "Cleaning and retrying...")
        (try
          (clean-driver-artifacts! driver)
          (build-and-verify! driver)
          true
          (catch Throwable e
            (u/announce "Cleaning ALL and retrying...")
            (clean-all! driver)
            (try
              (build-and-verify! driver)
              true
              (catch Throwable e
                (u/safe-println (colorize/red (format "Failed to build %s driver." driver)))
                (clean-driver-artifacts! driver)
                (throw e)))))))
    (u/announce "Success.")))
