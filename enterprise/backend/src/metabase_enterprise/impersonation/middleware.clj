(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.interface :as qp.i]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defenterprise remove-impersonation-keys
  "Pre-processing middleware. Removes the `:impersonation/*` keys [[apply-impersonation]] sets on the query once it has
  worked out which database role the query should run under.

  They are ordinary namespaced keywords on the top-level query, so they ride in from the JSON request body untouched:
  `:impersonation/role` let a non-admin choose the database role their query runs as, overriding the configured one,
  and `:impersonation/admin?` let them past the check restricting an impersonated native query to a single statement
  of the expected type. Both are only ever set below, further down preprocessing, so nothing legitimate arrives
  carrying them. `:impersonation/allow-write?` is no longer read anywhere -- it is a binding now,
  see [[metabase.driver.settings/*impersonation-allow-write?*]] -- and is dropped so it cannot come back to life.

  Lives here, next to the only code that sets these keys, so the two can't drift apart. `:feature :none` so that
  stripping never depends on the token: a key the user should not be able to set is not something to start honouring
  because a licence lapsed."
  :feature :none
  [query]
  (dissoc query :impersonation/role :impersonation/admin? :impersonation/allow-write?))

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
                  (driver/validate-impersonated-query
                   driver/*driver*
                   (cond-> q api/*is-superuser?* (assoc :impersonation/admin? true)))))
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
