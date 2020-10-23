(ns release.elastic-beanstalk
  "Code related to building and publishing Elastic Beanstalk artifacts."
  (:require [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.http :as common.http]))

(defn- validate-elastic-beanstalk-artifacts []
  (u/step "Validate Elastic Beanstalk artifacts"
    (common.http/check-url-exists (c/artifact-download-url "launch-aws-eb.html"))
    (common.http/check-url-exists (c/artifact-download-url "metabase-aws-eb.zip"))))

;; TODO -- we should merge the EB build logic into this script, it's still an ancient bash script
(defn publish-elastic-beanstalk-artifacts! []
  (u/step "Create and publish Elastic Beanstalk artifacts"
    (u/sh {:dir c/root-directory} "./bin/aws-eb-docker/release-eb-version.sh" (str "v" (c/version))))
  (validate-elastic-beanstalk-artifacts))
