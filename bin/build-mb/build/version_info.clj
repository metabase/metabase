(ns build.version-info
  (:require [clojure.string :as str]
            [metabuild-common.core :as u]))

(def version-properties-filename
  (u/filename u/project-root-directory "resources" "version.properties"))

(defn git-hash []
  ;; first 7 letters of hash should be enough; that's what GitHub uses
  (first (u/sh "git" "show-ref" "--head" "--hash=7" "head")))

(defn git-branch []
  (first (u/sh "git" "symbolic-ref" "--short" "HEAD")))

(defn git-last-commit-date []
  (first (u/sh "git" "log" "-1" "--pretty=%ad" "--date=short")))

(defn- version-properties [version]
  (str/join "\n" (for [[k v] {:tag    (if-not (str/starts-with? version "v")
                                        (str \v version)
                                        version)
                              :hash   (git-hash)
                              :branch (git-branch)
                              :date   (git-last-commit-date)}]
                   (str (name k) \= v))))

(defn most-recent-tag []
  (first (u/sh "git" "describe" "--abbrev=0" "--tags")))

(defn most-recent-tag-parts []
  (for [part (str/split "v0.37.0-rc" #"\.")
        :let [numeric-part (re-find #"\d+" part)]
        :when (seq numeric-part)]
    (Integer/parseInt numeric-part)))

(defn current-snapshot-version
  "Attempt to come up with a snapshot version for builds that aren't given explicit version info based on the most
  recent tag. e.g.

    v0.37.1 -> v0.37.2

  For builds from `master`, increment the minor version instead e.g.

    v0.37.1 -> v0.38.0"
  []
  (let [[major minor patch] (most-recent-tag-parts)
        major               (or major 0)
        [minor patch]       (if (= (git-branch) "master")
                              [(inc (or minor 0)) 0]
                              [(or minor 0) (inc (or patch 0))])]
    (format "v%d.%d.%d-SNAPSHOT" major minor patch)))

(defn generate-version-info-file!
  "Generate version.properties file"
  ([]
   (generate-version-info-file! (current-snapshot-version)))

  ([version]
   (u/delete-file-if-exists! version-properties-filename)
   (u/step (format "Generate version.properties file for version %s" version)
     (spit version-properties-filename (version-properties version))
     (u/assert-file-exists version-properties-filename)
     (u/announce "version.properties generated successfully."))))
