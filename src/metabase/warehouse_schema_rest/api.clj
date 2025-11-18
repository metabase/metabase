(ns metabase.warehouse-schema-rest.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.warehouse-schema-rest.api.field]
   [metabase.warehouse-schema-rest.api.table]))

(comment metabase.warehouse-schema-rest.api.field/keep-me
         metabase.warehouse-schema-rest.api.table/keep-me)

(def ^{:arglists '([request respond raise])} field-routes
  "`/api/field` routes."
  (api.macros/ns-handler 'metabase.warehouse-schema-rest.api.field))

(def ^{:arglists '([request respond raise])} table-routes
  "`/api/table` routes."
  (api.macros/ns-handler 'metabase.warehouse-schema-rest.api.table))
