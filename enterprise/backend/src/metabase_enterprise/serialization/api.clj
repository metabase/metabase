(ns metabase-enterprise.serialization.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [java-time.api :as t]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.logger :as logger]
   [metabase.models.serialization :as serdes]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.random :as u.random]
   [ring.core.protocols :as ring.protocols])
  (:import
   (java.io ByteArrayOutputStream File)))

(set! *warn-on-reflection* true)

;;; Storage

(def parent-dir "Dir for storing serialization API export-in-progress and archives."
  (let [f (io/file (System/getProperty "java.io.tmpdir") (str "serdesv2-" (u.random/random-name)))]
    (.mkdirs f)
    (.deleteOnExit f)
    (.getPath f)))

;;; Request callbacks

(defn- ba-copy [f]
  (with-open [baos (ByteArrayOutputStream.)]
    (io/copy f baos)
    (.toByteArray baos)))

(defn- on-response! [data callback]
  (reify
    ;; Real HTTP requests and mt/user-real-request go here
    ring.protocols/StreamableResponseBody
    (write-body-to-stream [_ response out]
      (ring.protocols/write-body-to-stream data response out)
      (future (callback)))

    ;; mt/user-http-request goes here
    clojure.java.io.IOFactory
    (make-input-stream [_ _]
      (let [res (io/input-stream (if (instance? File data)
                                   (ba-copy data)
                                   data))]
        (callback)
        res))))

;;; Logic

(defn- serialize&pack ^File [{:keys [dirname] :as opts}]
  (let [dirname  (or dirname
                     (format "%s-%s"
                             (u/slugify (public-settings/site-name))
                             (u.date/format "YYYY-MM-dd_HH-mm" (t/local-date-time))))
        path     (io/file parent-dir dirname)
        dst      (io/file (str (.getPath path) ".tar.gz"))
        log-file (io/file path "export.log")
        err      (atom nil)
        report   (with-open [_logger (logger/for-ns 'metabase-enterprise.serialization log-file)]
                   (try                 ; try/catch inside logging to log errors
                     (let [report (serdes/with-cache
                                    (-> (extract/extract opts)
                                        (storage/store! path)))]
                       ;; not removing dumped yamls immediately to save some time before response
                       (u.compress/tgz path dst)
                       report)
                     (catch Exception e
                       (reset! err e)
                       (log/error e "Error during serialization"))))]
    {:archive       (when (.exists dst)
                      dst)
     :log-file      (when (.exists log-file)
                      log-file)
     :report        report
     :error-message (some-> @err str)
     :callback      (fn []
                      (when (.exists path)
                        (run! io/delete-file (reverse (file-seq path))))
                      (when (.exists dst)
                        (io/delete-file dst)))}))

(defn- unpack&import [^File file & [size]]
  (let [dst      (io/file parent-dir (u.random/random-name))
        log-file (io/file dst "import.log")
        err      (atom nil)
        report   (with-open [_logger (logger/for-ns 'metabase-enterprise.serialization log-file)]
                   (try                 ; try/catch inside logging to log errors
                     (log/infof "Serdes import, size %s" size)
                     (let [path (u.compress/untgz file dst)]
                       (serdes/with-cache
                         (-> (v2.ingest/ingest-yaml (.getPath (io/file dst path)))
                             (v2.load/load-metabase!))))
                     (catch Exception e
                       (reset! err e)
                       (log/error e "Error during serialization"))))]
    {:log-file      log-file
     :error-message (some-> @err str)
     :report        report
     :callback      #(when (.exists dst)
                       (run! io/delete-file (reverse (file-seq dst))))}))

;;; HTTP API

(api/defendpoint POST "/export"
  "Serialize and retrieve Metabase instance.

  Parameters:
  - `dirname`: str, name of directory and archive file (default: `<instance-name>-<YYYY-MM-dd_HH-mm>`)
  - `all_collections`: bool, serialize all collections (default: true, unless you specify `collection`)
  - `collection`: array of int, db id of a collection to serialize
  - `settings`: bool, if Metabase settings should be serialized (default: `true`)
  - `data_model`: bool, if Metabase data model should be serialized (default: `true`)
  - `field_values`: bool, if cached field values should be serialized (default: `false`)
  - `database_secrets`: bool, if details how to connect to each db should be serialized (default: `false`)

  Outputs .tar.gz file with serialization results and an `export.log` file.
  On error just returns serialization logs."
  [:as {{:strs [all_collections collection settings data_model field_values database_secrets dirname]
         :or   {all_collections true
                settings        true
                data_model      true}}
        :query-params}]
  {collection       [:maybe [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} ms/PositiveInt]]
   all_collections  [:maybe ms/BooleanValue]
   settings         [:maybe ms/BooleanValue]
   data_model       [:maybe ms/BooleanValue]
   field_values     [:maybe ms/BooleanValue]
   database_secrets [:maybe ms/BooleanValue]}
  (api/check-superuser)
  (let [start              (System/nanoTime)
        opts               {:targets                  (mapv #(vector "Collection" %)
                                                            collection)
                            :no-collections           (and (empty? collection)
                                                           (not all_collections))
                            :no-data-model            (not data_model)
                            :no-settings              (not settings)
                            :include-field-values     field_values
                            :include-database-secrets database_secrets
                            :dirname                  dirname}
        {:keys [archive
                log-file
                report
                error-message
                callback]} (serialize&pack opts)]
    (snowplow/track-event! ::snowplow/serialization api/*current-user-id*
                           {:direction       "export"
                            :source          "api"
                            :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                            :count           (count (:seen report))
                            :collection      (str/join "," (map str collection))
                            :all_collections (and (empty? collection)
                                                  (not (:no-collections opts)))
                            :data_model      (not (:no-data-model opts))
                            :settings        (not (:no-settings opts))
                            :field_values    (:include-field-values opts)
                            :secrets         (:include-database-secrets opts)
                            :success         (boolean archive)
                            :error_message   error-message})
    (if archive
      {:status  200
       :headers {"Content-Type"        "application/gzip"
                 "Content-Disposition" (format "attachment; filename=\"%s\"" (.getName ^File archive))}
       :body    (on-response! archive callback)}
      {:status  500
       :headers {"Content-Type" "text/plain"}
       :body    (on-response! log-file callback)})))

(api/defendpoint ^:multipart POST "/import"
  "Deserialize Metabase instance from an archive generated by /export.

  Parameters:
  - `file`: archive encoded as `multipart/form-data` (required).

  Returns logs of deserialization."
  [:as {raw-params :params}]
  (api/check-superuser)
  (try
    (let [start              (System/nanoTime)
          {:keys [log-file
                  error-message
                  report
                  callback]} (unpack&import (get-in raw-params ["file" :tempfile])
                                            (get-in raw-params ["file" :size]))
          imported           (into (sorted-set) (map (comp :model last)) (:seen report))]
      (snowplow/track-event! ::snowplow/serialization api/*current-user-id*
                             {:direction     "import"
                              :source        "api"
                              :duration_ms   (int (/ (- (System/nanoTime) start) 1e6))
                              :models        (str/join "," imported)
                              :count         (if (contains? imported "Setting")
                                               (inc (count (remove #(= "Setting" (:model (first %))) (:seen report))))
                                               (count (:seen report)))
                              :success       (not error-message)
                              :error_message error-message})
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    (on-response! log-file callback)})
    (finally
      (io/delete-file (get-in raw-params ["file" :tempfile])))))

(api/define-routes +auth)
