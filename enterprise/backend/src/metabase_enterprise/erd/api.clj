(ns metabase-enterprise.erd.api
  (:require
   [metabase-enterprise.erd.impl :as impl]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(api.macros/defendpoint :get "/" :- ::impl/erd-response
  "Return an Entity Relationship Diagram (ERD) for tables and their FK relationships.
  When `table-ids` is provided, those tables are the focal points (and must belong to `database-id`)."
  [_route-params
   {:keys [database-id table-ids schema] :as query-params} :- ::impl/erd-request]
  (impl/erd {:database-id      database-id
             :table-ids        table-ids
             :schema           schema
             :schema-selected? (contains? query-params :schema)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/erd` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
