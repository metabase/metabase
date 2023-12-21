(ns metabase-enterprise.serialization.api
  (:require
   [clojure.java.io :as io]
   [compojure.core :refer [POST]]
   [java-time.api :as t]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
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
   (java.io File ByteArrayOutputStream)
   (java.lang AutoCloseable)
   (org.apache.logging.log4j Level)
   (org.apache.logging.log4j.core.appender AbstractAppender FileAppender)
   (org.apache.logging.log4j.core.config AbstractConfiguration LoggerConfig)))

(set! *warn-on-reflection* true)

(def ^:dynamic *in-tests* "Set when executed in tests to force sync removal of files" false)

;;; Storage

(def parent-dir "Dir for storing serialization API export-in-progress and archives."
  (let [f (io/file (System/getProperty "java.io.tmpdir") (str "serdesv2-" (u.random/random-name)))]
    (.mkdirs f)
    (.deleteOnExit f)
    (.getPath f)))

;;; Request callbacks

(defn- ba-copy [f]
  (let [baos (ByteArrayOutputStream.)]
    (io/copy f baos)
    (.toByteArray baos)))

(defn- on-response! [data callback]
  (reify
    ;; Real HTTP requests and mt/user-real-request go here
    ring.protocols/StreamableResponseBody
    (write-body-to-stream [_ response out]
      (ring.protocols/write-body-to-stream data response out)
      (if *in-tests*
        (callback)
        (future (callback))))

    ;; mt/user-http-request goes here
    clojure.java.io.IOFactory
    (make-input-stream [_ _]
      (let [res (io/input-stream (if (instance? File data)
                                   (ba-copy data)
                                   data))]
        (callback)
        res))))

;;; Logging

(defn- find-logger-layout
  "Find any logger with a specified layout"
  [^LoggerConfig logger]
  (when logger
    (or (first (keep #(.getLayout ^AbstractAppender (val %)) (.getAppenders logger)))
        (recur (.getParent logger)))))

(defn- make-logger ^AutoCloseable [ns ^File f]
  (let [config        (logger/configuration)
        parent-logger (logger/effective-ns-logger ns)
        appender      (.build
                       (doto (FileAppender/newBuilder)
                         (.withName (.getPath f))
                         (.withFileName (.getPath f))
                         (.withLayout (find-logger-layout parent-logger))))
        logger        (LoggerConfig. (logger/logger-name ns) Level/INFO true)]
    (.start appender)
    (.addAppender config appender)
    (.addAppender logger appender (.getLevel logger) nil)
    (.addLogger config (.getName logger) logger)
    (.updateLoggers (logger/context))

    (reify AutoCloseable
      (close [_]
        (let [^AbstractConfiguration config (logger/configuration)]
          (.removeLogger config (.getName logger))
          (.stop appender)
          ;; this method is only present in AbstractConfiguration
          (.removeAppender config (.getName appender))
          (.updateLoggers (logger/context)))))))

;;; Logic

(defn- serialize&pack ^File [opts]
  (let [id       (format "%s-%s"
                         (u/slugify (public-settings/site-name))
                         (u.date/format "YYYY-MM-dd_HH-mm" (t/local-date-time)))
        path     (io/file parent-dir id)
        dst      (io/file (str (.getPath path) ".tar.gz"))
        log-file (io/file path "export.log")]
    (with-open [_logger (make-logger 'metabase-enterprise.serialization log-file)]
      (try                              ; try/catch inside logging to log errors
        (serdes/with-cache
          (-> (extract/extract opts)
              (storage/store! path)))
        ;; not removing storage immediately to save some time before response
        (u.compress/tgz path dst)
        (catch Exception e
          (log/error e "Error during serialization"))))
    {:archive  (when (.exists dst)
                 dst)
     :log-file (when (.exists log-file)
                 log-file)
     :callback (fn []
                 (when (.exists path)
                   (run! io/delete-file (reverse (file-seq path))))
                 (when (.exists dst)
                   (io/delete-file dst)))}))

(defn- unpack&import [^File file & [size]]
  (let [dst      (io/file parent-dir (u.random/random-name))
        log-file (io/file dst "import.log")]
    (with-open [_logger (make-logger 'metabase-enterprise.serialization log-file)]
      (try                              ; try/catch inside logging to log errors
        (log/infof "Serdes import, size %s" size)
        (let [path (u.compress/untgz file dst)]
          (serdes/with-cache
            (-> (v2.ingest/ingest-yaml (.getPath (io/file dst path)))
                (v2.load/load-metabase! {:abort-on-error true}))))
        (catch Exception e
          (log/error e "Error during serialization"))))
    {:log-file log-file
     :callback #(when (.exists dst)
                  (run! io/delete-file (reverse (file-seq dst))))}))

(comment
  ;; dump on disk and see that it works
  (serialize&pack {:no-data-model true :no-settings true :targets [["Collection" 31409]]})
  (unpack&import (io/file "metabase_test.tar.gz")))

;;; HTTP API

(api/defendpoint POST "/export"
  "Serialize and retrieve Metabase data."
  [:as {{:strs [all-collections collection settings data-model field-values database-secrets]
         :or   {settings        true
                data-model      true
                all-collections true}}
        :query-params}]
  {collection       [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   all-collections  [:maybe ms/BooleanValue]
   settings         [:maybe ms/BooleanValue]
   data-model       [:maybe ms/BooleanValue]
   field-values     [:maybe ms/BooleanValue]
   database-secrets [:maybe ms/BooleanValue]}
  (api/check-superuser)
  (let [collection (cond (vector? collection) collection collection [collection])
        opts       {:targets                  (mapv #(vector "Collection" %)
                                                    collection)
                    :no-collections           (and (empty? collection)
                                                   (not all-collections))
                    :no-data-model            (not data-model)
                    :no-settings              (not settings)
                    :include-field-values     field-values
                    :include-database-secrets database-secrets}
        {:keys [archive log-file callback]}
        (serialize&pack opts)]
    (if archive
      {:status  200
       :headers {"Content-Type"        "application/gzip"
                 "Content-Disposition" (format "attachment; filename=\"%s\"" (.getName ^File archive))}
       :body    (on-response! archive callback)}
      {:status  500
       :headers {"Content-Type" "text/plain"}
       :body    (on-response! log-file callback)})))

(api/defendpoint ^:multipart POST "/import"
  [:as {raw-params :params}]
  (api/check-superuser)
  (try
    (let [{:keys [log-file callback]} (unpack&import (get-in raw-params ["file" :tempfile])
                                                     (get-in raw-params ["file" :size]))]
      {:status  200
       :headers {"Content-Type" "text/plain"}
       :body    (on-response! log-file callback)})
    (finally
      (io/delete-file (get-in raw-params ["file" :tempfile])))))

(api/define-routes +auth)
