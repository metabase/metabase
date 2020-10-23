(ns release.heroku
  "Code related to updating the Heroku build pack."
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(def ^:private heroku-repo "metabase/metabase-buildpack")

(def ^:private dir "/tmp/metabase-heroku-buildpack")

(defn- validate-heroku-buildpack []
  (u/step "Validate Heroku buildpack"
    (let [[version] (u/sh {:dir dir} "git" "show" "origin/master:bin/version")]
      (u/announce "Heroku buildpack version on origin/master is %s" version)
      (assert (= version (c/version))
              (format "Version does not equal %s" (c/version))))))

(defn update-heroku-buildpack! []
  (u/step "Update Metabase Heroku buildpack"
    (cond
      (c/pre-release-version?)
      (u/announce "Pre-release version -- not updating Heroku buildpack ")

      (= (c/edition) :ee)
      (u/announce "EE build -- not updating Herkou buildpack")

      :else
      (do
        (u/step "Clone Herkou Buildpack repo"
          (u/delete-file! dir)
          (u/sh "git" "clone" (format "git@github.com:%s.git" heroku-repo) dir))
        (let [version-file (u/assert-file-exists (str dir "/bin/version"))]
          (u/step (format "Update %s" (pr-str version-file))
            (spit version-file (str (c/version) "\n"))
            (u/sh {:dir dir} "git" "commit" "-m" (format "v%s" (c/version)))))
        (u/step "Delete old tags"
          (try
            (u/sh {:dir dir} "git" "push" "--delete" "origin" (c/version))
            (catch Throwable _
              (u/announce "Nothing to delete."))))
        (u/step "Push updated tag"
          (u/sh {:dir dir} "git" "tag" (c/version))
          (u/sh {:dir dir} "git" "push")
          (u/sh {:dir dir} "git" "push" "--tags" "origin" "master"))
        (validate-heroku-buildpack)))))
