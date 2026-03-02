(ns metabase-enterprise.product-analytics.settings
  "Computed settings surfaced to the frontend for Product Analytics."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.product-analytics.core :as pa]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- iceberg-query-engine?
  "Returns true when the PA database engine differs from the app-db type,
   indicating it's configured to use an external query engine (e.g. Starburst)."
  []
  (let [pa-db (t2/select-one [:model/Database :engine] :id pa/product-analytics-db-id)]
    (and pa-db
         (not= (keyword (:engine pa-db)) (mdb/db-type)))))

(defn- pa-table-id
  "Look up the Metabase internal ID for a Product Analytics table by name.
   Uses case-insensitive matching to handle H2 (uppercase) vs Postgres (lowercase)."
  [table-name]
  (t2/select-one-pk :model/Table
                    :db_id       pa/product-analytics-db-id
                    :%lower.name (u/lower-case-en table-name)
                    :active      true))

(defsetting product-analytics-events-table-id
  (deferred-tru "The Metabase internal ID of the events table, used by the frontend to build the automagic dashboard URL.")
  :type       :integer
  :visibility :public
  :setter     :none
  :export?    false
  :getter     (fn [] (pa-table-id (if (iceberg-query-engine?) "pa_events" "product_analytics_event"))))

(defsetting product-analytics-sessions-table-id
  (deferred-tru "The Metabase internal ID of the sessions table, used by the frontend to build the automagic dashboard URL.")
  :type       :integer
  :visibility :public
  :setter     :none
  :export?    false
  :getter     (fn [] (pa-table-id (if (iceberg-query-engine?) "pa_sessions" "product_analytics_session"))))
