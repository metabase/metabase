(ns metabuild-common.aws
  (:require
   [environ.core]
   [metabuild-common.env :as env]
   [metabuild-common.output :as out]
   [metabuild-common.shell :as sh]
   [metabuild-common.steps :as steps]))

(defn aws-profile []
  (when (not (contains? environ.core/env :ci))
    (env/env-or-throw :aws-default-profile)))

(defn s3-copy!
  ([source dest]
   (s3-copy! (aws-profile) source dest))

  ([aws-profile source dest]
   (steps/step (format "[S3] Copy %s -> %s" source dest)
     (sh/sh "aws" "s3"
            "--profile" aws-profile
            "cp" source dest))))

(defn create-cloudfront-invalidation!
  ([cloudfront-distribution-id paths]
   (create-cloudfront-invalidation! (aws-profile) cloudfront-distribution-id paths))

  ([aws-profile cloudfront-distribution-id paths]
   (steps/step "Create CloudFront invalidation"
     (steps/step "Enable CloudFront CLI"
       (sh/sh "aws" "configure" "set" "preview.cloudfront" "true"))
     (steps/step "Invalidate /appcast.xml"
       (sh/sh "aws" "cloudfront" "create-invalidation"
              "--profile" aws-profile
              "--distribution-id" cloudfront-distribution-id
              "--paths" paths))
     (out/announce "Invalidation created successfully."))))
