(ns release.uberjar
  "Code related to building, pushing, and validating metabase.jar"
  (:require [build :as build]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common.hash :as hash]
            [release.common.http :as common.http]
            [release.common.upload :as upload]))

(defn build-uberjar! []
  (u/step "Run bin/build to build uberjar"
    (u/delete-file-if-exists! (str c/root-directory "/target"))
    (build/build! {:version (str \v (c/version))
                   :edition (c/edition)})
    (u/step "Verify uberjar exists"
      (u/assert-file-exists c/uberjar-path))))

(defn- validate-uberjar []
  (u/step "Validate uberjar(s) on downloads.metabase.com"
    (doseq [url   [(c/artifact-download-url "metabase.jar")
                   (when (c/latest-version?)
                     (c/artifact-download-url "latest" "metabase.jar"))]
            :when url]
      (u/step (format "Validate %s" url)
        (common.http/check-url-exists url)
        (u/step (format "Check hash of %s" url)
          (let [temp-location "/tmp/metabase.jar"]
            (u/download-file! url temp-location)
            (let [uberjar-hash (hash/sha-256-sum c/uberjar-path)
                  url-hash     (hash/sha-256-sum temp-location)]
              (u/announce "Hash of local metabase.jar is %s" uberjar-hash)
              (u/announce "Hash of %s is %s" url url-hash)
              (assert (= uberjar-hash url-hash)))))))))

(defn upload-uberjar! []
  (u/step "Upload uberjar and validate"
    (u/step (format "Upload uberjar to %s" (c/artifact-download-url "metabase.jar"))
      (upload/upload-artifact! c/uberjar-path "metabase.jar"))
    ;; TODO -- would be a lot faster to copy to copy s3 -> s3 instead of uploading twice
    (let [latest-download-url (c/artifact-download-url "latest" "metabase.jar")]
      (cond
        (c/pre-release-version?)
        (u/announce "Pre release version -- not uploading %s" latest-download-url)

        (not (c/latest-version?))
        (u/announce "Not latest version -- not uploading %s" latest-download-url)

        :else
        (u/step (format "Upload uberjar to %s" latest-download-url)
          (upload/upload-artifact! c/uberjar-path "latest" "metabase.jar"))))
    (validate-uberjar)))
