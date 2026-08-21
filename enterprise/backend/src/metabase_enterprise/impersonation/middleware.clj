(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.interface :as qp.i]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defenterprise apply-impersonation
  "Pre-processing middleware. Validates that native queries on impersonated databases are single SELECT statements,
  and adds an impersonation role key to the query for non-admin users. Currently used solely for caching."
  ;; run this even when the `:advanced-permissions` feature is not enabled, so that we can assert that it *is* enabled
  ;; if impersonation is configured. (Throwing here is better than silently ignoring the configured impersonation.)
  :feature :none
  [query]
  (if qp.i/*skip-middleware-because-app-db-access*
    query
    (let [database              (lib.metadata/database (qp.store/metadata-provider))
          impersonation-enabled? (impersonation.driver/impersonation-enabled-for-db? database)
          role                  (impersonation.driver/connection-impersonation-role database)]
      (cond-> query
        ;; Validate for ALL users if impersonation is configured on this DB
        impersonation-enabled?
        (as-> q
              (do (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions"))
                  (driver/validate-impersonated-query driver/*driver* q)))
        ;; Only assign the role for non-admin impersonated users
        role
        (assoc :impersonation/role role)))))

(defenterprise apply-impersonation-postprocessing
  "Post-processing middleware. Binds the impersonation role dynamic var for driver use."
  ;; run this even when the `:advanced-permissions` feature is not enabled, so that we can assert that it *is* enabled
  ;; if impersonation is configured. (Throwing here is better than silently ignoring the configured impersonation.)
  :feature :none
  [qp]
  (fn [query rff]
    (if-let [role (:impersonation/role query)]
      (do
        (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions"))
        (binding [impersonation.driver/*impersonation-role* role]
          (qp query rff)))
      (qp query rff))))

(defenterprise currently-impersonated?
  "True when a connection-impersonation role is bound for the current query."
  :feature :none
  []
  (some? impersonation.driver/*impersonation-role*))
