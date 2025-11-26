(ns metabase-enterprise.ai-sql-fixer.api
  "`/api/ee/ai-sql-fixer/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
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
  (let [driver (-> query :database driver.u/database->driver)
        normalized-query (lib-be/normalize-query query)]
    (-> (metabot-v3/fix-sql {:sql (lib/raw-native-query normalized-query)
                             :dialect driver
                             :error_message error_message
                             :schema_ddl (metabot-v3/schema-sample normalized-query)})
        (select-keys [:fixes]))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-fixer` routes."
  (api.macros/ns-handler *ns* +auth))
