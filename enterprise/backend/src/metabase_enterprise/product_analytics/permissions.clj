(ns metabase-enterprise.product-analytics.permissions
  "Permission enforcement for the Product Analytics virtual database.
   Follows the same pattern as `metabase-enterprise.audit-app.permissions`."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.product-analytics.core :as pa]
   [metabase.query-permissions.core :as query-perms]
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(def pa-view-names
  "Allowlist of table names for Product Analytics queries.
   Includes both app-db (PRODUCT_ANALYTICS_*) and iceberg (PA_*) names, compared uppercase."
  #{"PRODUCT_ANALYTICS_SITE" "PRODUCT_ANALYTICS_SESSION" "PRODUCT_ANALYTICS_EVENT"
    "PRODUCT_ANALYTICS_EVENT_DATA" "PRODUCT_ANALYTICS_SESSION_DATA"
    "PA_SITES" "PA_SESSIONS" "PA_EVENTS" "PA_SESSION_DATA" "V_PA_USER_FLOWS"})

(defn- pa-collection
  "Returns the Product Analytics collection."
  []
  (t2/select-one :model/Collection :entity_id pa/product-analytics-collection-entity-id))

(defenterprise check-product-analytics-db-permissions
  "Checks that the current user has permission to query the Product Analytics database.
   Rejects native queries and queries to non-PA views."
  :feature :product-analytics
  [{query-type :type, database-id :database, query :query :as outer-query}]
  (when-not (mi/can-read? (pa-collection))
    (throw (ex-info (tru "You do not have access to the product analytics database") outer-query)))
  (when (= query-type :native)
    (throw (ex-info (tru "Native queries are not allowed on the product analytics database")
                    outer-query)))
  (let [{:keys [table-ids native?]} (query-perms/query->source-ids query)]
    (when native?
      (throw (ex-info (tru "Native queries are not allowed on the product analytics database")
                      outer-query)))
    (qp.store/with-metadata-provider database-id
      (doseq [table-id table-ids]
        (when-not (pa-view-names
                   (u/upper-case-en (:name (lib.metadata/table (qp.store/metadata-provider) table-id))))
          (throw (ex-info (tru "Product analytics queries are only allowed on product analytics views")
                          outer-query)))))))
