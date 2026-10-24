(ns metabase.data-apps.guards
  "The rules the data-app route guards hold a data app's requests to, the resources of its own app, which refuse every
  request without the data-apps feature."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- unavailable
  "The error refusing a data-app request where data apps aren't available."
  []
  (ex-info (tru "Data apps aren''t available on this instance.") {:status-code 403}))

(defenterprise check-query!
  "Throws a 403 unless the data app of `request` may run `query`, a legacy or MBQL 5 query map."
  metabase-enterprise.data-apps.guards
  [_request _query]
  (throw (unavailable)))

(defenterprise check-card!
  "Throws a 403 unless the data app of `request` may read and run the card with `card-id`, an ID or an entity ID."
  metabase-enterprise.data-apps.guards
  [_request _card-id]
  (throw (unavailable)))

(defenterprise check-table!
  "Throws a 403 unless the data app of `request` may read the metadata of the table with `table-id`."
  metabase-enterprise.data-apps.guards
  [_request _table-id]
  (throw (unavailable)))

(defenterprise check-field!
  "Throws a 403 unless the data app of `request` may read the metadata of the field with `field-id`."
  metabase-enterprise.data-apps.guards
  [_request _field-id]
  (throw (unavailable)))

(defenterprise check-database!
  "Throws a 403 unless the data app of `request` may read the metadata of the database with `database-id`."
  metabase-enterprise.data-apps.guards
  [_request _database-id]
  (throw (unavailable)))

(defenterprise databases-filter
  "The function that drops from a list of databases what the data app of `request` may not see."
  metabase-enterprise.data-apps.guards
  [_request]
  (throw (unavailable)))

(defenterprise search-filter
  "The function that drops from search results what the data app of `request` may not see."
  metabase-enterprise.data-apps.guards
  [_request]
  (throw (unavailable)))

(defenterprise check-collection!
  "Throws a 403 unless the data app of `request` may list the items of the collection with `collection-id`."
  metabase-enterprise.data-apps.guards
  [_request _collection-id]
  (throw (unavailable)))

(defenterprise collection-tree-filter
  "The function that drops from a collection tree what the data app of `request` may not see."
  metabase-enterprise.data-apps.guards
  [_request]
  (throw (unavailable)))

(defenterprise collection-items-filter
  "The function that drops from a list of collection items what the data app of `request` may not see."
  metabase-enterprise.data-apps.guards
  [_request]
  (throw (unavailable)))
