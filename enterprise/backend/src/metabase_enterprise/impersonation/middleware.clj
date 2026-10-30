(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.impersonation.query-cache :as query-cache]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor.interface :as qp.i]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn- validate-native-stage :- ::lib.schema/stage.native
  "Validate the native `stage` of `query` for `driver` on its own, through the impersonation query cache."
  [driver :- :keyword
   query  :- ::lib.schema/query
   stage  :- ::lib.schema/stage.native]
  (let [admin? api/*is-superuser?*]
    (assoc stage :native
           (query-cache/validated-query
            driver
            driver.settings/*impersonation-allow-write?*
            admin?
            (:native stage)
            #(-> (driver/validate-impersonated-query
                  driver
                  (cond-> (assoc query :stages [stage]) admin? (assoc :impersonation/admin? true)))
                 :stages
                 first
                 :native)))))

(defn- validate-impersonated-query
  "Enforce the single-statement rule on every native stage of `query` for `driver`."
  [driver query]
  (update query :stages (fn [stages]
                          (mapv (fn [stage]
                                  (if (lib/native-stage? stage)
                                    (validate-native-stage driver query stage)
                                    stage))
                                stages))))

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
                  (validate-impersonated-query driver/*driver* q)))
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
