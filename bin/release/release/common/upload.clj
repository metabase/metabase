(ns release.common.upload
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn upload-artifact!
  "Upload an artifact to downloads.metabase.com and create a CloudFront invalidation."
  ([source-file filename]
   (upload-artifact! source-file (c/version) filename))

  ([source-file version filename]
   (u/step (format "Upload %s to %s" source-file (c/artifact-download-url version filename))
     (u/s3-copy! (u/assert-file-exists source-file) (c/s3-artifact-url version filename))
     (u/create-cloudfront-invalidation! c/cloudfront-distribution-id (c/s3-artifact-path version filename)))))
