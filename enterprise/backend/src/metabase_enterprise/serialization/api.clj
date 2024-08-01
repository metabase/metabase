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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.random :as u.random]
   [ring.core.protocols :as ring.protocols])
  (:import
   (java.io ByteArrayOutputStream File)))

(set! *warn-on-reflection* true)

(def ^:dynamic *additive-logging*
  "If custom loggers should pass logs to parent loggers (to system Metabase logs), used to clean up test output."
  true)

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
        report   (with-open [_logger (logger/for-ns 'metabase-enterprise.serialization log-file
                                                    {:additive *additive-logging*})]
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

(defn- find-serialization-dir
  "Find an actual top-level dir with serialization data inside, instead of picking up various .DS_Store and similar
  things."
  ^File [^File parent]
  (->> (.listFiles parent)
       (u/seek (fn [^File f]
                 (and (.isDirectory f)
                      (some v2.ingest/legal-top-level-paths (.list f)))))))

(defn- unpack&import [^File file & [size]]
  (let [dst      (io/file parent-dir (u.random/random-name))
        log-file (io/file dst "import.log")
        err      (atom nil)
        report   (with-open [_logger (logger/for-ns 'metabase-enterprise.serialization log-file
                                                    {:additive *additive-logging*})]
                   (try                 ; try/catch inside logging to log errors
                     (log/infof "Serdes import, size %s" size)
                     (let [cnt  (u.compress/untgz file dst)
                           path (find-serialization-dir dst)]
                       (when-not path
                         (throw (ex-info "No source dir detected" {:dst   (.getPath dst)
                                                                   :count cnt})))
                       (log/infof "In total %s entries unpacked, detected source dir: %s" cnt (.getName path))
                       (serdes/with-cache
                         (-> (v2.ingest/ingest-yaml (.getPath path))
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

  Outputs `.tar.gz` file with serialization results and an `export.log` file.
  On error outputs serialization logs directly."
  [:as {{:strs [all_collections collection settings data_model field_values database_secrets dirname]
         :or   {all_collections true
                settings        true
                data_model      true}}
        :query-params}]
  {dirname          (mu/with [:maybe string?]
                             {:description "name of directory and archive file (default: `<instance-name>-<YYYY-MM-dd_HH-mm>`)"})
   collection       (mu/with [:maybe (ms/QueryVectorOf
                                      [:or
                                       ms/PositiveInt
                                       [:re {:error/message "value must be string with `eid:<...>` prefix"} "^eid:.{21}$"]])]
                             {:description "collections' db ids/entity-ids to serialize"})
   all_collections  (mu/with [:maybe ms/BooleanValue]
                             {:default     true
                              :description "Serialize all collections (`true` unless you specify `collection`)"})
   settings         (mu/with [:maybe ms/BooleanValue]
                             {:default true
                              :description "Serialize Metabase settings"})
   data_model       (mu/with [:maybe ms/BooleanValue]
                             {:default true
                              :description "Serialize Metabase data model"})
   field_values     (mu/with [:maybe ms/BooleanValue]
                             {:default false
                              :description "Serialize cached field values"})
   database_secrets (mu/with [:maybe ms/BooleanValue]
                             {:default false
                              :description "Serialize details how to connect to each db"})}
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
