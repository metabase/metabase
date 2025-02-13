(ns metabase.database-routing.middleware
  (:require
   [metabase.api.common :as api]
   [metabase.database-routing.core :as db-routing]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(defn apply-database-routing
  "Pre-processing middleware. Adds a key for database routing. The driver is ultimately responsible for using this, it should
  be ignored by query processing elsewhere (except, e.g. caching)."
  [query]
  (let [db-id (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
        mirror-db-id (db-routing/primary-db-or-id->router-db-id api/*current-user* db-id)]
    (cond-> query
      true (dissoc :database-routing/mirror-db-id)
      mirror-db-id (assoc :database-routing/mirror-db-id mirror-db-id))))
