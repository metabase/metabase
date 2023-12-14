(ns metabase-enterprise.serialization.api
  (:require
   [clojure.java.io :as io]
   [compojure.core :refer [POST]]
   [java-time.api :as t]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.api.common :as api]
   [metabase.logger :as logger]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)
   (java.lang AutoCloseable)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream GzipParameters)
   (org.apache.logging.log4j.core.appender AbstractAppender FileAppender)
   (org.apache.logging.log4j.core.config AbstractConfiguration LoggerConfig)))

(set! *warn-on-reflection* true)

(def parent-dir "Dir for storing serialization API export-in-progress and archives."
  (let [f (io/file (System/getProperty "java.io.tmpdir") "serdesv2-api")]
    (.mkdirs f)
    (.deleteOnExit f)
    (.getPath f)))

(defn- compress-tgz [^File src ^File dst]
  (when-not (.exists src)
    (throw (ex-info (format "Path is not readable or does not exist: %s" src)
                    {:path src})))
  (let [prefix (.getPath (.getParentFile src))]
    (with-open [tar (-> (io/output-stream dst)
                        (GzipCompressorOutputStream. (doto (GzipParameters.)
                                                       (.setModificationTime (System/currentTimeMillis))))
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (.setLongFileMode tar TarArchiveOutputStream/LONGFILE_POSIX)

      (doseq [^File f (file-seq src)
              :let    [path-in-tar (subs (.getPath f) (count prefix))
                       entry (TarArchiveEntry. f path-in-tar)]]
        (.putArchiveEntry tar entry)
        (when (.isFile f)
          (with-open [s (io/input-stream f)]
            (io/copy s tar)))
        (.closeArchiveEntry tar)))

    dst))

(defn- find-logger-layout [^LoggerConfig logger]
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
        logger        (LoggerConfig. (logger/logger-name ns)
                                     (.getLevel parent-logger)
                                     true)]
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

(defn- serialize&pack ^File [opts]
  ;; TODO: how to get time in local timezone?
  (let [id     (str (u/slugify (public-settings/site-name)) "-"
                    (u.date/format "YYYY-MM-dd_hh-mm" (t/zoned-date-time)))
        path   (io/file parent-dir id)
        dest   (io/file (str (.getPath path) ".tgz"))]
    (with-open [_logger (make-logger 'metabase-enterprise.serialization (io/file path "log.txt"))]
      (-> (extract/extract opts)
          (storage/store! path)))
    (compress-tgz path dest)
    (run! io/delete-file (reverse (file-seq path)))
    dest))

(comment
  (serialize&pack {:no-data-model true :no-settings true :targets [["Collection" 31409]]}))

(api/defendpoint POST "/export"
  "Serialize and retrieve Metabase data."
  [:as {{:strs [all-collections collection settings data-model field-values database-secrets logs]
         :or   {settings        true
                data-model      true
                all-collections true}}
        :query-params}]
  {collection       [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   all-collections  [:maybe ms/BooleanValue]
   settings         [:maybe ms/BooleanValue]
   data-model       [:maybe ms/BooleanValue]
   field-values     [:maybe ms/BooleanValue]
   database-secrets [:maybe ms/BooleanValue]
   logs             [:maybe ms/NonBlankString]}
  (let [collection (cond (vector? collection) collection collection [collection])
        opts       {:targets                  (mapv #(vector "Collection" %)
                                                    collection)
                    :no-collections           (and (empty? collection)
                                                   (not all-collections))
                    :no-data-model            (not data-model)
                    :no-settings              (not settings)
                    :include-field-values     field-values
                    :include-database-secrets database-secrets}
        archive    (serialize&pack opts)]
    {:status  200
     :headers {"Content-Type"        "application/gzip"
               "Content-Disposition" (format "attachment; filename=\"%s\"" (.getName archive))}
     :body    archive}))

(api/define-routes #_+auth)
