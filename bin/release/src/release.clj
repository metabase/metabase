(ns release
  (:require [clojure.string :as str]
            [environ.core :as env]
            [flatland.ordered.map :as ordered-map]
            [metabuild-common.core :as u]
            [release.check-prereqs :as check-prereqs]
            [release.checkout-latest :as checkout-latest]
            [release.common :as c]
            [release.common.slack :as slack]
            [release.docker :as docker]
            [release.draft-release :as draft-release]
            [release.elastic-beanstalk :as eb]
            [release.git-tags :as git-tags]
            [release.heroku :as heroku]
            [release.set-build-options :as set-build-options]
            [release.uberjar :as uberjar]
            [release.update-website :as update-website]
            [release.version-info :as version-info]))

(set! *warn-on-reflection* true)

(def ^:private steps*
  (ordered-map/ordered-map
   :checkout-latest                     checkout-latest/checkout-latest!
   :build-uberjar                       uberjar/build-uberjar!
   :build-docker                        docker/build-docker-image!
   :push-git-tags                       git-tags/push-tags!
   :upload-uberjar                      uberjar/upload-uberjar!
   :push-docker-image                   docker/push-docker-image!
   :publish-draft-release               draft-release/create-draft-release!
   :update-heroku-buildpack             heroku/update-heroku-buildpack!
   :publish-elastic-beanstalk-artifacts eb/publish-elastic-beanstalk-artifacts!
   :update-docs                         update-website/update-website!
   :update-version-info                 version-info/update-version-info!))

(defn- do-steps! [steps]
  (slack/post-message! "%s started building %s `v%s` from branch `%s`..."
                       (env/env :user)
                       (str/upper-case (name (c/edition)))
                       (c/version)
                       (c/branch))
  (doseq [step-name steps]
    (slack/post-message! "Starting step `%s` for `%s` :flushed:" (c/version) step-name)
    (let [thunk (or (get steps* step-name)
                    (throw (ex-info (format "Invalid step name: %s" step-name)
                                    {:found (set (keys steps*))})))]
      (thunk))
    (slack/post-message! "Finished `%s` for `%s` :partyparrot:" step-name (c/version)))
  (u/announce "Success."))

(defn -main [& steps]
  (u/exit-when-finished-nonzero-on-exception
    (check-prereqs/check-prereqs)
    (set-build-options/prompt-and-set-build-options!)
    (let [steps (or (seq (map keyword steps))
                    (keys steps*))]
      (do-steps! steps))))
