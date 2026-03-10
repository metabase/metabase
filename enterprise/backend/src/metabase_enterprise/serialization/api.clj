(ns metabase-enterprise.serialization.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.logger.core :as logger]
   [metabase.models.serialization :as serdes]
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

(defn- serialize&pack ^File [{:keys [dirname full-stacktrace] :as opts}]
  (let [dirname  (or dirname
                     (format "%s-%s"
                             (u/slugify (appearance/site-name))
                             (u.date/format "YYYY-MM-dd_HH-mm" (t/local-date-time))))
        path     (io/file parent-dir dirname)
        dst      (io/file (str (.getPath path) ".tar.gz"))
        log-file (io/file path "export.log")
        err      (atom nil)
        report   (with-open [_logger (logger/for-ns log-file ['metabase-enterprise.serialization
                                                              'metabase.models.serialization]
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
                       (if full-stacktrace
                         (log/error e "Error during serialization export")
                         (log/error (u/strip-error e "Error during serialization export"))))))]
    {:archive       (when (.exists dst)
                      dst)
     :log-file      (when (.exists log-file)
                      log-file)
     :report        report
     :status        (:status-code (ex-data @err))
     :error-message (when @err
                      (u/strip-error @err nil))
     :callback      (fn []
                      (when (.exists path)
                        (run! io/delete-file (reverse (file-seq path))))
                      (when (.exists dst)
                        (io/delete-file dst)))}))

(defn- find-serialization-dir
  "Find an actual top-level dir with serialization data inside, instead of picking up various .DS_Store and similar
  things."
  ^File [^File parent]
  (let [check-dir (fn [^File f]
                    (and (.isDirectory f)
                         (some v2.ingest/legal-top-level-paths (.list f))))]
    (if (check-dir parent)
      parent
      (->> (.listFiles parent)
           (u/seek check-dir)))))

(defn- unpack&import [^File file & [{:keys [size
                                            continue-on-error
                                            full-stacktrace
                                            reindex?]}]]
  (let [dst      (io/file parent-dir (u.random/random-name))
        log-file (io/file dst "import.log")
        err      (atom nil)
        reindex? (if (nil? reindex?) true reindex?)
        report   (with-open [_logger (logger/for-ns log-file ['metabase-enterprise.serialization
                                                              'metabase.models.serialization]
                                                    {:additive *additive-logging*})]
                   (try                 ; try/catch inside logging to log errors
                     (log/infof "Serdes import, size %s" size)
                     (let [cnt  (try (u.compress/untgz file dst)
                                     (catch Exception e
                                       (throw (ex-info "Cannot unpack archive" {:status 422} e))))
                           path (find-serialization-dir dst)]
                       (when-not path
                         (throw (ex-info "No source dir detected. Please make sure the serialization files are in the top level dir."
                                         {:status 400
                                          :dst    (.getPath dst)
                                          :count  cnt
                                          :files  (.listFiles dst)})))
                       (log/infof "In total %s entries unpacked, detected source dir: %s" cnt (.getName path))
                       (serdes/with-cache
                         (-> (v2.ingest/ingest-yaml (.getPath path))
                             (v2.load/load-metabase! {:continue-on-error continue-on-error
                                                      :reindex?          reindex?}))))
                     (catch Exception e
                       (reset! err e)
                       (if full-stacktrace
                         (log/error e "Error during serialization import")
                         (log/error (u/strip-error e "Error during serialization import"))))))]
    {:log-file      log-file
     :status        (:status (ex-data @err))
     :error-message (when @err
                      (u/strip-error @err nil))
     :report        report
     :callback      #(when (.exists dst)
                       (run! io/delete-file (reverse (file-seq dst))))}))

;;; HTTP API

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/export"
  "Serialize and retrieve Metabase instance.

  Outputs `.tar.gz` file with serialization results and an `export.log` file.
  On error outputs serialization logs directly."
  [_route-params
   {:keys                     [collection dirname]
    include-field-values?     :field_values
    include-database-secrets? :database_secrets
    all-collections?          :all_collections
    data-model?               :data_model
    settings?                 :settings
    continue-on-error?        :continue_on_error
    full-stacktrace?          :full_stacktrace
    :as                       _query-params}
   :- [:map
       [:dirname           {:optional true} [:maybe
                                             {:description "name of directory and archive file (default: `<instance-name>-<YYYY-MM-dd_HH-mm>`)"}
                                             string?]]
       [:collection        {:optional true} [:maybe
                                             {:description "collections' db ids/entity-ids to serialize"}
                                             (ms/QueryVectorOf
                                              [:or
                                               ms/PositiveInt
                                               [:re {:error/message "if you are passing entity_id, it should be exactly 21 chars long"}
                                                #"^.{21}$"]
                                               [:re {:error/message "value must be string with `eid:<...>` prefix"}
                                                #"^eid:.{21}$"]])]]
       [:all_collections   {:default true}  (mu/with ms/BooleanValue {:description "Serialize all collections (`true` unless you specify `collection`)"})]
       [:settings          {:default true}  (mu/with ms/BooleanValue {:description "Serialize Metabase settings"})]
       [:data_model        {:default true}  (mu/with ms/BooleanValue {:description "Serialize Metabase data model"})]
       [:field_values      {:default false} (mu/with ms/BooleanValue {:description "Serialize cached field values"})]
       [:database_secrets  {:default false} (mu/with ms/BooleanValue {:description "Serialize details how to connect to each db"})]
       [:continue_on_error {:default false} (mu/with ms/BooleanValue {:description "Do not break execution on errors"})]
       [:full_stacktrace   {:default false} (mu/with ms/BooleanValue {:description "Show full stacktraces in the logs"})]]]
  (api/check-superuser)
  (let [start              (System/nanoTime)
        opts               {:targets                  (mapv #(vector "Collection" %)
                                                            collection)
                            :no-collections           (and (empty? collection)
                                                           (not all-collections?))
                            :no-data-model            (not data-model?)
                            :no-settings              (not settings?)
                            :include-field-values     include-field-values?
                            :include-database-secrets include-database-secrets?
                            :dirname                  dirname
                            :continue-on-error        continue-on-error?
                            :full-stacktrace          full-stacktrace?}
        {:keys [archive
                log-file
                report
                status
                error-message
                callback]} (serialize&pack opts)]
    (analytics/track-event! :snowplow/serialization
                            {:event           :serialization
                             :direction       "export"
                             :source          "api"
                             :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                             :count           (count (:seen report))
                             :error_count     (count (:errors report))
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
      {:status  (or status 500)
       :headers {"Content-Type" "text/plain"}
       :body    (on-response! log-file callback)})))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/import"
  "Deserialize Metabase instance from an archive generated by /export.

  Parameters:
  - `file`: archive encoded as `multipart/form-data` (required).

  Returns logs of deserialization."
  {:multipart true}
  [_route-params
   {continue-on-error? :continue_on_error
    full-stacktrace?   :full_stacktrace
    reindex-search?    :reindex
    :as                _query-params}
   :- [:map
       [:continue_on_error {:default false} (mu/with ms/BooleanValue {:description "Do not break execution on errors"})]
       [:full_stacktrace   {:default false} (mu/with ms/BooleanValue {:description "Show full stacktraces in the logs"})]
       ;; TODO this parameter is a kludge to fix https://linear.app/metabase/issue/GDGT-573
       ;;      ideally we'd fix the underlying issue (by delaying realtime indexing updates until the tx closes)
       ;;      for now, we let users opt out, in case they're indexing a lot, so they can only reindex on the last step
       [:reindex           {:default true}  (mu/with ms/BooleanValue {:description "Rebuild the search index afterwards"})]]
   _body
   {{:strs [file]} :multipart-params, :as _request} :- [:map
                                                        [:multipart-params
                                                         [:map
                                                          ["file" (mu/with ms/File {:description ".tgz with serialization data"})]]]]]
  (api/check-superuser)
  (try
    (let [start              (System/nanoTime)
          {:keys [log-file
                  status
                  error-message
                  report
                  callback]} (unpack&import (:tempfile file)
                                            {:size              (:size file)
                                             :continue-on-error continue-on-error?
                                             :full-stacktrace   full-stacktrace?
                                             :reindex?          reindex-search?})
          imported           (into (sorted-set) (map (comp :model last)) (:seen report))]
      (analytics/track-event! :snowplow/serialization
                              {:event         :serialization
                               :direction     "import"
                               :source        "api"
                               :duration_ms   (int (/ (- (System/nanoTime) start) 1e6))
                               :models        (str/join "," imported)
                               :count         (if (contains? imported "Setting")
                                                (inc (count (remove #(= "Setting" (:model (first %))) (:seen report))))
                                                (count (:seen report)))
                               :error_count   (count (:errors report))
                               :success       (not error-message)
                               :error_message error-message})
      (if error-message
        {:status  (or status 500)
         :headers {"Content-Type" "text/plain"}
         :body    (on-response! log-file callback)}
        {:status  200
         :headers {"Content-Type" "text/plain"}
         :body    (on-response! log-file callback)}))
    (finally
      (io/delete-file (:tempfile file)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/serialization` routes."
  (api.macros/ns-handler *ns* +auth))
