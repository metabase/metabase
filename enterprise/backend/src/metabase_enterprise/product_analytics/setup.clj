(ns metabase-enterprise.product-analytics.setup
  "Startup functions for ensuring the Product Analytics virtual Database and Collection exist."
  (:require
   [metabase-enterprise.product-analytics.settings]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.impl :as audit-impl]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.product-analytics.core :as pa]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
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
  "Ensures the Product Analytics collection exists, nested inside the Usage Analytics collection."
  []
  (let [audit-coll      (t2/select-one :model/Collection :entity_id audit-impl/default-audit-collection-entity-id)
        target-location (if audit-coll (collection/children-location audit-coll) "/")]
    (if-let [existing (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id)]
      ;; Fix existing collections that were created with wrong values.
      ;; Namespace must be patched via raw SQL — the model hook blocks namespace changes via t2/update!.
      (do
        (when (not= "analytics" (:namespace existing))
          (t2/query {:update :collection
                     :set    {:namespace "analytics"}
                     :where  [:= :entity_id pa/product-analytics-collection-entity-id]}))
        (when (and audit-coll (not= target-location (:location existing)))
          (t2/update! :model/Collection (:id existing) {:location target-location})))
      (do
        (log/info "Creating Product Analytics collection...")
        (t2/insert! :model/Collection
                    {:name        "Product Analytics"
                     :entity_id   pa/product-analytics-collection-entity-id
                     :type        collection/instance-analytics-collection-type
                     :namespace   "analytics"
                     :location    target-location
                     :description "Collection for Product Analytics dashboards and questions."})))))

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

;;; ------------------------------------------------- Default Content -------------------------------------------------

;;; ---- Entity IDs ----

;; Cards — shared across dashboards
(def ^:private user-flows-card-entity-id
  "Stable entity ID for the default User Flows card.
   Fixed so we can check for its existence across restarts."
  "pA_uFl0ws-R2kQeeHWB8v")

(def ^:private page-views-card-entity-id
  "Stable entity ID for the default Page Views card."
  "pA_pgViewsQeeHWB8v001")

(def ^:private active-users-card-entity-id
  "Stable entity ID for the default Active Users card."
  "pA_actUsrsQeeHWB8v002")

(def ^:private top-pages-card-entity-id
  "Stable entity ID for the default Top Pages card."
  "pA_topPgesQeeHWB8v003")

(def ^:private traffic-sources-card-entity-id
  "Stable entity ID for the default Traffic Sources (UTM source) card."
  "pA_trafSrcQeeHWB8v005")

(def ^:private device-types-card-entity-id
  "Stable entity ID for the default Device Types card."
  "pA_devTypsQeeHWB8v006")

(def ^:private utm-medium-card-entity-id
  "Stable entity ID for the UTM Medium breakdown card."
  "pA_utmMedmQeeHWB8v007")

(def ^:private utm-campaign-card-entity-id
  "Stable entity ID for the UTM Campaign breakdown card."
  "pA_utmCmpnQeeHWB8v008")

(def ^:private referrer-domains-card-entity-id
  "Stable entity ID for the Referrer Domains card."
  "pA_rfrDom0QeeHWB8v009")

(def ^:private sessions-by-country-card-entity-id
  "Stable entity ID for the Sessions by Country map card."
  "pA_cntryMpQeeHWB8v010")

(def ^:private sessions-by-browser-card-entity-id
  "Stable entity ID for the Sessions by Browser card."
  "pA_brwsrBrQeeHWB8v012")

(def ^:private sessions-by-os-card-entity-id
  "Stable entity ID for the Sessions by OS card."
  "pA_osBrknQeeHWB8v0013")

(def ^:private sessions-by-language-card-entity-id
  "Stable entity ID for the Sessions by Language card."
  "pA_langBrkQeeHWB8v011")

;; Dashboards
(def ^:private overview-dashboard-entity-id
  "Stable entity ID for the Product Overview dashboard."
  "pA_ovwDash0QeeHWB8v08")

(def ^:private acquisition-dashboard-entity-id
  "Stable entity ID for the Acquisition dashboard."
  "pA_acqDash0QeeHWB8v02")

(def ^:private audience-dashboard-entity-id
  "Stable entity ID for the Audience dashboard."
  "pA_audDash0QeeHWB8v03")

;;; ---- Lookup helpers ----

(defn- find-pa-table
  "Returns the PA Table record for the given logical name using the active engine config."
  [logical-name]
  (let [{:keys [table-names]} (active-table-config)
        actual-name           (table-names logical-name)]
    (when actual-name
      (t2/select-one :model/Table
                     :db_id       pa/product-analytics-db-id
                     :%lower.name (u/lower-case-en actual-name)))))

(defn- find-pa-field
  "Returns the Field record for the given table-id and field name (case-insensitive)."
  [table-id field-name]
  (t2/select-one :model/Field
                 :table_id    table-id
                 :%lower.name (u/lower-case-en field-name)))

;;; ---- Dashboard helper ----

(defn- add-dashboard-cards!
  "Inserts DashboardCard rows for `card-positions` into the dashboard identified by `dash-entity-id`.
   Each card is only added once (idempotent). `card-positions` is a seq of maps with keys:
   :entity-id, :row, :col, :size-x, :size-y."
  [dash-entity-id card-positions]
  (when-let [dash-id (t2/select-one-pk :model/Dashboard :entity_id dash-entity-id)]
    (doseq [{:keys [entity-id row col size-x size-y]} card-positions]
      (when-let [card-id (t2/select-one-pk :model/Card :entity_id entity-id)]
        (when-not (t2/select-one :model/DashboardCard :dashboard_id dash-id :card_id card-id)
          (t2/insert! :model/DashboardCard
                      {:dashboard_id           dash-id
                       :card_id                card-id
                       :row                    row
                       :col                    col
                       :size_x                 size-x
                       :size_y                 size-y
                       :parameter_mappings     []
                       :visualization_settings {}}))))))

;;; ---- Default cards ----

(defn- ensure-user-flows-card!
  "Creates the default User Flows question (Sankey visualization) in the PA collection
   if it does not already exist. Safe to call on every startup."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id user-flows-card-entity-id)
    (when-let [flows-table (t2/select-one :model/Table :db_id pa/product-analytics-db-id :name "V_PA_USER_FLOWS")]
      (log/info "Creating default User Flows question...")
      (t2/insert! :model/Card
                  {:entity_id              user-flows-card-entity-id
                   :name                   "User Flows"
                   :description            "Visualize navigation paths through your product."
                   :display                "sankey"
                   :collection_id          collection-id
                   :creator_id             creator-id
                   :dataset_query          {:database pa/product-analytics-db-id
                                            :type     "query"
                                            :query    {:source-table (:id flows-table)}}
                   :visualization_settings {:sankey.source           "SOURCE"
                                            :sankey.target           "TARGET"
                                            :sankey.value            "VALUE"
                                            :sankey.edge_color       "source"
                                            :sankey.node_align       "left"
                                            :sankey.show_edge_labels true}}))))

(defn- ensure-page-views-card!
  "Creates a daily page views line chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id page-views-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [created-at (find-pa-field (:id events-table) "created_at")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default Page Views question...")
          (t2/insert! :model/Card
                      {:entity_id              page-views-card-entity-id
                       :name                   "Page Views"
                       :description            "Daily page views over time."
                       :display                "line"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:= [:field (:id event-type) nil] 1]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id created-at) {:temporal-unit :day}]]}}
                       :visualization_settings {}}))))))

(defn- ensure-active-users-card!
  "Creates a daily active users (unique sessions) line chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id active-users-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [created-at (find-pa-field (:id events-table) "created_at")]
        (when-let [session-id (find-pa-field (:id events-table) "session_id")]
          (when-let [event-type (find-pa-field (:id events-table) "event_type")]
            (log/info "Creating default Active Users question...")
            (t2/insert! :model/Card
                        {:entity_id              active-users-card-entity-id
                         :name                   "Active Users"
                         :description            "Daily unique users (sessions) over time."
                         :display                "line"
                         :collection_id          collection-id
                         :creator_id             creator-id
                         :dataset_query          {:database pa/product-analytics-db-id
                                                  :type     "query"
                                                  :query    {:source-table (:id events-table)
                                                             :filter       [:= [:field (:id event-type) nil] 1]
                                                             :aggregation  [[:distinct [:field (:id session-id) nil]]]
                                                             :breakout     [[:field (:id created-at) {:temporal-unit :day}]]}}
                         :visualization_settings {}})))))))

(defn- ensure-top-pages-card!
  "Creates a top pages table question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id top-pages-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [url-path (find-pa-field (:id events-table) "url_path")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default Top Pages question...")
          (t2/insert! :model/Card
                      {:entity_id              top-pages-card-entity-id
                       :name                   "Top Pages"
                       :description            "Most visited pages, by pageview count."
                       :display                "table"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:= [:field (:id event-type) nil] 1]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id url-path) nil]]
                                                           :order-by     [[:desc [:aggregation 0]]]
                                                           :limit        10}}
                       :visualization_settings {}}))))))

(defn- ensure-traffic-sources-card!
  "Creates a traffic sources by UTM source bar chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id traffic-sources-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [utm-source (find-pa-field (:id events-table) "utm_source")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default Traffic Sources question...")
          (t2/insert! :model/Card
                      {:entity_id              traffic-sources-card-entity-id
                       :name                   "Traffic Sources"
                       :description            "Page views by UTM source."
                       :display                "bar"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:and
                                                                          [:= [:field (:id event-type) nil] 1]
                                                                          [:not-null [:field (:id utm-source) nil]]]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id utm-source) nil]]
                                                           :order-by     [[:desc [:aggregation 0]]]
                                                           :limit        10}}
                       :visualization_settings {}}))))))

(defn- ensure-device-types-card!
  "Creates a device type breakdown pie chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id device-types-card-entity-id)
    (when-let [sessions-table (find-pa-table "sessions")]
      (when-let [device (find-pa-field (:id sessions-table) "device")]
        (log/info "Creating default Device Types question...")
        (t2/insert! :model/Card
                    {:entity_id              device-types-card-entity-id
                     :name                   "Device Types"
                     :description            "Sessions by device type."
                     :display                "pie"
                     :collection_id          collection-id
                     :creator_id             creator-id
                     :dataset_query          {:database pa/product-analytics-db-id
                                              :type     "query"
                                              :query    {:source-table (:id sessions-table)
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field (:id device) nil]]
                                                         :order-by     [[:desc [:aggregation 0]]]}}
                     :visualization_settings {}})))))

(defn- ensure-utm-medium-card!
  "Creates a UTM medium breakdown bar chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id utm-medium-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [utm-medium (find-pa-field (:id events-table) "utm_medium")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default UTM Medium question...")
          (t2/insert! :model/Card
                      {:entity_id              utm-medium-card-entity-id
                       :name                   "UTM Medium"
                       :description            "Page views by UTM medium."
                       :display                "bar"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:and
                                                                          [:= [:field (:id event-type) nil] 1]
                                                                          [:not-null [:field (:id utm-medium) nil]]]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id utm-medium) nil]]
                                                           :order-by     [[:desc [:aggregation 0]]]
                                                           :limit        10}}
                       :visualization_settings {}}))))))

(defn- ensure-utm-campaign-card!
  "Creates a UTM campaign breakdown table question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id utm-campaign-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [utm-campaign (find-pa-field (:id events-table) "utm_campaign")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default UTM Campaign question...")
          (t2/insert! :model/Card
                      {:entity_id              utm-campaign-card-entity-id
                       :name                   "UTM Campaigns"
                       :description            "Page views by UTM campaign."
                       :display                "table"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:and
                                                                          [:= [:field (:id event-type) nil] 1]
                                                                          [:not-null [:field (:id utm-campaign) nil]]]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id utm-campaign) nil]]
                                                           :order-by     [[:desc [:aggregation 0]]]
                                                           :limit        20}}
                       :visualization_settings {}}))))))

(defn- ensure-referrer-domains-card!
  "Creates a referrer domain bar chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id referrer-domains-card-entity-id)
    (when-let [events-table (find-pa-table "events")]
      (when-let [referrer-domain (find-pa-field (:id events-table) "referrer_domain")]
        (when-let [event-type (find-pa-field (:id events-table) "event_type")]
          (log/info "Creating default Referrer Domains question...")
          (t2/insert! :model/Card
                      {:entity_id              referrer-domains-card-entity-id
                       :name                   "Referrer Domains"
                       :description            "Page views by referring domain."
                       :display                "bar"
                       :collection_id          collection-id
                       :creator_id             creator-id
                       :dataset_query          {:database pa/product-analytics-db-id
                                                :type     "query"
                                                :query    {:source-table (:id events-table)
                                                           :filter       [:and
                                                                          [:= [:field (:id event-type) nil] 1]
                                                                          [:not-null [:field (:id referrer-domain) nil]]]
                                                           :aggregation  [[:count]]
                                                           :breakout     [[:field (:id referrer-domain) nil]]
                                                           :order-by     [[:desc [:aggregation 0]]]
                                                           :limit        10}}
                       :visualization_settings {}}))))))

(defn- ensure-sessions-by-country-card!
  "Creates a sessions by country map question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id sessions-by-country-card-entity-id)
    (when-let [sessions-table (find-pa-table "sessions")]
      (when-let [country (find-pa-field (:id sessions-table) "country")]
        (log/info "Creating default Sessions by Country question...")
        (t2/insert! :model/Card
                    {:entity_id              sessions-by-country-card-entity-id
                     :name                   "Sessions by Country"
                     :description            "Session count by country."
                     :display                "map"
                     :collection_id          collection-id
                     :creator_id             creator-id
                     :dataset_query          {:database pa/product-analytics-db-id
                                              :type     "query"
                                              :query    {:source-table (:id sessions-table)
                                                         :filter       [:not-null [:field (:id country) nil]]
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field (:id country) nil]]}}
                     :visualization_settings {:map.type   "region"
                                              :map.region "world_countries"}})))))

(defn- ensure-sessions-by-browser-card!
  "Creates a sessions by browser pie chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id sessions-by-browser-card-entity-id)
    (when-let [sessions-table (find-pa-table "sessions")]
      (when-let [browser (find-pa-field (:id sessions-table) "browser")]
        (log/info "Creating default Sessions by Browser question...")
        (t2/insert! :model/Card
                    {:entity_id              sessions-by-browser-card-entity-id
                     :name                   "Sessions by Browser"
                     :description            "Sessions broken down by web browser."
                     :display                "pie"
                     :collection_id          collection-id
                     :creator_id             creator-id
                     :dataset_query          {:database pa/product-analytics-db-id
                                              :type     "query"
                                              :query    {:source-table (:id sessions-table)
                                                         :filter       [:not-null [:field (:id browser) nil]]
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field (:id browser) nil]]
                                                         :order-by     [[:desc [:aggregation 0]]]}}
                     :visualization_settings {}})))))

(defn- ensure-sessions-by-os-card!
  "Creates a sessions by OS pie chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id sessions-by-os-card-entity-id)
    (when-let [sessions-table (find-pa-table "sessions")]
      (when-let [os (find-pa-field (:id sessions-table) "os")]
        (log/info "Creating default Sessions by OS question...")
        (t2/insert! :model/Card
                    {:entity_id              sessions-by-os-card-entity-id
                     :name                   "Sessions by OS"
                     :description            "Sessions broken down by operating system."
                     :display                "pie"
                     :collection_id          collection-id
                     :creator_id             creator-id
                     :dataset_query          {:database pa/product-analytics-db-id
                                              :type     "query"
                                              :query    {:source-table (:id sessions-table)
                                                         :filter       [:not-null [:field (:id os) nil]]
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field (:id os) nil]]
                                                         :order-by     [[:desc [:aggregation 0]]]}}
                     :visualization_settings {}})))))

(defn- ensure-sessions-by-language-card!
  "Creates a sessions by language bar chart question if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Card :entity_id sessions-by-language-card-entity-id)
    (when-let [sessions-table (find-pa-table "sessions")]
      (when-let [language (find-pa-field (:id sessions-table) "language")]
        (log/info "Creating default Sessions by Language question...")
        (t2/insert! :model/Card
                    {:entity_id              sessions-by-language-card-entity-id
                     :name                   "Sessions by Language"
                     :description            "Sessions broken down by browser language."
                     :display                "bar"
                     :collection_id          collection-id
                     :creator_id             creator-id
                     :dataset_query          {:database pa/product-analytics-db-id
                                              :type     "query"
                                              :query    {:source-table (:id sessions-table)
                                                         :filter       [:not-null [:field (:id language) nil]]
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field (:id language) nil]]
                                                         :order-by     [[:desc [:aggregation 0]]]
                                                         :limit        10}}
                     :visualization_settings {}})))))

;;; ---- Dashboards ----

(defn- ensure-overview-dashboard!
  "Creates the Product Overview dashboard if it does not already exist and populates it
   with all default PA questions. Safe to call on every startup — each card is only added once."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Dashboard :entity_id overview-dashboard-entity-id)
    (log/info "Creating default Product Overview dashboard...")
    (t2/insert! :model/Dashboard
                {:entity_id     overview-dashboard-entity-id
                 :name          "Product Overview"
                 :description   "Key product analytics metrics at a glance."
                 :collection_id collection-id
                 :creator_id    creator-id}))
  (add-dashboard-cards!
   overview-dashboard-entity-id
   [{:entity-id page-views-card-entity-id      :row 0  :col 0  :size-x 12 :size-y 4}
    {:entity-id active-users-card-entity-id    :row 0  :col 12 :size-x 12 :size-y 4}
    {:entity-id top-pages-card-entity-id       :row 4  :col 0  :size-x 12 :size-y 8}
    {:entity-id device-types-card-entity-id    :row 4  :col 12 :size-x 12 :size-y 8}
    {:entity-id traffic-sources-card-entity-id :row 12 :col 0  :size-x 24 :size-y 6}
    {:entity-id user-flows-card-entity-id      :row 18 :col 0  :size-x 24 :size-y 10}]))

(defn- ensure-acquisition-dashboard!
  "Creates the Acquisition dashboard (where users come from) if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Dashboard :entity_id acquisition-dashboard-entity-id)
    (log/info "Creating default Acquisition dashboard...")
    (t2/insert! :model/Dashboard
                {:entity_id     acquisition-dashboard-entity-id
                 :name          "Acquisition"
                 :description   "Understand where your users are coming from."
                 :collection_id collection-id
                 :creator_id    creator-id}))
  (add-dashboard-cards!
   acquisition-dashboard-entity-id
   [{:entity-id traffic-sources-card-entity-id    :row 0  :col 0  :size-x 12 :size-y 6}
    {:entity-id referrer-domains-card-entity-id   :row 0  :col 12 :size-x 12 :size-y 6}
    {:entity-id utm-medium-card-entity-id         :row 6  :col 0  :size-x 12 :size-y 6}
    {:entity-id utm-campaign-card-entity-id       :row 6  :col 12 :size-x 12 :size-y 6}
    {:entity-id sessions-by-country-card-entity-id :row 12 :col 0  :size-x 24 :size-y 10}]))

(defn- ensure-audience-dashboard!
  "Creates the Audience dashboard (who your users are) if it does not already exist."
  [collection-id creator-id]
  (when-not (t2/select-one :model/Dashboard :entity_id audience-dashboard-entity-id)
    (log/info "Creating default Audience dashboard...")
    (t2/insert! :model/Dashboard
                {:entity_id     audience-dashboard-entity-id
                 :name          "Audience"
                 :description   "Understand who your users are."
                 :collection_id collection-id
                 :creator_id    creator-id}))
  (add-dashboard-cards!
   audience-dashboard-entity-id
   [{:entity-id active-users-card-entity-id       :row 0  :col 0  :size-x 24 :size-y 4}
    {:entity-id device-types-card-entity-id       :row 4  :col 0  :size-x 8  :size-y 6}
    {:entity-id sessions-by-browser-card-entity-id :row 4  :col 8  :size-x 8  :size-y 6}
    {:entity-id sessions-by-os-card-entity-id     :row 4  :col 16 :size-x 8  :size-y 6}
    {:entity-id sessions-by-country-card-entity-id :row 10 :col 0  :size-x 14 :size-y 8}
    {:entity-id sessions-by-language-card-entity-id :row 10 :col 14 :size-x 10 :size-y 8}]))

;;; ---- Orchestrator ----

(defn- ensure-default-content!
  "Creates all default questions and dashboards in the PA collection.
   Each sub-function is idempotent — safe to call on every startup."
  []
  (when-let [collection (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id)]
    (when-let [creator-id (t2/select-one-pk :model/User :is_superuser true {:order-by [[:id :asc]]})]
      (let [coll-id (:id collection)]
        ;; Cards (order matters — dashboards reference these by entity-id)
        (ensure-user-flows-card! coll-id creator-id)
        (ensure-page-views-card! coll-id creator-id)
        (ensure-active-users-card! coll-id creator-id)
        (ensure-top-pages-card! coll-id creator-id)
        (ensure-traffic-sources-card! coll-id creator-id)
        (ensure-device-types-card! coll-id creator-id)
        (ensure-utm-medium-card! coll-id creator-id)
        (ensure-utm-campaign-card! coll-id creator-id)
        (ensure-referrer-domains-card! coll-id creator-id)
        (ensure-sessions-by-country-card! coll-id creator-id)
        (ensure-sessions-by-browser-card! coll-id creator-id)
        (ensure-sessions-by-os-card! coll-id creator-id)
        (ensure-sessions-by-language-card! coll-id creator-id)
        ;; Dashboards
        (ensure-overview-dashboard! coll-id creator-id)
        (ensure-acquisition-dashboard! coll-id creator-id)
        (ensure-audience-dashboard! coll-id creator-id)))))

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
                        (ensure-default-content!)
                        (log/info "Product Analytics Database sync complete."))]
      (when config/is-test?
        @sync-future))))

;;; ------------------------------------------------- Event Handlers -------------------------------------------------

;; When the first admin is created during initial setup, the sync future may have already completed
;; with no creator available. This handler ensures the default content is created as soon as a user exists.
(derive :event/user-joined ::pa-user-joined)

(methodical/defmethod events/publish-event! ::pa-user-joined
  [_topic _event]
  (ensure-default-content!))

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
                   (ensure-default-content!)
                   ::no-op)))))
