(ns release.docker
  "Code related to building, pushing, and validating new Docker images."
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn build-docker-image! []
  (u/step "Build Docker image"
    (u/copy-file! (u/assert-file-exists c/uberjar-path) (str c/root-directory "/bin/docker/metabase.jar"))
    (u/sh "docker" "build" "-t" (c/docker-tag) (str c/root-directory "/bin/docker"))))

(defn- validate-docker-image []
  (u/step "Validate Docker image"
    ;;   image="$1"
    ;;   docker pull "$image" > /dev/null
    ;;   docker_hash=$(docker run --rm "$image" version | grep -Eo 'hash [0-9a-f]+' | awk '{ print $2 }')
    ;;   check-equals "docker: image tagged "$image" commit hash" "$tag_hash" "$docker_hash"

    ;; check-docker-image "$METABASE_DOCKER_REPO:v$VERSION"
    ))

(defn push-docker-image! []
  (u/step "Push Docker image"
    (u/sh "docker" "push" (c/docker-tag))
    (when (and (= (c/edition) :ee)
               (not (c/pre-release-version?)))
      (let [latest-tag "metabase/metabase-enterprise:latest"]
        (u/step (format "Pushing tag %s" latest-tag)
          (u/sh "docker" "tag" (c/docker-tag) latest-tag)
          (u/sh "docker" "push" latest-tag )))))
  (validate-docker-image))
