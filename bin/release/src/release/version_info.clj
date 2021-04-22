(ns release.version-info
  "Code for generating, uploading, and validating version-info.json."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.github :as github]))

(defn- version-info-filename []
  (case (c/edition)
    :oss "version-info.json"
    :ee  "version-info-ee.json"
    nil))

(defn- version-info-url
  "The base name of the version-info.json file, which includes an -ee suffix for :ee edition."
  []
  (format "static.metabase.com/%s" (version-info-filename)))

(defn- tmp-version-info-filename
  "The name of the temp file to create for generating the current version info file."
  []
  (format "/tmp/%s" (version-info-filename)))

(defn- current-version-info
  "Fetch the current version of the version info file via HTTP."
  []
  (u/step "Fetch existing version info file"
    (let [{:keys [status body], :as response} (http/get (str "http://" (version-info-url)))]
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
   :released   (str (java.time.LocalDate/now))
   :patch      (c/patch-version?)
   ;; TODO -- these need to be curated a bit before publishing...
   :highlights (mapv :title (github/milestone-issues))})

(defn- generate-version-info! []
  (let [filename (version-info-filename)
        tmpname  (tmp-version-info-filename)]
    (u/step (format "Generate %s" filename)
      (u/step (format "Delete and create %s" tmpname)
        (u/delete-file-if-exists! tmpname)
        (let [{:keys [latest], :as info} (current-version-info)]
          (spit tmpname (-> info
                            ;; move the current `:latest` to the beginning of `:older`
                            (update :older (fn [older]
                                             (distinct (cons latest older))))
                            (assoc :latest (info-for-new-version))
                            json/generate-string)))))))

(defn- upload-version-info! []
  (u/step "Upload version info"
    (u/s3-copy! (format "s3://%s" (version-info-url)) (format "s3://%s.previous" (version-info-url)))
    (u/s3-copy! (u/assert-file-exists (tmp-version-info-filename)) (format "s3://%s" (version-info-url)))))

(defn- validate-version-info []
  (u/step (format "Validate version info at %s" (version-info-url))
    (let [info           (current-version-info)
          latest-version (-> info :latest :version)]
      (u/announce "Latest version from %s is %s" (version-info-url) latest-version)
      (when-not (= latest-version (str "v" (c/version)))
        (throw (ex-info "Latest version is %s; expected %s" latest-version (str "v" (c/version))
                        {:version-info info})))
      (u/announce (format "%s is valid." (version-info-filename))))))

(defn- update-version-info!* []
  (generate-version-info!)
  (upload-version-info!)
  (validate-version-info)
  (u/announce (format "%s updated." (version-info-filename))))

(defn update-version-info! []
  (u/step (format "Update %s" (version-info-filename))
    (cond
      (c/pre-release-version?)
      (u/announce "Pre-release version, not updating version-info.json")

      (not (c/latest-version?))
      (u/announce "Not the latest version, not updating version-info.json")

      :else
      (update-version-info!*))))
