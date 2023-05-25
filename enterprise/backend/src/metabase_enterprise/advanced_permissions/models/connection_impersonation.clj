(ns metabase-enterprise.advanced-permissions.models.connection-impersonation
  "Model definition for Connection Impersonations, which are used to define specific database roles used by users in
  certain permission groups when running queries."
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/ConnectionImpersonation
  (derive :metabase/model)
  ;; Only admins can work with Connection Impersonation configs
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(methodical/defmethod t2/table-name :model/ConnectionImpersonation [_model] :connection_impersonations)

(defenterprise add-impersonations-to-permissions-graph
  "Augment a provided permissions graph with active connection impersonation policies."
  :feature :advanced-permissions
  [graph]
  (m/deep-merge
   graph
   (let [impersonations (t2/select :model/ConnectionImpersonation)]
     (reduce (fn [acc {:keys [db_id group_id]}]
               (assoc-in acc [group_id db_id] {:data {:schemas :impersonated}}))
             {}
             impersonations))))

(defenterprise upsert-impersonations!
  "Create new Connection Impersonation records or update existing ones, if they have an `:id`."
  :feature :advanced-permissions
  [impersonations]
  (for [impersonation impersonations]
    (if-let [id (:id impersonation)]
      (t2/update! :model/ConnectionImpersonation id impersonation)
      (-> (t2/insert-returning-instances! :model/ConnectionImpersonation impersonation)
          first))))
