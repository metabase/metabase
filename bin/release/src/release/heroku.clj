(ns release.heroku
  "Code related to updating the Heroku build pack."
  (:require [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.git :as git]))

(def ^:private heroku-repo "metabase/metabase-buildpack")

(def ^:private dir "/tmp/metabase-heroku-buildpack")

(def ^:private version-file (str dir "/bin/version"))

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

      (not (c/latest-version?))
      (u/announce "Not the latest version -- not updating Heroku buildpack")

      :else
      (do
        (u/step (format "Clone Herkou Buildpack repo %s to %s" heroku-repo dir)
          (u/delete-file! dir)
          (u/sh "git" "clone" (format "git@github.com:%s.git" heroku-repo) dir))
        (u/step (format "Update %s" (pr-str version-file))
          (u/assert-file-exists version-file)
          (spit version-file (str (c/version) "\n"))
          (when-not (zero? (:exit (u/sh* {:dir dir} "git" "commit" "-am" (format "v%s" (c/version)))))
            (u/announce "Nothing to update")))
        (git/delete-local-tag! dir (c/version))
        (git/delete-remote-tag! dir (c/version))
        (u/step "Push updated tag"
          (u/sh {:dir dir} "git" "tag" (c/version))
          (u/sh {:dir dir} "git" "push")
          (u/sh {:dir dir} "git" "push" "--tags" "origin" "master"))
        (validate-heroku-buildpack)))))
