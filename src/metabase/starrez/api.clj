(ns metabase.starrez.api
  "/api/starrez endpoints — admin-only StarRez integration management."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.starrez.client :as starrez.client]
   [metabase.starrez.db :as starrez.db]
   [metabase.starrez.export :as starrez.export]
   [metabase.starrez.settings :as starrez.settings]
   [metabase.starrez.storage :as starrez.storage]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/status"
  "Return current StarRez configuration status (without exposing secret values)."
  []
  (perms/check-has-application-permission :setting)
  {:configured {:api_url      (boolean (seq (or (starrez.settings/starrez-api-url) "")))
                :api_username (boolean (seq (or (starrez.settings/starrez-api-username) "")))
                :api_token    (boolean (seq (or (starrez.settings/starrez-api-token) "")))
                :blob_sas_url (boolean (seq (or (starrez.settings/starrez-blob-sas-url) "")))
                :pg_host      (boolean (seq (or (starrez.settings/starrez-pg-host) "")))
                :pg_user      (boolean (seq (or (starrez.settings/starrez-pg-user) "")))
                :pg_password  (boolean (seq (or (starrez.settings/starrez-pg-password) "")))}
   :settings   {:export_tables  (starrez.settings/starrez-export-tables)
                :export_reports (starrez.settings/starrez-export-reports)
                :sort_field     (starrez.settings/starrez-sort-field)
                :keep_versions  (starrez.settings/starrez-keep-versions)
                :pg_database    (starrez.settings/starrez-pg-database)}})

(api.macros/defendpoint :post "/test"
  "Test connectivity to the configured StarRez API."
  []
  (perms/check-has-application-permission :setting)
  (starrez.client/test-connection))

(api.macros/defendpoint :post "/export"
  "Trigger a StarRez data export. Fetches all configured tables and reports and
  uploads CSV files to Azure Blob Storage. Old versions are pruned automatically.
  Rejects with {:error ...} if another export is already running."
  []
  (perms/check-has-application-permission :setting)
  (let [out (starrez.export/run-export)]
    (if (and (map? out) (:error out))
      out
      {:results out})))

(api.macros/defendpoint :get "/exports"
  "List past StarRez export files in Azure Blob Storage."
  []
  (perms/check-has-application-permission :setting)
  (let [sas-url (starrez.settings/starrez-blob-sas-url)]
    (if (seq sas-url)
      {:exports (starrez.storage/list-exports sas-url)}
      {:exports [] :error "Azure Blob Storage is not configured"})))

(api.macros/defendpoint :post "/exports/delete"
  "Delete a specific export file from Azure Blob Storage."
  [_route-params
   _query-params
   {:keys [blob-name]} :- [:map [:blob-name ms/NonBlankString]]]
  (perms/check-has-application-permission :setting)
  (let [sas-url (starrez.settings/starrez-blob-sas-url)]
    {:success (starrez.storage/delete-export sas-url blob-name)}))

(api.macros/defendpoint :post "/db/test"
  "Test connectivity to the StarRez Postgres database."
  []
  (perms/check-has-application-permission :setting)
  (starrez.db/test-connection))

(api.macros/defendpoint :get "/weeks"
  "List all StarRez snapshot weeks (newest first)."
  []
  (perms/check-has-application-permission :setting)
  (starrez.db/list-weeks-result))

(api.macros/defendpoint :post "/weeks/:week-id/activate"
  "Make `week-id` the active snapshot — drop+reload `starrez_data.*` tables from
  the CSV snapshots stored in blob for that week."
  [{:keys [week-id]} :- [:map [:week-id ms/PositiveInt]]]
  (perms/check-has-application-permission :setting)
  (let [sas-url    (starrez.settings/starrez-blob-sas-url)
        downloader (fn [blob-name] (starrez.storage/download-export sas-url blob-name))]
    (starrez.db/activate-week! week-id downloader)))

(def ^:private keep-me ::keep-me)
