(ns release.build
  (:require [clojure.string :as str]
            [environ.core :as env]
            [release.common :as c]))

(def ^:private bin-version-file
  (str c/root-directory "/bin/version"))

(defn- update-version-info! []
  (c/step (format "Update %s if needed" (c/assert-file-exists bin-version-file))
    (c/step "Update version in bin/version"
      (let [lines         (str/split-lines (slurp bin-version-file))
            updated-lines (for [line lines]
                            (if (re-matches #".*VERSION=.*" line)
                              (format "VERSION='v%s'" (c/version))
                              line))]
        (if (= lines updated-lines)
          (c/announce "Correct version is already set.")
          (do
            (c/announce "Version set to 'v%s'" (c/version))
            (spit bin-version-file (str/join (interleave updated-lines (repeat "\n"))))
            (c/sh "chmod" "+x" bin-version-file)
            (c/step "Commit updated bin/version"
              (c/sh "git" "add" bin-version-file)
              (c/sh "git" "commit" "-m" (str \v (c/version)) bin-version-file))))))))

(defn- build-uberjar! []
  (c/step "Run bin/build to build uberjar"
    (c/delete-file! (str c/root-directory "/target"))
    (c/sh {:dir c/root-directory} "bin/build")
    (c/step "Verify uberjar exists"
      (c/assert-file-exists c/uberjar-path))))

(defn- build-docker-image! []
  (c/step "Build Docker image"
    (c/copy-file! (c/assert-file-exists c/uberjar-path) (str c/root-directory "/bin/docker/metabase.jar"))
    (c/sh "docker" "build" "-t" (c/docker-tag) (str c/root-directory "/bin/docker"))))

(defn build! []
  (c/step "Build release"
    (c/slack-notify "%s started preparing %s `v%s` from branch `%s`..."
                    (env/env :user)
                    (str/upper-case (name (c/edition)))
                    (c/version)
                    (c/branch))
    (update-version-info!)
    (build-uberjar!)
    (build-docker-image!)))
