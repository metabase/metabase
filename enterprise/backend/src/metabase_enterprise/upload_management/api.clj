(ns metabase-enterprise.upload-management.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.upload :as upload]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/tables"
  "Get all `Tables` visible to the current user which were created by uploading a file."
  []
  (as-> (t2/select :model/Table, :active true, :is_upload true, {:order-by [[:name :asc]]}) tables
        ;; See https://github.com/metabase/metabase/issues/41023
    (map #(update % :schema str) tables)
    (filterv mi/can-read? tables)))

(api.macros/defendpoint :delete "/tables/:id"
  "Delete the uploaded table from the database, optionally archiving cards for which it is the primary source."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [archive-cards]} :- [:map
                               [:archive-cards {:optional true} [:maybe {:default false} ms/BooleanValue]]]]
  (try
    ;; To be idempotent, we do not check whether the table has already been deactivated.
    (let [table  (api/check-404 (t2/select-one :model/Table id))
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
