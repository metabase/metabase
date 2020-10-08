(ns release.publish
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [release.common :as c]
            [release.common.github :as github]))

(def ^:private version-info-url
  "static.metabase.com/version-info.json")

(def ^:private tmp-version-info-filename
  "/tmp/version-info.json")

(defn- current-version-info
  "Fetch the current version of `version-info.json`."
  []
  (-> (http/get (str "http://" version-info-url))
      :body
      (json/parse-string true)))

(defn- patch-version?
  "Is `version` a patch release? True for versions that end in things like `.1` (non-zero patch number)"
  [version]
  (if-let [[_ patch] (re-matches #"^\d+\.\d+\.(\d+).*$" version)]
    (not (zero? (Integer/parseUnsignedInt patch)))
    false))

(defn- info-for-new-version
  "The info map for the version we're currently releasing to add to `version-info.json`."
  []
  {:version    (str "v" (c/version))
   :released   (str (java.time.LocalDate/now))
   :patch      (patch-version? (c/version))
   ;; TODO -- these need to be curated a bit before publishing...
   :highlights (mapv :title (github/milestone-issues))})

(defn- generate-version-info! []
  (c/step "Generate version info file"
    (cond
      (c/pre-release-version?)
      (c/announce "Pre-release version -- not generating version info file")

      (= (c/edition) :ee)
      (c/announce "EE build -- not generating version info file")

      :else
      (c/step (format "Generate %s" tmp-version-info-filename)
        (c/delete-file! tmp-version-info-filename)
        (let [{:keys [latest], :as info} (current-version-info)]
          (spit tmp-version-info-filename (-> info
                                              ;; move the current `:latest` to the beginning of `:older`
                                              (update :older (fn [older]
                                                               (cons latest older)))
                                              (assoc :latest (info-for-new-version))
                                              json/generate-string)))))))

(defn- s3-copy! [source dest]
  (c/step (format "[S3] Copy %s -> %s" source dest)
    (c/sh "aws" "s3" "cp" source dest)))

(defn- upload-artifacts! []
  (c/step "Upload artifacts"
    (c/step "Upload uberjar"
      (s3-copy! (c/assert-file-exists c/uberjar-path) (c/s3-artifact-url "metabase.jar")))
    (c/step "Upload version info"
      (cond
        (c/pre-release-version?)
        (c/announce "Pre-release version -- not uploading version info file")

        (= (c/edition) :ee)
        (c/announce "EE build -- not uploading version info file")

        :else
        (do
          (s3-copy! (format "s3://%s" version-info-url) (format "s3://%s.previous" version-info-url))
          (s3-copy! (c/assert-file-exists tmp-version-info-filename) (format "s3://%s" version-info-url)))))))

(defn- push-docker-image! []
  (c/step "Push Docker image"
    (c/sh "docker" "push" (c/docker-tag))
    (when (and (= (c/edition) :ee)
               (not (c/pre-release-version?)))
      (let [latest-tag "metabase/metabase-enterprise:latest"]
        (c/step (format "Pushing tag %s" latest-tag)
          (c/sh "docker" "tag" (c/docker-tag) latest-tag)
          (c/sh "docker" "push" latest-tag ))))))

;; TODO -- we should merge the EB build logic into this script, it's still an ancient bash script
(defn- publish-elastic-beanstalk-artifacts! []
  (c/step "Create and publish Elastic Beanstalk artifacts"
    (c/sh {:dir c/root-directory} "./bin/aws-eb-docker/release-eb-version.sh" (str "v" (c/version)))))

;; TODO -- I think most of this should be done as part of `build` -- everything besides publishing
(defn- push-heroku-buildpack! []
  (c/step "Update Metabase Heroku buildpack"
    (cond
      (c/pre-release-version?)
      (c/announce "Pre-release version -- not updating Heroku buildpack ")

      (= (c/edition) :ee)
      (c/announce "EE build -- not updating Herkou buildpack")

      :else
      (let [heroku-repo "metabase/metabase-buildpack"
            dir         "/tmp/metabase-heroku-buildpack"]
        (c/step "Clone Herkou Buildpack repo"
          (c/delete-file! dir)
          (c/sh "git" "clone" (format "git@github.com:%s.git" heroku-repo) dir))
        (let [version-file (c/assert-file-exists (str dir "/bin/version"))]
          (c/step (format "Update %s" (pr-str version-file))
            (spit version-file (str (c/version) "\n"))
            (c/sh {:dir dir} "git" "commit" "-m" (format "v%s" (c/version)))))
        (c/step "Delete old tags"
          (try
            (c/sh {:dir dir} "git" "push" "--delete" "origin" (c/version))
            (catch Throwable _
              (c/announce "Nothing to delete."))))
        (c/step "Push updated tag"
          (c/sh {:dir dir} "git" "tag" (c/version))
          (c/sh {:dir dir} "git" "push")
          (c/sh {:dir dir} "git" "push" "--tags" "origin" "master"))))))

;; TODO -- is it ok that this happens here, or should it happen *before* the draft release?
(defn- push-tags! []
  (c/step "Push updated tags to GitHub"
    (c/step "Delete old tags"
      (try
        (c/sh "git" "push" "--delete" "origin" (str "v" (c/version)))
        (catch Throwable _
          (c/announce "Nothing to delete."))))
    (c/step "Push updated tag"
      (c/sh "git" "tag" "-a" (str "v" (c/version)) "-m" (str "v" (c/version)))
      (c/sh "git" "push" "--follow-tags" "-u" "origin" (c/branch)))
    (c/announce "Tags updated.")))

;; TODO -- consider whether this should go in its own namespace
(defn- publish-docs! []
  (c/step "Update Metabase docs"
    (cond
      (c/pre-release-version?)
      (c/announce "Pre-release version -- not updating Metabase docs")

      (= (c/edition) :ee)
      (c/announce "EE build -- not updating Metabase docs")

      :else
      (do
        ;; TODO
        ;;
        ;; if [ "${METABASE_WEBSITE_REPO-}" ]; then
        ;;     pull-repo "$METABASE_WEBSITE_REPO" "$METABASE_WEBSITE_BRANCH"
        ;; fi
        ;;
        ;; pushd "$METABASE_WEBSITE_DIR"
        ;;
        ;; yarn install
        ;;
        ;; ./script/docs "v$VERSION" $*
        ;;
        ;; git add .
        ;; git commit -m "v$VERSION" || true
        ;;
        ;; echo "delete old tags"
        ;; git push --delete origin "v$VERSION" || true
        ;; git tag --delete "v$VERSION" || true

        ;; echo "tag it"
        ;; git tag -a "v$VERSION" -m "v$VERSION"
        ;; git push --follow-tags -u origin "$METABASE_WEBSITE_BRANCH"
        ;;
        ;; popd
        ;;
        ;; echo "Updating website to latest release"
        ;; release-docs --latest
        ))))

(defn publish! []
  (c/step "Publish release"
    (generate-version-info!)
    (upload-artifacts!)
    (push-docker-image!)
    (publish-elastic-beanstalk-artifacts!)
    (push-heroku-buildpack!)
    (push-tags!)
    (publish-docs!)
    (c/announce "Release published successfully.")))
