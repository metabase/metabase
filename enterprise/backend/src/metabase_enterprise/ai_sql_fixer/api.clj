(ns metabase-enterprise.ai-sql-fixer.api
  "`/api/ee/ai-sql-fixer/` routes"
  (:require
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post "/fix"
  "Suggest fixes for a SQL query."
  [_route-params
   _query-params
   {:keys [query error_message]} :- [:map
                                     [:query [:map
                                              [:database ms/PositiveInt]]]
                                     [:error_message :string]]]
  (binding [persisted-info/*allow-persisted-substitution* false]
    (qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [sql    (-> query :native :query)
          driver (driver.u/database->driver (:database query))]
      (-> (metabot-v3.client/fix-sql {:sql sql
                                      :dialect driver
                                      :error_message error_message
                                      :schema_ddl ""})
          (select-keys [:fixes])))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-fixer` routes."
  (api.macros/ns-handler *ns* +auth))
