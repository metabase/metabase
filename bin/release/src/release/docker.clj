(ns release.docker
  "Code related to building, pushing, and validating new Docker images."
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn build-docker-image! []
  (u/step "Build Docker image"
    (let [docker-dir   (u/filename c/root-directory "bin" "docker")
          uberjar-path (u/filename docker-dir "metabase.jar")]
      (u/delete-file-if-exists! uberjar-path)
      (u/copy-file! (u/assert-file-exists c/uberjar-path) uberjar-path)
      (u/assert-file-exists uberjar-path)
      (u/sh "docker" "build" "--no-cache" "--pull" "-t" (c/docker-tag) docker-dir))))

(defn- validate-docker-image []
  (u/step "Validate Docker image"
    (u/announce "TODO")
    ;;   image="$1"
    ;;   docker pull "$image" > /dev/null
    ;;   docker_hash=$(docker run --rm "$image" version | grep -Eo 'hash [0-9a-f]+' | awk '{ print $2 }')
    ;;   check-equals "docker: image tagged "$image" commit hash" "$tag_hash" "$docker_hash"

    ;; check-docker-image "$METABASE_DOCKER_REPO:v$VERSION"
    ))

(defn push-docker-image! []
  (u/step "Push Docker image"
    (u/sh "docker" "push" (c/docker-tag))
    (let [latest-tag (str (c/docker-image-name) ":latest")]
      (cond
        (c/pre-release-version?)
        (u/announce "Pre release version -- not pushing %s" latest-tag)

        (not (c/latest-version?))
        (u/announce "Version is not latest -- not pushing %s" latest-tag)

        :else
        (u/step (format "Pushing tag %s" latest-tag)
          (u/sh "docker" "tag" (c/docker-tag) latest-tag)
          (u/sh "docker" "push" latest-tag)))))
  (validate-docker-image))
