(ns metabase.api.dump
  "/api/dump endpoints."
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.cmd :as cmd]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database]]
             [query :as query]]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [async :as qp.async]
             [util :as qputil]]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.util
             [date :as du]
             [export :as ex]
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s]
            [metabase.api.dataset :as dataset-api])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))


(def dump-targets
  "Map of export types to their relevant metadata"
  {"h2" {}})

(def DumpTarget
  "Schema for valid dump target formats."
  (apply s/enum (keys {"h2" {}})))

(def dump-target-regex
  "Regex for matching valid export formats (e.g., `json`) for queries.
   Inteneded for use in an endpoint definition:

     (api/defendpoint POST [\"/:export-format\", :export-format export-format-regex]"
  (re-pattern (str "(" (str/join "|" (keys dump-targets)) ")")))

(s/defn as-async
  "Write the results of an async query to API `respond` or `raise` functions in `export-format`. `in-chan` should be a
  core.async channel that can be used to fetch the results of the query."
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

;; curl -i -X POST -H "Content-Type: application/json" -d '{"db-conn-str": "test1", "h2-conn-str": "test2"}'  -H "X-Metabase-Session: 273cdf75-3e9a-42e7-a7fd-57421d69ec76" "localhost:3000/api/dump/to-h2"
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
