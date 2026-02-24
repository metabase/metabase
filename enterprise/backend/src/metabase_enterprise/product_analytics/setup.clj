(ns metabase-enterprise.product-analytics.setup
  "Startup functions for ensuring the Product Analytics virtual Database and Collection exist."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.product-analytics.core :as pa]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- install-pa-database!
  "Creates the Product Analytics virtual database record."
  []
  (log/info "Installing Product Analytics virtual Database...")
  (t2/insert! :model/Database
              {:is_product_analytics true
               :id                   pa/product-analytics-db-id
               :name                 "Product Analytics Database"
               :engine               (mdb/db-type)
               :is_full_sync         true
               :is_on_demand         false
               :creator_id           nil
               :auto_run_queries     true})
  ;; guard against someone manually deleting the pa-db entry, but not removing the pa-db permissions.
  (t2/delete! :model/Permissions {:where [:like :object (str "%/db/" pa/product-analytics-db-id "/%")]}))

(defn- ensure-pa-collection!
  "Ensures the Product Analytics collection exists."
  []
  (when-not (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id)
    (log/info "Creating Product Analytics collection...")
    (t2/insert! :model/Collection
                {:name        "Product Analytics"
                 :entity_id   pa/product-analytics-collection-entity-id
                 :type        collection/instance-analytics-collection-type
                 :namespace   "product-analytics"
                 :description "Collection for Product Analytics dashboards and questions."})))

;;; ------------------------------------------------- Field Enhancement -------------------------------------------------

(def ^:private pa-field-semantic-types
  "Mapping of {table-name {field-name semantic-type}} for post-sync enhancement."
  {"V_PA_EVENTS"   {"CREATED_AT"      :type/CreationTimestamp
                    "URL_PATH"        :type/URL
                    "EVENT_NAME"      :type/Category
                    "UTM_SOURCE"      :type/Category
                    "UTM_MEDIUM"      :type/Category
                    "UTM_CAMPAIGN"    :type/Category
                    "REFERRER_DOMAIN" :type/Category
                    "EVENT_TYPE"      :type/Category}
   "V_PA_SESSIONS" {"CREATED_AT" :type/CreationTimestamp
                    "BROWSER"    :type/Category
                    "OS"         :type/Category
                    "DEVICE"     :type/Category
                    "COUNTRY"    :type/Country
                    "LANGUAGE"   :type/Category}})

(defn- enhance-pa-field-metadata!
  "After sync, update semantic types on key PA fields to improve x-ray dimension matching."
  []
  (doseq [[table-name field-types] pa-field-semantic-types]
    (when-let [table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name table-name)]
      (doseq [[field-name semantic-type] field-types]
        (t2/update! :model/Field {:table_id (:id table) :name field-name}
                    {:semantic_type semantic-type})))))

;;; ------------------------------------------------- Sync -------------------------------------------------

(defn- sync-pa-database!
  "Run a schema-only sync on the PA database, then enhance field metadata.
   Runs async in production, synchronously in tests."
  []
  (when-let [pa-db (t2/select-one :model/Database :is_product_analytics true)]
    (log/info "Starting sync of Product Analytics Database...")
    (let [sync-future (future
                        (log/with-no-logs
                          (sync/sync-database! pa-db {:scan :schema}))
                        (enhance-pa-field-metadata!)
                        (log/info "Product Analytics Database sync complete."))]
      (when config/is-test?
        @sync-future))))

;;; ------------------------------------------------- Entry Point -------------------------------------------------

(defenterprise ensure-product-analytics-db-installed!
  "EE implementation. Installs Product Analytics virtual DB if it does not already exist."
  :feature :product-analytics
  []
  (let [pa-db (t2/select-one :model/Database :is_product_analytics true)]
    (u/prog1 (if (nil? pa-db)
               (do (install-pa-database!)
                   (ensure-pa-collection!)
                   (sync-pa-database!)
                   ::installed)
               (do (ensure-pa-collection!)
                   ::no-op)))))
