(ns build-drivers.metabase
  "Code for installing the main Metabase project as a library (`metabase-core`) in the local Maven repository, and for
  building a Metabase uberjar. Both are needed when building drivers."
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]]
            [metabuild-common.core :as u]))

(def ^String ^:private uberjar-checksum-path
  (str c/metabase-uberjar-path ".md5"))

(def ^String ^:private metabase-core-install-path
  (u/filename c/maven-repository-path "metabase-core"))

(def ^String ^:private metabase-core-checksum-path
  (u/filename metabase-core-install-path "checksum.md5"))

(defn metabase-core-checksum-matches? []
  (u/step "Determine whether Metabase source files checksum has changed since last install of metabase-core"
    (let [existing-checksum (checksum/checksum-from-file metabase-core-checksum-path)
          current-checksum  (checksum/metabase-source-checksum)
          same?             (= existing-checksum current-checksum)]
      (u/announce (if same?
                    "Checksum is the same. Do not need to reinstall metabase-core locally."
                    "Checksum is different. Need to reinstall metabase-core locally."))
      same?)))

(defn- delete-metabase-core-install! []
  (u/step "Delete local installation of metabase-core"
    (u/delete-file-if-exists! metabase-core-install-path)))

(defn- install-metabase-core! []
  (u/step "Install metabase-core locally if needed"
    (if (metabase-core-checksum-matches?)
      (u/announce "Up-to-date metabase-core already installed to local Maven repo")
      (do
        (delete-metabase-core-install!)
        (u/sh {:dir u/project-root-directory} "lein" "clean")
        (u/sh {:dir u/project-root-directory} "lein" "install-for-building-drivers")
        (u/step "Save checksum for local installation of metabase-core"
          (spit metabase-core-checksum-path (checksum/metabase-source-checksum)))
        (u/announce "metabase-core dep installed to local Maven repo successfully.")))))

(defn uberjar-checksum-matches?
  "After installing/building Metabase we save a MD5 hex checksum of Metabase backend source files (including
  `project.clj`). The next time we run `build-metabase!`, if the checksums have changed we know we need to
  rebuild/reinstall."
  []
  (u/step "Determine whether Metabase source files checksum has changed since last build of uberjar"
    (let [existing-checksum (checksum/checksum-from-file uberjar-checksum-path)
          current-checksum  (checksum/metabase-source-checksum)
          same?             (= existing-checksum current-checksum)]
      (u/announce (if same?
                    "Checksum is the same. Do not need to rebuild Metabase uberjar."
                    "Checksum is different. Need to rebuild Metabase uberjar."))
      same?)))

(defn- delete-metabase-uberjar! []
  (u/step "Delete exist metabase uberjar"
    (u/delete-file-if-exists! (u/filename u/project-root-directory "target"))))

(defn- build-metabase-uberjar! []
  (u/step "Build Metabase uberjar if needed"
    (if (uberjar-checksum-matches?)
      (u/announce "Update-to-date Metabase uberjar already built")
      (do
        (delete-metabase-uberjar!)
        (u/sh {:dir u/project-root-directory} "lein" "clean")
        (u/sh {:dir u/project-root-directory} "lein" "uberjar")
        (u/step "Save checksum for Metabase uberar"
          (spit uberjar-checksum-path (checksum/metabase-source-checksum)))
        (u/announce "Metabase uberjar built successfully")))))

(defn clean-metabase!
  "Delete local Maven repository installation of the `metabase-core` library and delete the built Metabase uberjar."
  []
  (u/step "Clean local Metabase deps"
    (delete-metabase-core-install!)
    (delete-metabase-uberjar!)))

(defn build-metabase!
  "Install `metabase-core` as a library in the local Maven repo, and build the Metabase uberjar IF NEEDED. We need to do
  both because `metabase-core` is used as a dependency for drivers, and the Metabase uberjar is checked to make sure
  we don't ship duplicate classes in the driver JAR (as part of the `strip-and-compress` stage.)"
  []
  (u/step "Build metabase-core and install locally"
    (install-metabase-core!)
    (build-metabase-uberjar!)))
