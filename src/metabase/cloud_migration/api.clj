(ns metabase.cloud-migration.api
  "/api/cloud-migration endpoints.
  Only one migration should be happening at any given time.
  But if something weird happens with concurrency, /cancel will
  cancel all of them. "
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.cloud-migration.models.cloud-migration :as cloud-migration]
   [metabase.cloud-migration.settings :as cloud-migration.settings]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Initiate a new cloud migration."
  []
  (api/check-superuser)
  (cond
    (premium-features/is-hosted?)
    {:status 400 :body "Cannot migrate a hosted instance."}

    (t2/select-one :model/CloudMigration :state [:not-in cloud-migration/terminal-states])
    {:status 409 :body "There's an ongoing migration already."}

    :else
    (try
      (let [cloud-migration (t2/insert-returning-instance! :model/CloudMigration
                                                           (cloud-migration/get-store-migration))]
        (future (cloud-migration/migrate! cloud-migration))
        cloud-migration)
      (catch Exception e
        (condp = (-> e ex-data :status)
          404 {:status 404 :body "Could not establish a connection to Metabase Cloud."}
          400 {:status 400 :body "Cannot migrate this Metabase version."}
          {:status 500 :body ""})))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Get the latest cloud migration, if any."
  []
  (api/check-superuser)
  (t2/select-one :model/CloudMigration {:order-by [[:created_at :desc]]}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/cancel"
  "Cancel any ongoing cloud migrations, if any."
  []
  (api/check-superuser)
  (cloud-migration.settings/read-only-mode! false)
  (t2/update! :model/CloudMigration {:state [:not-in cloud-migration/terminal-states]} {:state :cancelled}))
