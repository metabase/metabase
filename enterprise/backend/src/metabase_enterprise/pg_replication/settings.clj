(ns metabase-enterprise.pg-replication.settings
  (:require
   [medley.core :as m]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def :pg-replication/connection-info
  [:map
   [:connection-id ms/UUIDString]])

(mr/def :pg-replication/setting
  [:map-of pos-int? :pg-replication/connection-info])

(defsetting pg-replication-enabled
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

(defsetting pg-replication-connections
  (deferred-tru "Mapping from database-id to PG replication connection information.")
  :visibility :admin
  :doc false
  :export? false
  :type :json
  :encryption :when-encryption-key-set
  :getter (mu/fn :- :pg-replication/setting []
            (or
             ;; This NEEDS to be up to date between instances on a cluster, so:
             ;; we are going around the settings cache:
             (some->> (t2/select-one :model/Setting :key "pg-replication-connections")
                      :value
                      json/decode+kw
                      (m/map-keys (comp parse-long name)))
             (u/prog1 {} (setting/set-value-of-type! :json :pg-replication-connections <>)))))
