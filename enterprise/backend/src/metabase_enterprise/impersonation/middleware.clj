(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defenterprise remove-impersonation-keys
  "Pre-processing middleware. Removes the `:impersonation/role` key [[apply-impersonation]] sets on the query once it
  has worked out which database role the query should run under.

  It is an ordinary namespaced keyword on the top-level query, so it rides in from the JSON request body untouched:
  keywordization, the endpoint schema and MBQL normalization all leave it alone. And it is only `assoc`ed when the
  server computes a role, so when it doesn't, a caller-supplied value is simply left in place -- letting a non-admin
  choose the database role their query runs as, overriding the configured one.

  Lives here, next to the only code that sets the key, so the two can't drift apart. `:feature :none` so that
  stripping never depends on the token: a key the user should not be able to set is not something to start honouring
  because a licence lapsed."
  :feature :none
  [query]
  (dissoc query :impersonation/role))

(defenterprise apply-impersonation
  "Pre-processing middleware. Validates that native queries on impersonated databases are single SELECT statements,
  and adds an impersonation role key to the query for non-admin users. Currently used solely for caching."
  ;; run this even when the `:advanced-permissions` feature is not enabled, so that we can assert that it *is* enabled
  ;; if impersonation is configured. (Throwing here is better than silently ignoring the configured impersonation.)
  :feature :none
  [query]
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
      (assoc :impersonation/role role))))

(defenterprise apply-impersonation-postprocessing
  "Post-processing middleware. Binds the dynamic var"
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
