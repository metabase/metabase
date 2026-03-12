(ns metabase-enterprise.database-routing.middleware
  "MirrorDBs require two middleware to be executed. The first middleware is a pre-processing middleware that sets a key,
  `:destination-database/id`, on the query if a destination database should be used. The second middleware runs around query
  execution, and should be THE LAST middleware before we hit the database and query execution actually occurs."
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id]]
   [metabase.database-routing.core :refer [with-database-routing-on]]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defenterprise swap-destination-db
  "Must be the last middleware before we actually hit the database. If a Router Database is specified, swaps out the
   Metadata Provider for one that has the appropriate destination database."
  :feature :database-routing
  [qp]
  (fn [query rff]
    (if-let [destination-db-id (:destination-database/id query)]
      (let [current-database (lib.metadata/database (qp.store/metadata-provider))
            rff* (fn [metadata]
                   (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
                     (qp.store/with-metadata-provider (u/id current-database)
                       (rff metadata))))]
        (binding [qp.store/*DANGER-allow-replacing-metadata-provider* true]
          (qp.store/with-metadata-provider destination-db-id
            (with-database-routing-on
              (qp query rff*)))))
      (qp query rff))))

(defenterprise attach-destination-db-middleware
  "Pre-processing middleware. Calculates the destination database that should be used for this query, e.g. for caching
  purposes. Does not make any changes to the query besides (possibly) adding a `:destination-database/id` key."
  ;; run this even when the `:database-routing` feature is not enabled, so that we can assert that it *is* enabled if
  ;; DB routing is configured. (Throwing here is better than silently ignoring the configured routing.)
  :feature :none
  [query]
  (let [database (lib.metadata/database (qp.store/metadata-provider))
        destination-db-id (router-db-or-id->destination-db-id database)]
    (when destination-db-id
      (premium-features/assert-has-feature :database-routing (tru "Database Routing"))
      (when-not (driver.u/supports? (:engine (lib.metadata/database (qp.store/metadata-provider)))
                                    :database-routing
                                    database)
        (throw (ex-info "Unsupported database for database routing" {}))))
    (cond-> query
      destination-db-id (assoc :destination-database/id destination-db-id))))
