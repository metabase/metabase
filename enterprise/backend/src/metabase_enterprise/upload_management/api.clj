(ns metabase-enterprise.upload-management.api
  (:require
   [metabase-enterprise.upload-management.db :as upload-management.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.upload.core :as upload]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(defn- attached-dwh-tables
  "Used for adding attached DWH tables to the list of tables visible to the user. In practice these are to manage
  google sheets uploads. Excludes tables with is_upload=true since those are already included in the main query."
  []
  (when (premium-features/has-feature? :attached-dwh)
    (when-let [dw-db-id (upload-management.db/attached-dwh-database-id)]
      (when-let [dw-tables (upload-management.db/non-upload-tables-for-database dw-db-id)]
        dw-tables))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tables"
  "Get all `Tables` visible to the current user which were created by uploading a file."
  []
  (as-> (upload-management.db/upload-tables) tables
    ;; See https://github.com/metabase/metabase/issues/41023
    (concat tables (attached-dwh-tables))
    (map #(update % :schema str) tables)
    (do (perms/prime-table-perms-cache {:db-ids    (into #{} (keep :db_id) tables)
                                        :table-ids (into #{} (map :id) tables)}) tables)
    (filter mi/can-read? tables)
    (sort-by :name tables) ;; Re-sort because we concat'ed data
    (vec tables)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/tables/:id"
  "Delete the uploaded table from the database, optionally archiving cards for which it is the primary source."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [archive-cards]} :- [:map
                               [:archive-cards {:optional true} [:maybe {:default false} ms/BooleanValue]]]]
  (try
    ;; To be idempotent, we do not check whether the table has already been deactivated.
    (let [table  (api/check-404 (upload-management.db/table id))
          result (upload/delete-upload! table :archive-cards? archive-cards)]
      {:status 200
       :body   (= :done result)})
    (catch Throwable e
      {:status (or (-> e ex-data :status-code)
                   500)
       :body   {:message (or (ex-message e)
                             (tru "There was an error deleting the table"))}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/upload-management` routes."
  (api.macros/ns-handler *ns* +auth))
