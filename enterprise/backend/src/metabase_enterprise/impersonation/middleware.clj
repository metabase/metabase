(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]))

(defn- validate-impersonated-native-query [query]
  (update query :stages
          (fn [stages]
            (mapv (fn [stage]
                    (if (= (:lib/type stage) :mbql.stage/native)
                      (let [{:keys [is_valid? sql]} (sql-tools/validate-impersonated-native-query driver/*driver* (:native stage))]
                        (cond
                          (true? is_valid?)  (assoc stage :native sql)
                          (nil? is_valid?)   stage
                          (false? is_valid?) (throw (ex-info (tru "Invalid impersonated native query. Must be a single select statement.")
                                                             {:sql (:native stage)}))))
                      stage))
                  stages))))

(defenterprise apply-impersonation
  "Pre-processing middleware. Adds a key to the query. Currently used solely for caching."
  ;; run this even when the `:advanced-permissions` feature is not enabled, so that we can assert that it *is* enabled
  ;; if impersonation is configured. (Throwing here is better than silently ignoring the configured impersonation.)
  :feature :none
  [query]
  (if-let [role (impersonation.driver/connection-impersonation-role
                 (lib.metadata/database (qp.store/metadata-provider)))]
    (do
      (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions"))
      (-> query
          validate-impersonated-native-query
          (assoc :impersonation/role role)))
    query))

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
