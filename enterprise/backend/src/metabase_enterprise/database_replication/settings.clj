(ns metabase-enterprise.database-replication.settings
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting database-replication-enabled
  (deferred-tru "When enabled, we show users a button to replicate their database to a data warehouse.")
  :visibility :admin
  :type :boolean
  :doc false
  :export? false
  :setter :none
  :getter (fn []
            (and
             (premium-features/is-hosted?)
             (premium-features/has-feature? :attached-dwh)
             (premium-features/has-feature? :etl-connections)
             (premium-features/has-feature? :etl-connections-pg)
             ;; Need to know the store-api-url to make requests to HM
             (some? (setting/get :store-api-url))
             ;; Need [[api-key]] to make requests to HM
             (some? (setting/get :api-key)))))

(defsetting database-replication-connections
  (deferred-tru "Mapping from database-id to replication connection information.")
  :visibility :admin
  :doc false
  :export? false
  :type :json
  :default {}
  :cache? false
  :encryption :when-encryption-key-set)
