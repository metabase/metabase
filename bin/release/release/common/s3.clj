(ns release.common.s3
  (:require [metabuild-common.core :as u]))

(defn s3-copy! [source dest]
  (u/step (format "[S3] Copy %s -> %s" source dest)
          (u/sh "aws" "s3" "cp" source dest)))
