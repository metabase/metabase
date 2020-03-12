(ns macos-release.upload
  (:require [macos-release.common :as c]))

(def ^:private aws-profile "metabase")
(def ^:private s3-bucket "downloads.metabase.com")
(def ^:private cloudfront-distribution-id "E35CJLWZIZVG7K")

(def ^:private upload-dir (c/artifact "upload"))

(defn- copy-files-to-upload-dir! []
  (c/delete-file! upload-dir)
  (c/step (format "Copy files to %s" upload-dir)
    (c/step "Copy top-level files"
      (c/create-directory-unless-exists! upload-dir)
      (c/copy-file! (c/assert-file-exists (c/artifact "appcast.xml")) (str upload-dir "/appcast.xml")))
    (let [version-upload-dir (str upload-dir "/v" (c/version))]
      (c/step (format "Copy files to %s" version-upload-dir)
        (c/create-directory-unless-exists! version-upload-dir)
        (doseq [file ["Metabase.zip" "Metabase.dmg" "release-notes.html"]]
          (c/copy-file! (c/assert-file-exists (c/artifact file)) (str version-upload-dir "/" file)))))))

(defn- upload-artifacts! []
  (c/step "Upload artifacts to https://downloads.metabase.com"
    (c/sh "aws" "--recursive"
          "--profile" aws-profile
          "--region" "us-east-1"
          "s3" "cp" upload-dir
          (format "s3://%s" s3-bucket))
    (c/announce "All files uploaded.")))

(defn- create-cloudfront-invalidation! []
  (c/step "Create CloudFront invalidation"
    (c/step "Enable CloudFront CLI"
      (c/sh "aws" "configure" "set" "preview.cloudfront" "true"))
    (c/step "Invalidate /appcast.xml"
      (c/sh "aws" "cloudfront" "create-invalidation"
            "--profile" aws-profile
            "--distribution-id" cloudfront-distribution-id
            "--paths" "/appcast.xml"))
    (c/announce "Invalidation created successfully.")))

(defn upload! []
  (c/step "Upload artifacts"
    (copy-files-to-upload-dir!)
    (upload-artifacts!)
    (create-cloudfront-invalidation!)))
