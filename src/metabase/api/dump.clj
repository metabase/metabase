(ns metabase.api.dump
  "/api/dump endpoints."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.cmd :as cmd]
            [metabase.util
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(s/defn as-async
  "Wait for in-chan to produce results and call proper fn with results or exception."
  {:style/indent 3}
  [respond :- (s/pred fn?), raise :- (s/pred fn?), in-chan :- ManyToManyChannel]
  (a/go
    (try
      (let [results (a/<! in-chan)]
        (if (instance? Throwable results)
          (raise results)
          (respond results)))
      (catch Throwable e
        (raise e))
      (finally
        (a/close! in-chan))))
  nil)

(api/defendpoint-async
  POST ["/to-h2"]
  "Dump db to H2 file."
  [{{:keys [h2-filename] :as body} :body} respond raise]
  {h2-filename su/NonBlankString}
  (as-async respond raise
            (let [c (a/chan)]
              (a/go
                (log/info (trs "Dumping to H2: " h2-filename))
                (cmd/dump-to-h2 h2-filename)
                (a/>! c {"status" "Done"}))
              c)))

(api/defendpoint-async
  POST ["/load"]
  "Load H2 dump"
  [{{:keys [h2-filename] :as body} :body} respond raise]
  {h2-filename su/NonBlankString}
  (as-async respond raise
            (let [c (a/chan)]
              (a/go
                (log/info (trs "Loading from H2: " h2-filename))
                (cmd/load-from-h2 h2-filename)
                (a/>! c {"status" "Done"}))
              c)))

(api/defendpoint-async
  POST ["/secure-upload"]
  "Encrypt, compress, and upload an H2 dump to S3. Does not perform an H2 dump."
  [{{:keys [s3-upload-str] :as body} :body} respond raise]
  {s3-upload-str su/NonBlankString}
  (as-async respond raise
            (let [c (a/chan)]
              (a/go
                (log/info (trs "Secure dump and upload: " s3-upload-str))
                (cmd/secure-dump-and-upload s3-upload-str nil)
                (a/>! c {"status" "Done"}))
              c)))

(api/defendpoint-async
  POST ["/download-and-unlock"]
  "Download, uncompress, and unencrypt secure dump from S3. Does not load the H2 db."
  [{{:keys [h2-dump-path s3-bucket s3-key secret-key] :as body} :body} respond raise]
  {h2-dump-path su/NonBlankString
   s3-bucket    su/NonBlankString
   s3-key       su/NonBlankString
   secret-key   su/NonBlankString}
  (as-async respond raise
            (let [c (a/chan)]
              (a/go
                (log/info (trs "Download secure dump: " h2-dump-path s3-bucket s3-key (count secret-key)))
                (cmd/secure-dump-download-and-unlock h2-dump-path s3-bucket s3-key secret-key)
                (a/>! c {"status" "Done"}))
              c)))

(api/define-routes)
