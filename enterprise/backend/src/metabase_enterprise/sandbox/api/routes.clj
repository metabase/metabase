(ns metabase-enterprise.sandbox.api.routes
  "API routes that are only enabled if we have a premium token with the `:sandboxes` feature."
  (:require
   [metabase-enterprise.api.core :as ee.api]
   [metabase-enterprise.sandbox.api.gtap]
   [metabase-enterprise.sandbox.api.table]
   [metabase-enterprise.sandbox.api.user]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase-enterprise.sandbox.api.table/keep-me)

(def ^:private sandbox-route-map
  {"/gtap" metabase-enterprise.sandbox.api.gtap/routes
   "/user" metabase-enterprise.sandbox.api.user/routes})

(def ^{:arglists '([request respond raise])} sandbox-routes
  "/api/mt routes.

  EE-only sandboxing routes live under `/mt` for historical reasons. `/mt` is for multi-tenant. TODO - We should
  change this to `/sandboxes` or something like that."
  (->> (handlers/route-map-handler sandbox-route-map)
       +auth
       (ee.api/+require-premium-feature :sandboxes (deferred-tru "Sandboxes"))))

(def ^{:arglists '([request respond raise])} sandbox-table-routes
  "/api/table overrides for sandboxing.

  When sandboxing is enabled we *replace* GET /api/table/:id/query_metadata with a special EE version. If sandboxing
  is not enabled, this passes thru to the OSS implementation of the endpoint."
  (->> (api.macros/ns-handler 'metabase-enterprise.sandbox.api.table)
       +auth
       #_{:clj-kondo/ignore [:deprecated-var]}
       (ee.api/+when-premium-feature :sandboxes)))
