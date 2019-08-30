(ns metabase.api.dump
  "/api/dump endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.cmd :as cmd]
            [metabase.util
             [i18n :refer [trs tru]]
             [schema :as su]]))

(api/defendpoint
  POST "/to-h2"
  "Dump db to H2 file."
  [:as {{:keys [h2-filename] :as body} :body}]
  {h2-filename su/NonBlankString}
  (log/info (trs "Dumping to H2: {0}" h2-filename))
  (cmd/dump-to-h2 h2-filename))

(api/defendpoint
  POST "/load"
  "Load H2 dump"
  [:as {{:keys [h2-filename]} :body}]
  {h2-filename su/NonBlankString}
  (log/info (trs "Loading from H2: {0}" h2-filename))
  (cmd/load-from-h2 h2-filename))

(api/defendpoint
  POST "/secure-upload"
  "Encrypt, compress, and upload an H2 dump to S3. Does not perform an H2 dump."
  [:as {{:keys [s3-upload-str h2-filename] :as body} :body}]
  {s3-upload-str su/NonBlankString
   h2-filename   su/NonBlankString}
  (log/info (trs "Secure dump and upload: {0} {1}" s3-upload-str h2-filename))
  (cmd/secure-dump-and-upload s3-upload-str h2-filename))

(api/defendpoint
  POST "/download-and-unlock"
  "Download, uncompress, and unencrypt secure dump from S3. Does not load the H2 db."
  [:as {{:keys [h2-filename s3-bucket s3-key secret-key] :as body} :body}]
  {h2-filename su/NonBlankString
   s3-bucket   su/NonBlankString
   s3-key      su/NonBlankString
   secret-key  su/NonBlankString}
  (log/info (trs "Download secure dump: {0} {1} {2} {3}" h2-filename s3-bucket s3-key (count secret-key)))
  (cmd/secure-dump-download-and-unlock h2-filename s3-bucket s3-key secret-key))

(api/define-routes)
