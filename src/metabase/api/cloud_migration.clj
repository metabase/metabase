(ns metabase.api.cloud-migration
  "/api/cloud-migration endpoints.
  Only one migration should be happening at any given time.
  But if something weird happens with concurrency, /cancel will
  cancel all of them. "
  (:require
   [compojure.core :refer [GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.models.cloud-migration :as cloud-migration]
   [toucan2.core :as t2]))

(api/defendpoint POST "/"
  "Initiate a new cloud migration."
  [_]
  (api/check-superuser)
  (if (t2/select-one :model/CloudMigration :state [:not-in cloud-migration/terminal-states])
    {:status 409 :body "There's an ongoing migration already."}
    (try
      (let [cloud-migration (->> (config/mb-version-info :tag)
                                 cloud-migration/get-store-migration
                                 (t2/insert-returning-instance! :model/CloudMigration))]
        (future (cloud-migration/migrate! cloud-migration))
        cloud-migration)
      (catch Exception e
        (condp = (-> e ex-data :status)
          404 {:status 404 :body "Could not establish a connection to Metabase Cloud."}
          400 {:status 400 :body "Cannot migrate this Metabase version."}
          {:status 500})))))

(api/defendpoint GET "/"
  "Get the latest cloud migration, if any."
  [_]
  (api/check-superuser)
  (t2/select-one :model/CloudMigration {:order-by [[:created_at :desc]]}))

(api/defendpoint PUT "/cancel"
  "Cancel any ongoing cloud migrations, if any."
  [_]
  (api/check-superuser)
  (cloud-migration/read-only-mode! false)
  (t2/update! :model/CloudMigration {:state [:not-in cloud-migration/terminal-states]} {:state :cancelled}))

(api/define-routes)
