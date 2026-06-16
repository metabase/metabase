(ns metabase-enterprise.serialization.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.serialization.export :as export]
   [metabase-enterprise.serialization.metadata-file-import :as metadata-file-import]
   [metabase-enterprise.serialization.schema :as schema]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.protocols :as v2.protocols]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase-enterprise.serialization.v2.storage.tar :as v2.storage.tar]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.logger.core :as logger]
   [metabase.models.serialization :as serdes]
   [metabase.server.streaming-response :as sr]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.random :as u.random]
   [ring.core.protocols :as ring.protocols]
   [ring.util.response :as response])
  (:import
   (java.io ByteArrayOutputStream File InputStream)))

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

(def ^:private serialization-logger-prefixes
  "log4j2 logger-name prefixes whose logs are forked into the `export.log`/`import.log` files inside the archive.
  These are not loaded namespaces; each prefix captures every logger nested under it (e.g.
  `metabase-enterprise.serialization` captures `metabase-enterprise.serialization.v2.extract`)."
  ['metabase-enterprise.serialization
   'metabase.models.serialization])

(defn- log-export-error!
  "Log a serialization export error, honoring `full-stacktrace` (full trace vs stripped one-liner)."
  [e full-stacktrace]
  (if full-stacktrace
    (log/error e "Error during serialization export")
    (log/error (u/strip-error e "Error during serialization export"))))

(defn- extract-entities!
  "Run eager extraction (target resolution, escape analysis) before streaming starts. It must run
  before the streaming response opens so a failure can still set a non-200 status. Eager logs (e.g.
  escape-analysis warnings) are captured into `log-output` so they land in export.log alongside the
  storage logs captured later. `full-stacktrace` is honored for genuine server failures the way the
  streaming path and the CLI export do; client input errors carry a `:status-code` and pass through to
  the API layer unlogged, so they surface as a clean 4xx rather than a logged server error."
  [opts ^ByteArrayOutputStream log-output full-stacktrace]
  (try
    (with-open [_logger (logger/for-ns log-output serialization-logger-prefixes
                                       {:additive *additive-logging*})]
      (extract/extract opts))
    (catch Exception e
      (when-not (:status-code (ex-data e))
        (log-export-error! e full-stacktrace))
      (throw e))))

(defn- serialize-to-stream!
  "Serialize directly to an OutputStream as streaming tar.gz. Returns result map.

  Storage logs are appended to `log-output`, whose full contents are then written to `export.log` inside the
  archive."
  [^java.io.OutputStream output ^String dirname entities ^ByteArrayOutputStream log-output {:keys [full-stacktrace]}]
  (let [writer (v2.storage.tar/tar-writer output dirname)
        error  (atom nil)
        report (with-open [_logger (logger/for-ns log-output serialization-logger-prefixes
                                                  {:additive *additive-logging*})]
                 (try
                   (serdes/with-cache
                     (v2.storage/store! entities writer))
                   (catch Exception e
                     (reset! error e)
                     (log-export-error! e full-stacktrace)
                     nil)))]
    ;; Read the buffer and write the log after the appender has closed (and thus flushed) so nothing is lost.
    (try
      (v2.protocols/store-log! writer (.toByteArray log-output))
      (v2.protocols/finish! writer)
      (catch Exception _))
    {:report        report
     :success       (nil? @error)
     :error-message (when @error
                      (u/strip-error @error nil))}))

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
        report   (with-open [_logger (logger/for-ns log-file serialization-logger-prefixes
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

(defn- track-export-event! [collection opts start {:keys [report success error-message]}]
  (analytics/track-event! :snowplow/serialization
                          {:event           :serialization
                           :direction       "export"
                           :source          "api"
                           :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                           :count           (reduce + 0 (vals (:entity-counts report)))
                           :error_count     (count (:errors report))
                           :collection      (str/join "," (map str collection))
                           :all_collections (and (empty? collection)
                                                 (not (:no-collections opts)))
                           :data_model      (not (:no-data-model opts))
                           :settings        (not (:no-settings opts))
                           :field_values    (:include-field-values opts)
                           :secrets         (:include-database-secrets opts)
                           :success         (boolean success)
                           :error_message   error-message}))

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
  (let [opts               {:targets                  (mapv #(vector "Collection" %)
                                                            collection)
                            :no-collections           (and (empty? collection)
                                                           (not all-collections?))
                            :no-data-model            (not data-model?)
                            :no-settings              (not settings?)
                            :include-field-values     include-field-values?
                            :include-database-secrets include-database-secrets?
                            :continue-on-error        continue-on-error?
                            :full-stacktrace          full-stacktrace?}
        export-dirname (or dirname
                           (format "%s-%s"
                                   (u/slugify (appearance/site-name))
                                   (u.date/format "YYYY-MM-dd_HH-mm" (t/local-date-time))))
        ;; Eager setup (target resolution, escape analysis) must run before the streaming response opens
        ;; so a failure can still set a non-200 status. extract-entities! captures its logs into log-output
        ;; (so escape-analysis warnings land in export.log) and honors full_stacktrace for genuine failures.
        log-output (ByteArrayOutputStream.)
        entities   (extract-entities! opts log-output full-stacktrace?)]
    (sr/streaming-response {:content-type "application/gzip" :status 200} [output _cancel-chan]
      (sr/set-header! "Content-Disposition"
                      (format "attachment; filename=\"%s.tar.gz\"" export-dirname))
      (let [start  (System/nanoTime)
            result (serialize-to-stream! output export-dirname entities log-output opts)]
        (track-export-event! collection opts start result)))))

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

;;; ----------------------------------- POST /api/ee/serialization/metadata/export -----------------------------------

(api.macros/defendpoint :post "/metadata/export"
  :- (sr/streaming-response-schema ::schema/export-metadata-response)
  "Get warehouse metadata (databases, tables, and fields) for all databases visible to the
  current user. References between rows are emitted as raw numeric ids (`db_id`,
  `table_id`, `parent_id`, `fk_target_field_id`).

  Sections must be opted into with the `with-databases`, `with-tables`, and `with-fields`
  query parameters — they all default to `false`. The response is streamed for efficiency
  with large schemas.

  Requires `View data` → `Can view` and `Create queries` → `Query builder only` (or
  `Query builder and native`) permissions on each database and table."
  [_route-params
   query-params :- [:map
                    [:with-databases {:default false} [:maybe :boolean]]
                    [:with-tables    {:default false} [:maybe :boolean]]
                    [:with-fields    {:default false} [:maybe :boolean]]]]
  (let [opts (assoc query-params :user-info {:user-id       api/*current-user-id*
                                             :is-superuser? api/*is-superuser?*})]
    (sr/streaming-response {:content-type "application/json; charset=utf-8"} [os _]
      (export/export-metadata! os opts))))

;;; ----------------------------------- POST /api/ee/serialization/metadata/import -----------------------------------

(defn- spool-to-temp-file!
  "Stream `is` to a freshly-created temp file in 64 KB chunks. Returns the
  `File`. If streaming fails the temp file is removed before the throw
  propagates."
  ^File [^InputStream is]
  (let [tmp (File/createTempFile "metadata-import-" ".json")]
    (try
      (with-open [os (io/output-stream tmp)]
        (io/copy is os :buffer-size (* 64 1024)))
      tmp
      (catch Throwable t
        (.delete tmp)
        (throw t)))))

(api.macros/defendpoint :post "/metadata/import"
  :- [:map
      [:status [:= 202]]
      [:body [:map {:closed true}
              [:queued :boolean]
              [:import-id :string]]]]
  "Import warehouse metadata previously emitted by `POST /metadata/export`. The
  request body is the JSON document `{databases, tables, fields}`; sections are
  parsed incrementally so memory stays bounded regardless of payload size.

  To bypass the JSON-parsing request middleware, send with `Content-Type:
  application/octet-stream`. Restricted to superusers.

  Returns `202` immediately with an `:import-id`; the import runs
  asynchronously. Poll `GET /metadata/import/:id` for its outcome."
  [_route-params
   _query-params
   _body
   {:keys [body], :as _request}]
  (api/check-superuser)
  (cond
    (nil? body)
    (throw (ex-info "Empty request body" {:status-code 400}))

    (not (instance? InputStream body))
    (throw (ex-info (str "Expected a raw stream body. Send the request with "
                         "Content-Type: application/octet-stream so the JSON "
                         "middleware does not pre-parse the payload.")
                    {:status-code 415}))

    :else
    (let [tmp (spool-to-temp-file! body)
          id  (metadata-file-import/enqueue-import! tmp {:delete-after? true})]
      (-> (response/response {:queued true :import-id id})
          (assoc :status 202)))))

;;; ------------------------------- GET /api/ee/serialization/metadata/import/:id -------------------------------

(defn- present-import-status
  "Project an internal registry record onto the public wire shape. Deliberately
  omits the server-side `:file` path; stringifies the status keyword and the
  timestamps."
  [record]
  {:id          (:id record)
   :status      (name (:status record))
   :enqueued-at (str (:enqueued-at record))
   :started-at  (some-> (:started-at record) str)
   :finished-at (some-> (:finished-at record) str)
   :wall-ms     (:wall-ms record)
   :error       (:error record)})

(api.macros/defendpoint :get "/metadata/import/:id"
  :- ::schema/import-status-response
  "Status of a metadata import previously started by `POST /metadata/import`.
  Status is retained in-memory and is not durable across server restarts.
  Restricted to superusers."
  [{:keys [id]} :- [:map [:id ms/UUIDString]]]
  (api/check-superuser)
  (or (some-> (metadata-file-import/import-status id) present-import-status)
      (throw (ex-info "Unknown or expired import id" {:status-code 404}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/serialization` routes."
  (api.macros/ns-handler *ns* +auth))
