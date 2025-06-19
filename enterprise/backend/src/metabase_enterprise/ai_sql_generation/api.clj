(ns metabase-enterprise.ai-sql-generation.api
  "`/api/ee/ai-sql-generation/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/generate"
  "Generate a SQL query."
  [_route-params
   _query-params
   {:keys [prompt database_id]} :- [:map
                                    [:prompt ms/NonBlankString]
                                    [:database_id ms/PositiveInt]]]
  (-> (metabot-v3/generate-sql {:dialect (driver.u/database->driver database_id)
                                :instructions prompt
                                :tables (metabot-v3/database-tables database_id)})
      (select-keys [:generated_sql])))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-generation` routes."
  (api.macros/ns-handler *ns* +auth))
