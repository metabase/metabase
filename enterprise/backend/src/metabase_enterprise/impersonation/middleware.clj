(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.store :as qp.store]))

(defenterprise apply-impersonation
  "Pre-processing middleware. Adds a key to the query. Currently used solely for caching."
  :feature :advanced-permissions
  [query]
  (if-let [role (impersonation.driver/connection-impersonation-role
                 (lib.metadata/database (qp.store/metadata-provider)))]
    (assoc query :impersonation/role role)
    query))

(defenterprise apply-impersonation-postprocessing
  "Post-processing middleware. Binds the dynamic var"
  :feature :advanced-permissions
  [qp]
  (fn [query rff]
    (if-let [role (:impersonation/role query)]
      (binding [impersonation.driver/*impersonation-role* role]
        (qp query rff))
      (qp query rff))))
