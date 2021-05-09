(ns release.git-tags
  "Code related to updating Git tags."
  (:require [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.git :as git]))

(defn- validate-git-tag []
  (let [tag (str \v (c/version))]
    (u/step (format "Validate git tag %s" tag)
      (u/sh {:dir c/root-directory} "git" "fetch")
      (u/sh {:dir c/root-directory} "git" "fetch" "--tags")
      (u/sh {:dir c/root-directory} "git" "rev-list" "-n" "1" tag)
      (let [[tag-hash] (u/sh {:dir c/root-directory} "git" "rev-list" "-n" "1" "v0.36.6")]
        (u/announce "Found %s tag on commit %s" tag tag-hash)))))

(defn push-tags! []
  (u/step "Push and validate Git tag"
    (git/recreate-and-push-tag! c/root-directory (str "v" (c/version)))
    (validate-git-tag)))
