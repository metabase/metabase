(ns build-drivers.metabase
  (:require [build-drivers
             [checksum :as checksum]
             [common :as c]
             [util :as u]]))

(def ^String ^:private uberjar-checksum-path
  (str c/metabase-uberjar-path ".md5"))

(def ^String ^:private metabase-core-install-path
  (c/filename c/maven-repository-path "metabase-core"))

(def ^String ^:private metabase-core-checksum-path
  (c/filename metabase-core-install-path "checksum.md5"))

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
    (u/delete-file! metabase-core-install-path)))

(defn- install-metabase-core! []
  (u/step "Install metabase-core locally if needed"
    (if (metabase-core-checksum-matches?)
      (u/announce "Up-to-date metabase-core already installed to local Maven repo")
      (do
        (delete-metabase-core-install!)
        (u/sh {:dir c/project-root-directory} "lein" "clean")
        (u/sh {:dir c/project-root-directory} "lein" "install-for-building-drivers")
        (u/step "Save checksum for local installation of metabase-core"
          (spit metabase-core-checksum-path (checksum/metabase-source-checksum)))
        (u/announce "metabase-core dep installed to local Maven repo successfully.")))))

(defn uberjar-checksum-matches? []
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
    (u/delete-file! (c/filename c/project-root-directory "target"))))

(defn- build-metabase-uberjar! []
  (u/step "Build Metabase uberjar if needed"
    (if (uberjar-checksum-matches?)
      (u/announce "Update-to-date uberjar already built")
      (do
        (delete-metabase-uberjar!)
        (u/sh {:dir c/project-root-directory} "lein" "clean")
        (u/sh {:dir c/project-root-directory} "lein" "uberjar")
        (u/step "Save checksum for Metabase uberar"
          (spit uberjar-checksum-path (checksum/metabase-source-checksum)))
        (u/announce "Metabase uberjar built successfully")))))

(defn clean-metabase! []
  (u/step "Clean local Metabase deps"
    (delete-metabase-core-install!)
    (delete-metabase-uberjar!)))

(defn build-metabase! []
  (u/step "Build metabase-core and install locally"
    (install-metabase-core!)
    (build-metabase-uberjar!)))

(defn needs-rebuild? []
  (or (not (metabase-core-checksum-matches?))
      (not (uberjar-checksum-matches?))))
