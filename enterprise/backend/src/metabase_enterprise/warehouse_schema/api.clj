(ns metabase-enterprise.warehouse-schema.api
  "API routes for warehouse schema enterprise features."
  (:require
   [metabase-enterprise.warehouse-schema.api.table]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]))

(def routes
  "Ring routes for /api/ee/table API endpoints."
  (api.routes.common/+auth (api.macros/ns-handler 'metabase-enterprise.warehouse-schema.api.table)))
