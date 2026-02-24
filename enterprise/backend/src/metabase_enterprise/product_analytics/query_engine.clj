(ns metabase-enterprise.product-analytics.query-engine
  "Manages the PA database engine/details when switching between app-db and Starburst query engines."
  (:require
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.storage.iceberg.settings
    :as iceberg.settings]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.product-analytics.core :as pa]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn starburst-details
  "Build a Starburst connection details map from PA settings."
  []
  {:host    (iceberg.settings/product-analytics-starburst-host)
   :port    (iceberg.settings/product-analytics-starburst-port)
   :catalog (iceberg.settings/product-analytics-starburst-catalog)
   :schema  (iceberg.settings/product-analytics-starburst-schema)
   :user    (iceberg.settings/product-analytics-starburst-user)
   :ssl     (iceberg.settings/product-analytics-starburst-ssl)})

(defn use-starburst?
  "Returns true when the PA database should use Starburst/Trino as the query engine."
  []
  (and (= (storage/active-backend) :metabase-enterprise.product-analytics.storage/iceberg)
       (= (iceberg.settings/product-analytics-query-engine) :starburst)))

(defn- sync-and-enhance!
  "Re-sync PA database schema and re-run metadata enhancement."
  []
  (when-let [pa-db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
    (log/info "Re-syncing Product Analytics database after query engine change...")
    (sync/sync-database! pa-db {:scan :schema})
    ;; enhance-pa-metadata! is called by setup, require at runtime to avoid circular deps
    ((requiring-resolve 'metabase-enterprise.product-analytics.setup/enhance-pa-metadata!))))

(defn reconfigure-pa-database!
  "Reconfigure the PA database engine and connection details based on current settings.
   Called when storage backend or query engine settings change."
  []
  (when-let [pa-db (t2/select-one :model/Database :id pa/product-analytics-db-id)]
    (if (use-starburst?)
      (let [details (starburst-details)]
        (log/info "Switching PA database to Starburst query engine")
        (t2/update! :model/Database pa/product-analytics-db-id
                    {:engine  :starburst
                     :details details})
        (sql-jdbc.conn/invalidate-pool-for-db! pa-db)
        (sync-and-enhance!))
      (let [app-db-type (mdb/db-type)]
        (when (not= (keyword (:engine pa-db)) app-db-type)
          (log/info "Switching PA database back to app-db engine" app-db-type)
          (t2/update! :model/Database pa/product-analytics-db-id
                      {:engine  app-db-type
                       :details {}})
          (sql-jdbc.conn/invalidate-pool-for-db! pa-db)
          (sync-and-enhance!))))))
