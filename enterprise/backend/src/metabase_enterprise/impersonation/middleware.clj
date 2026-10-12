(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.interface :as qp.i]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defn- assert-native-validation-supported
  "`driver/validate-impersonated-query` is what enforces that an impersonated native query is a single
  statement of the allowed type. Every sql-jdbc driver supplies that enforcement via the `:sql` method; a
  driver that does not descend from `:sql` resolves to the `:default` no-op, which cannot say anything
  about the native SQL. Rather than run it unchecked, refuse native queries on such a driver. MBQL stages
  are compiler-generated, so they pass through — only native SQL is checked."
  [driver query]
  (when (and (lib/any-native-stage? query)
             (= (get-method driver/validate-impersonated-query driver)
                (get-method driver/validate-impersonated-query :default)))
    (throw (ex-info (tru "Connection impersonation does not support native queries on this database.")
                    {:type qp.error-type/invalid-query}))))

(defn- validate-impersonated-query
  "Enforce the single-statement rule on `query` for `driver`.

  Only drivers that advertise `:connection-impersonation` ever switch roles on a connection
  (see [[metabase-enterprise.impersonation.driver/set-role-if-supported!]], which is gated on the same check). On
  any other driver every user runs as the full connection user whether or not a policy is configured, so the
  policy does not change which role a query runs under and validating its native SQL changes nothing — the same
  reasoning that exempts admins. Those drivers (H2, for one) also tend to have no SQL dialect the validator can
  parse, so validating there would refuse every non-admin native query for nothing."
  [driver database query]
  (if (driver.u/supports? driver :connection-impersonation database)
    (do (assert-native-validation-supported driver query)
        (driver/validate-impersonated-query
         driver
         (cond-> query api/*is-superuser?* (assoc :impersonation/admin? true))))
    query))

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
                  (validate-impersonated-query driver/*driver* database q)))
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
