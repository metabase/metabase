(ns release.version-info
  "Code for generating, uploading, and validating version-info.json."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.github :as github]))

(defn- version-info-url []
  (case (c/edition)
    :ce "static.metabase.com/version-info.json"
    nil))

(def ^:private tmp-version-info-filename
  "/tmp/version-info.json")

(defn- current-version-info
  "Fetch the current version of `version-info.json`."
  []
  (-> (http/get (str "http://" (version-info-url)))
      :body
      (json/parse-string true)))

(defn- info-for-new-version
  "The info map for the version we're currently releasing to add to `version-info.json`."
  []
  {:version    (str "v" (c/version))
   :released   (str (java.time.LocalDate/now))
   :patch      (c/patch-version?)
   ;; TODO -- these need to be curated a bit before publishing...
   :highlights (mapv :title (github/milestone-issues))})

(defn- generate-version-info! []
  (u/step "Generate version-info.json"
    (u/step (format "Generate %s" tmp-version-info-filename)
      (u/delete-file-if-exists! tmp-version-info-filename)
      (let [{:keys [latest], :as info} (current-version-info)]
        (spit tmp-version-info-filename (-> info
                                            ;; move the current `:latest` to the beginning of `:older`
                                            (update :older (fn [older]
                                                             (cons latest older)))
                                            (assoc :latest (info-for-new-version))
                                            json/generate-string))))))

(defn- upload-version-info! []
  (u/step "Upload version info"
    (u/s3-copy! (format "s3://%s" (version-info-url)) (format "s3://%s.previous" (version-info-url)))
    (u/s3-copy! (u/assert-file-exists tmp-version-info-filename) (format "s3://%s" (version-info-url)))))

(defn- validate-version-info []
  (u/step (format "Validate version info at %s" (version-info-url))
    (let [info           (u/step "Fetch version info"
                           (let [{:keys [status body], :as response} (http/get (str "http://" (version-info-url)))]
                             (when (>= status 400)
                               (throw (ex-info (format "Error fetching version info: status code %d" status)
                                               (try
                                                 {:body (json/parse-string body true)}
                                                 (catch Throwable _
                                                   {:body body})))))
                             (json/parse-string body true)))
          latest-version (-> info :latest :version)]
      (u/announce "Latest version from %s is %s" (version-info-url) latest-version)
      (when-not (= latest-version (str "v" (c/version)))
        (throw (ex-info "Latest version is %s; expected %s" latest-version (str "v" (c/version))
                        {:version-info info})))
      (u/announce "version-info.json is valid."))))

(defn- update-version-info!* []
  (generate-version-info!)
  (upload-version-info!)
  (validate-version-info)
  (u/announce "version-info.json updated."))

(defn update-version-info! []
  (u/step "Update version-info.json"
    (cond
      (c/pre-release-version?)
      (u/announce "Pre-release version, not updating version-info.json")

      (= (c/edition) :ee)
      (u/announce "Enterprise Edition release, not updating version-info.json")

      (not (c/latest-version?))
      (u/announce "Not the latest version, not updating version-info.json")

      :else
      (update-version-info!*))))
