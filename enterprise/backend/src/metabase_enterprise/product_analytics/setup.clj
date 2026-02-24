(ns metabase-enterprise.product-analytics.setup
  "Startup functions for ensuring the Product Analytics virtual Database and Collection exist."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.product-analytics.core :as pa]
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

(defenterprise ensure-product-analytics-db-installed!
  "EE implementation. Installs Product Analytics virtual DB if it does not already exist."
  :feature :product-analytics
  []
  (let [pa-db (t2/select-one :model/Database :is_product_analytics true)]
    (u/prog1 (if (nil? pa-db)
               (do (install-pa-database!) ::installed)
               ::no-op)
      (ensure-pa-collection!))))
