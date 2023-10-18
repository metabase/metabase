(ns build.version-properties
  (:require
   [clojure.string :as str]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(def ^:private version-properties-filename
  (u/filename u/project-root-directory "resources" "version.properties"))

(defn- shell-output-when-nonzero
  "Call an external shell command, and return the first line that is output if it has a nonzero exit code. (Sometimes
  `git` will fail, e.g. in CI where we delete the `.git` directory to reduce the workspace snapshot size.)"
  [& args]
  (let [{:keys [exit out]} (apply u/sh* args)]
    (when (zero? exit)
      (first out))))

(defn- git-hash []
  ;; first 7 letters of hash should be enough; that's what GitHub uses
  (or (shell-output-when-nonzero "git" "show-ref" "--head" "--hash=7" "head")
      "?"))

(defn- git-branch []
  (or (shell-output-when-nonzero "git" "symbolic-ref" "--short" "HEAD")
      "?"))

(defn- git-last-commit-date []
  (or (shell-output-when-nonzero "git" "log" "-1" "--pretty=%ad" "--date=short")
      "?"))

(defn- version-properties [version]
  (str/join "\n" (for [[k v] {:tag    (if-not (str/starts-with? version "v")
                                        (str \v version)
                                        version)
                              :hash   (git-hash)
                              :date   (git-last-commit-date)}]
                   (str (name k) \= v))))

(defn- most-recent-tag []
  (shell-output-when-nonzero "git" "describe" "--abbrev=0" "--tags"))

(defn- tag-parts [tag]
  (when tag
    (not-empty
     (for [part  (str/split tag #"\.")
           :let  [numeric-part (re-find #"\d+" part)]
           :when (seq numeric-part)]
       (Integer/parseInt numeric-part)))))

(defn current-snapshot-version
  "Attempt to come up with a snapshot version for builds that aren't given explicit version info based on the most
  recent tag. e.g.

    v0.37.1 -> v0.37.2-SNAPSHOT

  For builds from `master`, increment the minor version instead e.g.

    v0.37.1 -> v0.38.0-SNAPSHOT"
  ([edition]
   (current-snapshot-version edition (git-branch) (most-recent-tag)))

  ([edition branch tag]
   {:pre [(#{:oss :ee} edition)]}
   (if-let [tag-parts (not-empty (tag-parts tag))]
     (let [[_ minor patch] tag-parts
           major               (case edition :oss 0 :ee 1)
           [minor patch]       (if (= branch "master")
                                 [(inc (or minor 0)) 0]
                                 [(or minor 0) (inc (or patch 0))])]
       (format "v%d.%d.%d-SNAPSHOT" major minor patch))
     "UNKNOWN")))

(defn generate-version-properties-file!
  "Generate version.properties file"
  ([edition]
   (generate-version-properties-file! edition (current-snapshot-version edition)))

  ([_edition version]
   (u/delete-file-if-exists! version-properties-filename)
   (u/step (format "Generate version.properties file for version %s" version)
     (spit version-properties-filename (version-properties version))
     (u/assert-file-exists version-properties-filename)
     (u/announce "version.properties generated successfully."))))
