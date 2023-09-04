(ns release.version-info
  "Code for generating, uploading, and validating version-info.json."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabuild-common.core :as u]
   [release.common :as c]
   [release.common.github :as github])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(defn- version-info-filename
  [edition]
  (case edition
    :oss "version-info.json"
    :ee  "version-info-ee.json"
    nil))

(defn- version-info-url
  "The base name of the version-info.json file, which includes an -ee suffix for :ee edition."
  [edition]
  (format "static.metabase.com/%s" (version-info-filename edition)))

(defn- tmp-version-info-filename
  "The name of the temp file to create for generating the current version info file."
  [edition]
  (format "/tmp/%s" (version-info-filename edition)))

(defn- current-version-info
  "Fetch the current version of the version info file via HTTP."
  [edition]
  (u/step "Fetch existing version info file"
    (let [{:keys [status body], :as _response} (http/get (str "http://" (version-info-url edition)))]
      (when (>= status 400)
        (throw (ex-info (format "Error fetching version info: status code %d" status)
                        (try
                          {:body (json/parse-string body true)}
                          (catch Throwable _
                            {:body body})))))
      (json/parse-string body true))))

(defn- info-for-new-version
  "The info map for the version we're currently releasing to add to the version info file."
  []
  {:version    (str "v" (c/version))
   :released   (str (LocalDate/now))
   :patch      (c/patch-version?)
   ;; TODO -- these need to be curated a bit before publishing...
   :highlights (mapv :title (github/milestone-issues))})

(defn- generate-updated-version-info
  [edition]
  (u/step (format "Generate %s" (version-info-filename edition))
    (let [{:keys [latest], :as info} (current-version-info edition)]
      (-> info
          ;; move the current `:latest` to the beginning of `:older`
          (update :older (fn [older]
                           (distinct (cons latest older))))
          (assoc :latest (info-for-new-version))))))

(defn- save-version-info!
  [edition version-info]
  (let [tmpname  (tmp-version-info-filename edition)]
    (u/step (format "Delete and create %s" tmpname)
      (u/delete-file-if-exists! tmpname)
      (spit tmpname (json/generate-string version-info)))))

(defn- upload-version-info!
  [edition]
  (u/step "Upload version info"
    (u/s3-copy! (format "s3://%s" (version-info-url edition)) (format "s3://%s.previous" (version-info-url edition)))
    (u/s3-copy! (u/assert-file-exists (tmp-version-info-filename edition)) (format "s3://%s" (version-info-url edition)))
    (u/create-cloudfront-invalidation! c/static-cloudfront-distribution-id (format "/%s" (version-info-filename edition)))))

(defn- validate-version-info
  [edition]
  (u/step (format "Validate version info at %s" (version-info-url edition))
    (let [info           (current-version-info edition)
          latest-version (-> info :latest :version)]
      (u/announce "Latest version from %s is %s" (version-info-url edition) latest-version)
      (when-not (= latest-version (str "v" (c/version)))
        (throw (ex-info (format "Latest version is %s; expected %s" latest-version (str "v" (c/version)))
                        {:version-info info})))
      (u/announce (format "%s is valid." (version-info-filename edition))))))

(defn- update-version-info!*
  [edition]
  (save-version-info! (generate-updated-version-info edition) edition)
  (upload-version-info! edition)
  (validate-version-info edition)
  (u/announce (format "%s updated." (version-info-filename edition))))

(defn update-version-info!
  "If we're on the latest, non-pre-release version, generate a new version-info blob and upload it to S3."
  []
  (u/step (format "Update %s" (version-info-filename))
    (cond
      (c/pre-release-version?)
      (u/announce "Pre-release version, not updating version-info.json")

      (not (c/latest-version?))
      (u/announce "Not the latest version, not updating version-info.json")

      :else
      (update-version-info!* (c/edition)))))

(defn update-announcement-url!
  "Not part of the main build process. Set latest.announcement_url in the edition-appropriate version-info JSON file"
  [{ee-or-oss-string :edition announcement-url :url}]
  (u/exit-when-finished-nonzero-on-exception
    (let [edition      (keyword ee-or-oss-string)
          _            (assert (#{:ee :oss} edition) "The edition must be either `ee' or `oss'")
          updated-info (assoc-in (current-version-info edition) [:latest :announcement_url] announcement-url)]
      (save-version-info! edition updated-info)
      (upload-version-info! edition))))
