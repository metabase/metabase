(ns release.git-tags
  "Code related to updating Git tags."
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn- validate-git-tag []
  (let [tag (str \v (c/version))]
    (u/step (format "Validate git tag %s" tag)
      (u/sh {:dir c/root-directory} "git" "fetch")
      (u/sh {:dir c/root-directory} "git" "fetch" "--tags")
      (u/sh {:dir c/root-directory} "git" "rev-list" "-n" "1" tag)
      (let [[tag-hash] (u/sh {:dir c/root-directory} "git" "rev-list" "-n" "1" "v0.36.6")]
        (u/announce "Found %s tag on commit %s" tag tag-hash)))))

(defn push-tags! []
  (u/step "Push updated tags to GitHub"
    (u/step "Delete old tags"
      (try
        (u/sh "git" "push" "--delete" "origin" (str "v" (c/version)))
        (catch Throwable _
          (u/announce "Nothing to delete."))))
    (u/step "Push updated tag"
      (u/sh "git" "tag" "-a" (str "v" (c/version)) "-m" (str "v" (c/version)))
      (u/sh "git" "push" "--follow-tags" "-u" "origin" (c/branch)))
    (u/announce "Tags updated."))
  (validate-git-tag))
