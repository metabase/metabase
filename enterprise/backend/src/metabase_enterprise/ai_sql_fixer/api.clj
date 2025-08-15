(ns metabase-enterprise.ai-sql-fixer.api
  "`/api/ee/ai-sql-fixer/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/fix"
  "Suggest fixes for a SQL query."
  [_route-params
   _query-params
   {:keys [query error_message]} :- [:map
                                     [:query [:map
                                              [:database ms/PositiveInt]]]
                                     [:error_message :string]]]
  (qp.perms/check-current-user-has-adhoc-native-query-perms query)
  (let [driver (-> query :database driver.u/database->driver)]
    (-> (metabot-v3/fix-sql {:sql (-> query :native :query)
                             :dialect driver
                             :error_message error_message
                             :schema_ddl (metabot-v3/schema-sample query)})
        (select-keys [:fixes]))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-fixer` routes."
  (api.macros/ns-handler *ns* +auth))
