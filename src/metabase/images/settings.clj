(ns metabase.images.settings
  (:require
   [metabase.settings.core :as settings]
   [metabase.util.i18n :as i18n]))

(settings/defsetting image-upload-bucket
  (i18n/deferred-tru "S3 bucket to upload images to.")
  :type :string
  :visibility :admin
  :encryption :no)

(settings/defsetting image-upload-aws-access-key-id
  (i18n/deferred-tru "AWS access key ID for image uploads.")
  :type :string
  :visibility :admin
  :encryption :no)

(settings/defsetting image-upload-aws-secret-access-key
  (i18n/deferred-tru "AWS Secret Access Key for image uploads.")
  :type :string
  :visibility :admin
  :encryption :when-encryption-key-set)
