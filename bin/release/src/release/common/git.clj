(ns release.common.git
  (:require [metabuild-common.core :as u]
            [release.common :as c])
  (:import (java.time.format DateTimeFormatter)
           (java.time ZonedDateTime)))

(defn delete-local-tag!
  "Delete `tag` if it exists locally."
  [repo-dir tag]
  (u/step (format "Delete local tag %s" tag)
    (when-not (zero? (:exit (u/sh* {:dir repo-dir} "git" "tag" "--delete" tag)))
      (u/announce "Nothing to delete."))))

(defn delete-remote-tag!
  "Delete remote `tag` if it exists."
  [repo-dir tag]
  (u/step "Delete remote tag"
    (when-not (zero? (:exit (u/sh* {:dir repo-dir} "git" "push" "--delete" "origin" tag)))
      (u/announce "Nothing to delete."))))

(defn recreate-and-push-tag!
  "(Re)create a `tag` (deleting it if it already exists) and push it."
  [repo-dir tag]
  (u/step (format "Update Git tag -> %s" tag)
    (u/step "Delete old tags"
      (delete-local-tag! repo-dir tag)
      (delete-remote-tag! repo-dir tag))
    (u/step "Push updated tag to GitHub"
      (u/sh (cond-> {:dir repo-dir}
              (c/force-latest-release?)
              (assoc :env (do
                            (u/announce (str "Forcing this to be \"latest\" release in GitHub by overriding"
                                             "GIT_COMMITTER_DATE as \"now\" when creating the tag"))
                            (into {"GIT_COMMITTER_DATE"
                                   (.format (DateTimeFormatter/ofPattern "eee, d MMM yyyy hh:mm:ss Z")
                                            (ZonedDateTime/now))}
                                  System/getenv))))
            "git" "tag" "-a" tag "-m" tag)
      (u/sh {:dir repo-dir} "git" "push" "--follow-tags" "--set-upstream" "origin" (c/branch)))
    (u/announce "Tag updated.")))
