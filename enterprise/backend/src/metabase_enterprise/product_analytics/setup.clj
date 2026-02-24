(ns metabase-enterprise.product-analytics.setup
  "Startup functions for ensuring the Product Analytics virtual Database and Collection exist."
  (:require
   [metabase-enterprise.product-analytics.settings]
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

;;; ------------------------------------------------- Metadata Enhancement -------------------------------------------------

(def ^:private pa-table-entity-types
  "Mapping of table-name → entity_type for PA tables.
   The :analyze phase is skipped during schema-only sync, so entity_type is not
   set automatically. We set it explicitly so that the x-ray template system
   can match dimensions (e.g. GenericTable.Category requires tables to have an
   entity_type that isa? :entity/GenericTable)."
  {"V_PA_EVENTS"       :entity/EventTable
   "V_PA_SESSIONS"     :entity/GenericTable
   "V_PA_SITES"        :entity/GenericTable
   "V_PA_EVENT_DATA"   :entity/GenericTable
   "V_PA_SESSION_DATA" :entity/GenericTable})

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
   "V_PA_SESSIONS" {"CREATED_AT"    :type/CreationTimestamp
                    "UPDATED_AT"    :type/UpdatedTimestamp
                    "BROWSER"       :type/Category
                    "OS"            :type/Category
                    "DEVICE"        :type/Category
                    "COUNTRY"       :type/Country
                    "SUBDIVISION1"  :type/State
                    "CITY"          :type/City
                    "LANGUAGE"      :type/Category}})

(def ^:private pa-foreign-keys
  "Foreign key relationships between PA views.
   Maps {source-table {source-field [target-table target-field]}}."
  {"V_PA_EVENTS"   {"SITE_ID"    ["V_PA_SITES" "ID"]
                    "SESSION_ID" ["V_PA_SESSIONS" "ID"]}
   "V_PA_SESSIONS" {"SITE_ID"    ["V_PA_SITES" "ID"]}})

(def ^:private pa-field-remappings
  "Internal dimension remappings for enum fields.
   Maps {table-name {field-name {:name display-name :values [v ...] :labels [s ...]}}}"
  {"V_PA_EVENTS" {"EVENT_TYPE" {:name   "Event Type"
                                :values [1 2]
                                :labels ["Pageview" "Custom Event"]}}})

(defn- ensure-field-remapping!
  "Create or update an internal Dimension + FieldValues remapping for a field."
  [field-id {:keys [name values labels]}]
  ;; Dimension
  (when-not (t2/select-one :model/Dimension :field_id field-id :type :internal)
    (t2/insert! :model/Dimension {:field_id field-id
                                  :type     :internal
                                  :name     name}))
  ;; FieldValues with human-readable labels
  (if-let [existing (t2/select-one :model/FieldValues :field_id field-id :type :full)]
    (t2/update! :model/FieldValues (:id existing)
                {:values                values
                 :human_readable_values labels})
    (t2/insert! :model/FieldValues {:field_id              field-id
                                    :type                  :full
                                    :values                values
                                    :human_readable_values labels})))

(def ^:private pa-visible-tables
  "Set of table names that should be visible in the PA database.
   All other tables (underlying PRODUCT_ANALYTICS_* tables) are hidden."
  #{"V_PA_EVENTS" "V_PA_SESSIONS" "V_PA_SITES" "V_PA_EVENT_DATA" "V_PA_SESSION_DATA"})

(defn- enhance-pa-metadata!
  "After sync, set entity types on PA tables, semantic types on key fields,
   and internal remappings on enum fields. Hides non-view tables."
  []
  ;; Hide underlying tables, show only views
  (t2/update! :model/Table {:db_id pa/product-analytics-db-id
                            :name  [:not-in pa-visible-tables]}
              {:visibility_type :hidden})
  (doseq [[table-name entity-type] pa-table-entity-types]
    (t2/update! :model/Table {:db_id pa/product-analytics-db-id :name table-name}
                {:entity_type entity-type}))
  (doseq [[table-name field-types] pa-field-semantic-types]
    (when-let [table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name table-name)]
      (doseq [[field-name semantic-type] field-types]
        (t2/update! :model/Field {:table_id (:id table) :name field-name}
                    {:semantic_type semantic-type}))))
  (doseq [[source-table-name fk-defs] pa-foreign-keys]
    (when-let [source-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name source-table-name)]
      (doseq [[source-field-name [target-table-name target-field-name]] fk-defs]
        (when-let [source-field (t2/select-one :model/Field :table_id (:id source-table) :name source-field-name)]
          (when-let [target-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name target-table-name)]
            (when-let [target-field (t2/select-one :model/Field :table_id (:id target-table) :name target-field-name)]
              (t2/update! :model/Field (:id source-field)
                          {:semantic_type      :type/FK
                           :fk_target_field_id (:id target-field)})))))))
  (doseq [[table-name field-remaps] pa-field-remappings]
    (when-let [table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name table-name)]
      (doseq [[field-name remap-config] field-remaps]
        (when-let [field (t2/select-one :model/Field :table_id (:id table) :name field-name)]
          (ensure-field-remapping! (:id field) remap-config))))))

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
                        (enhance-pa-metadata!)
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
                   (enhance-pa-metadata!)
                   ::no-op)))))
