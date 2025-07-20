(ns metabase.warehouse-schema.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.warehouse-schema.api.field]
   [metabase.warehouse-schema.api.table]))

(comment metabase.warehouse-schema.api.field/keep-me
         metabase.warehouse-schema.api.table/keep-me)

(def ^{:arglists '([request respond raise])} field-routes
  "`/api/field` routes."
  (api.macros/ns-handler 'metabase.warehouse-schema.api.field))

(def ^{:arglists '([request respond raise])} table-routes
  "`/api/table` routes."
  (api.macros/ns-handler 'metabase.warehouse-schema.api.table))
