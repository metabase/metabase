(ns metabase-enterprise.audit-app.api.analytics-dev
  "API endpoints for analytics development mode."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.audit-app.analytics-dev :as analytics-dev]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.audit-app.core :as audit]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.log :as log]
   [ring.core.protocols :as ring.protocols])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- export-and-pack
  "Export analytics content and pack into a tarball.

  Returns map with:
  - :archive - File pointing to .tar.gz
  - :cleanup! - Function to clean up temp files
  - :error-message - Error message if export failed"
  []
  (let [collection (analytics-dev/find-analytics-collection)]
    (when-not collection
      (throw (ex-info "Analytics collection not found" {:status 404})))

    (let [temp-dir   (Files/createTempDirectory "analytics-export" (make-array FileAttribute 0))
          parent-dir (doto (.toFile temp-dir) .mkdirs)
          export-dir (doto (io/file parent-dir "instance_analytics") .mkdirs)
          dst        (io/file (str (.getPath parent-dir) ".tar.gz"))
          user-email (:email @api/*current-user*)
          cleanup!   (fn []
                       (when (.exists parent-dir)
                         (run! io/delete-file (reverse (file-seq parent-dir))))
                       (when (.exists dst)
                         (io/delete-file dst)))]

      (try
        (log/info "Exporting analytics collection" (:id collection))
        (analytics-dev/export-analytics-content! (:id collection) user-email (.getPath export-dir))

        (log/info "Creating tarball" (.getPath dst))
        (u.compress/tgz parent-dir dst)

        {:archive  (when (.exists dst) dst)
         :cleanup! cleanup!}

        (catch Exception e
          (log/error e "Error during analytics export")
          (try (cleanup!) (catch Error _))
          {:error-message (.getMessage e)})))))

;;; API Endpoints

(api.macros/defendpoint :post "/export" :- [:map [:body :any]]
  "Export analytics content as a .tar.gz file for local development.

  Only available when MB_ANALYTICS_DEV_MODE=true. Returns a tarball containing
  the analytics YAMLs in canonical format, ready to commit to source control.

  Requires superuser permissions."
  []
  (api/check-superuser)

  (api/check-400
   (audit/analytics-dev-mode)
   "Analytics dev mode is not enabled")

  (let [timer (u/start-timer)
        {:keys [archive error-message cleanup!]} (export-and-pack)
        duration (u/since-ms timer)]

    (log/infof "Analytics export completed in %.0fms" duration)

    (if archive
      {:status  200
       :headers {"Content-Type"        "application/gzip"
                 "Content-Disposition" (format "attachment; filename=\"%s\"" (.getName ^File archive))}
       :body    (reify
                  ring.protocols/StreamableResponseBody
                  (write-body-to-stream [_ response out]
                    (ring.protocols/write-body-to-stream archive response out)
                    (future (cleanup!))))}
      {:status  500
       :headers {"Content-Type" "text/plain"}
       :body    (or error-message "Unknown error during export")})))
