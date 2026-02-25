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

;;; ---- Shared column-level configs (lowercase names) ----

(def ^:private table-entity-types
  "Mapping of logical table name -> entity_type for PA tables.
   The :analyze phase is skipped during schema-only sync, so entity_type is not
   set automatically. We set it explicitly so that the x-ray template system
   can match dimensions (e.g. GenericTable.Category requires tables to have an
   entity_type that isa? :entity/GenericTable)."
  {"events"       :entity/EventTable
   "sessions"     :entity/GenericTable
   "sites"        :entity/GenericTable
   "event_data"   :entity/GenericTable
   "session_data" :entity/GenericTable})

(def ^:private field-semantic-types
  "Mapping of {logical-table-name {field-name semantic-type}} for post-sync enhancement.
   All field names are lowercase; lookups are case-insensitive."
  {"events"   {"created_at"      :type/CreationTimestamp
               "url_path"        :type/URL
               "event_name"      :type/Category
               "utm_source"      :type/Category
               "utm_medium"      :type/Category
               "utm_campaign"    :type/Category
               "referrer_domain" :type/Category
               "event_type"      :type/Category}
   "sessions" {"created_at"    :type/CreationTimestamp
               "updated_at"    :type/UpdatedTimestamp
               "browser"       :type/Category
               "os"            :type/Category
               "device"        :type/Category
               "country"       :type/Country
               "subdivision1"  :type/State
               "city"          :type/City
               "language"      :type/Category}
   "sites"    {"name"          :type/Name
               "created_at"    :type/CreationTimestamp
               "updated_at"    :type/UpdatedTimestamp}})

(def ^:private field-remappings
  "Internal dimension remappings for enum fields.
   Maps {logical-table-name {field-name {:name display-name :values [v ...] :labels [s ...]}}}"
  {"events" {"event_type" {:name   "Event Type"
                           :values [1 2]
                           :labels ["Pageview" "Custom Event"]}}})

;;; ---- Engine-specific table name mappings (logical -> actual) ----

(def ^:private app-db-table-names
  "Maps logical table names to actual app-db table names."
  {"events"       "product_analytics_event"
   "sessions"     "product_analytics_session"
   "sites"        "product_analytics_site"
   "event_data"   "product_analytics_event_data"
   "session_data" "product_analytics_session_data"})

(def ^:private iceberg-table-names
  "Maps logical table names to actual iceberg/Trino table names."
  {"events"       "pa_events"
   "sessions"     "pa_sessions"
   "sites"        "pa_sites"
   "session_data" "pa_session_data"})

;;; Foreign keys use logical names but differ per engine (session target field differs).

(def ^:private app-db-foreign-keys
  "Foreign key relationships for app-db tables (logical names).
   Maps {source-logical {source-field [target-logical target-field]}}."
  {"events"   {"site_id"    ["sites" "id"]
               "session_id" ["sessions" "id"]}
   "sessions" {"site_id"    ["sites" "id"]}})

(def ^:private iceberg-foreign-keys
  "Foreign key relationships for iceberg tables (logical names)."
  {"events"   {"site_id"    ["sites" "id"]
               "session_id" ["sessions" "session_id"]}
   "sessions" {"site_id"    ["sites" "id"]}})

;;; ---- Config dispatch ----

(defn- iceberg-query-engine?
  "Returns true when the PA database engine differs from the app-db type,
   indicating it's configured to use an external query engine (e.g. Starburst)."
  []
  (let [pa-db (t2/select-one [:model/Database :engine] :id pa/product-analytics-db-id)]
    (and pa-db
         (not= (keyword (:engine pa-db)) (mdb/db-type)))))

(defn- active-table-config
  "Returns the metadata configuration maps appropriate for the current PA query engine."
  []
  (let [iceberg?    (iceberg-query-engine?)
        table-names (if iceberg? iceberg-table-names app-db-table-names)]
    {:table-names    table-names
     :visible-tables (set (vals table-names))
     :entity-types   table-entity-types
     :semantic-types field-semantic-types
     :foreign-keys   (if iceberg? iceberg-foreign-keys app-db-foreign-keys)
     :remappings     (if iceberg? {} field-remappings)}))

;;; ---- Enhancement helpers ----

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

(defn enhance-pa-metadata!
  "After sync, set entity types on PA tables, semantic types on key fields,
   and internal remappings on enum fields. Hides non-visible tables.
   Selects the correct metadata maps based on the PA database's current engine.
   All table/field lookups are case-insensitive to handle H2 (uppercase) vs Postgres (lowercase)."
  []
  (let [{:keys [table-names visible-tables semantic-types foreign-keys remappings]}
        (active-table-config)
        lower-visible (mapv u/lower-case-en visible-tables)]
    ;; Hide underlying tables, show only the relevant visible set
    (t2/update! :model/Table {:db_id        pa/product-analytics-db-id
                              :%lower.name  [:not-in lower-visible]}
                {:visibility_type :hidden})
    ;; Ensure visible tables are not hidden (important when switching engines)
    (t2/update! :model/Table {:db_id        pa/product-analytics-db-id
                              :%lower.name  [:in lower-visible]}
                {:visibility_type nil})
    ;; Entity types
    (doseq [[logical-name entity-type] table-entity-types]
      (when-let [actual-name (table-names logical-name)]
        (t2/update! :model/Table {:db_id        pa/product-analytics-db-id
                                  :%lower.name  (u/lower-case-en actual-name)}
                    {:entity_type entity-type})))
    ;; Semantic types
    (doseq [[logical-name field-types] semantic-types]
      (when-let [actual-name (table-names logical-name)]
        (when-let [table (t2/select-one :model/Table
                                        :db_id        pa/product-analytics-db-id
                                        :%lower.name  (u/lower-case-en actual-name))]
          (doseq [[field-name semantic-type] field-types]
            (t2/update! :model/Field {:table_id     (:id table)
                                      :%lower.name  (u/lower-case-en field-name)}
                        {:semantic_type semantic-type})))))
    ;; Foreign keys
    (doseq [[logical-source fk-defs] foreign-keys]
      (when-let [source-actual (table-names logical-source)]
        (when-let [source-table (t2/select-one :model/Table
                                               :db_id        pa/product-analytics-db-id
                                               :%lower.name  (u/lower-case-en source-actual))]
          (doseq [[source-field-name [logical-target target-field-name]] fk-defs]
            (when-let [target-actual (table-names logical-target)]
              (when-let [source-field (t2/select-one :model/Field
                                                     :table_id     (:id source-table)
                                                     :%lower.name  (u/lower-case-en source-field-name))]
                (when-let [target-table (t2/select-one :model/Table
                                                       :db_id        pa/product-analytics-db-id
                                                       :%lower.name  (u/lower-case-en target-actual))]
                  (when-let [target-field (t2/select-one :model/Field
                                                         :table_id     (:id target-table)
                                                         :%lower.name  (u/lower-case-en target-field-name))]
                    (t2/update! :model/Field (:id source-field)
                                {:semantic_type      :type/FK
                                 :fk_target_field_id (:id target-field)})))))))))
    ;; Remappings
    (doseq [[logical-name field-remaps] remappings]
      (when-let [actual-name (table-names logical-name)]
        (when-let [table (t2/select-one :model/Table
                                        :db_id        pa/product-analytics-db-id
                                        :%lower.name  (u/lower-case-en actual-name))]
          (doseq [[field-name remap-config] field-remaps]
            (when-let [field (t2/select-one :model/Field
                                            :table_id     (:id table)
                                            :%lower.name  (u/lower-case-en field-name))]
              (ensure-field-remapping! (:id field) remap-config))))))))

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

(defn- reconcile-pa-engine!
  "Ensure the PA database engine matches the current settings.
   Called at startup to handle the case where settings changed and Metabase was restarted."
  [_pa-db]
  ((requiring-resolve 'metabase-enterprise.product-analytics.query-engine/reconfigure-pa-database!)))

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
                   (reconcile-pa-engine! pa-db)
                   (enhance-pa-metadata!)
                   ::no-op)))))
