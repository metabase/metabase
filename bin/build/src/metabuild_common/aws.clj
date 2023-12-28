(ns metabuild-common.aws
  (:require
   [environ.core]
   [metabuild-common.env :as env]
   [metabuild-common.output :as out]
   [metabuild-common.shell :as shell]
   [metabuild-common.steps :as steps]))

(defn- aws-profile []
  (when (not (contains? environ.core/env :ci))
    (env/env-or-throw :aws-default-profile)))

(defn s3-copy!
  "Shell out to `aws s3 cp` to copy something, either to an S3 bucket or across S3 buckets."
  ([source dest]
   (s3-copy! (aws-profile) source dest))

  ([aws-profile source dest]
   (steps/step (format "[S3] Copy %s -> %s" source dest)
     (shell/sh "aws" "s3"
               "--profile" aws-profile
               "cp" source dest))))

(defn create-cloudfront-invalidation!
  "Create a CloudFront invalidation for `paths` (e.g. the S3 artifacts like the `metabase.jar` we just uploaded, etc.)"
  ([cloudfront-distribution-id paths]
   (create-cloudfront-invalidation! (aws-profile) cloudfront-distribution-id paths))

  ([aws-profile cloudfront-distribution-id paths]
   (steps/step "Create CloudFront invalidation"
     (steps/step "Enable CloudFront CLI"
       (shell/sh "aws" "configure" "set" "preview.cloudfront" "true"))
     (steps/step (format "Invalidate %s" (pr-str paths))
       (shell/sh "aws" "cloudfront" "create-invalidation"
                 "--profile" aws-profile
                 "--distribution-id" cloudfront-distribution-id
                 "--paths" paths))
     (out/announce "Invalidation created successfully."))))
