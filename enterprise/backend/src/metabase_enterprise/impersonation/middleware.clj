(ns metabase-enterprise.impersonation.middleware
  (:require
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   ;; legacy usage -- don't do things like this going forward
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]))

(defenterprise apply-impersonation
  "Pre-processing middleware. Adds a key to the query. Currently used solely for caching."
  :feature :none
  [query]
  (if-let [role (impersonation.driver/connection-impersonation-role
                 (lib.metadata/database (qp.store/metadata-provider)))]
    (do
      (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions"))
      (assoc query :impersonation/role role))
    query))

(defenterprise apply-impersonation-postprocessing
  "Post-processing middleware. Binds the dynamic var"
  :feature :none
  [qp]
  (fn [query rff]
    (if-let [role (:impersonation/role query)]
      (do
        (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions"))
        (binding [impersonation.driver/*impersonation-role* role]
          (qp query rff)))
      (qp query rff))))
