(ns metabase-enterprise.database-routing.middleware
  "MirrorDBs require two middleware to be executed. The first middleware is a pre-processing middleware that sets a key,
  `:mirror-database/id`, on the query if a mirror database should be used. The second middleware runs around query
  execution, and should be THE LAST middleware before we hit the database and query execution actually occurs."
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->mirror-db-id]]
   [metabase.api.common :as api]
   [metabase.database-routing.core :refer [with-database-routing-on]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(defenterprise swap-mirror-db
  "Must be the last middleware before we actually hit the database. If a Router Database is specified, swaps out the
   Metadata Provider for one that has the appropriate mirror database."
  :feature :database-routing
  [qp]
  (fn [query rff]
    (if-let [mirror-db-id (:mirror-database/id query)]
      (let [current-database (lib.metadata/database (qp.store/metadata-provider))
            rff* (fn [metadata]
                   (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
                     (qp.store/with-metadata-provider (u/id current-database)
                       (rff metadata))))]
        (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
          (qp.store/with-metadata-provider mirror-db-id
            (with-database-routing-on
              (qp query rff*)))))
      (qp query rff))))

(defenterprise attach-mirror-db-middleware
  "Pre-processing middleware. Calculates the mirror database that should be used for this query, e.g. for caching
  purposes. Does not make any changes to the query besides (possibly) adding a `:mirror-database/id` key."
  :feature :database-routing
  [query]
  (let [database (lib.metadata/database (qp.store/metadata-provider))
        mirror-db-id (router-db-or-id->mirror-db-id @api/*current-user* database)]
    (cond-> query
      mirror-db-id (assoc :mirror-database/id mirror-db-id))))
