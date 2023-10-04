(ns metabase-enterprise.sandbox.api.routes
  "API routes that are only enabled if we have a premium token with the `:sandboxes` feature."
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.sandbox.api.gtap :as gtap]
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.api.user :as user]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [deferred-tru]]))

(compojure/defroutes ^{:doc "Ring routes for mt API endpoints."} routes
  ;; EE-only sandboxing routes live under `/mt` for historical reasons. `/mt` is for multi-tenant.
  ;;
  ;; TODO - We should change this to `/sandboxes` or something like that.
  (compojure/context
   "/mt" []
   (ee.api.common/+require-premium-feature
    :sandboxes
    (deferred-tru "Sandboxes")
    (compojure/routes
     (compojure/context "/gtap" [] (+auth gtap/routes))
     (compojure/context "/user" [] (+auth user/routes)))))
  ;; when sandboxing is enabled we *replace* GET /api/table/:id/query_metadata with a special EE version. If
  ;; sandboxing is not enabled, this passes thru to the OSS implementation of the endpoint.
  #_{:clj-kondo/ignore [:deprecated-var]}
  (compojure/context "/table" [] (ee.api.common/+when-premium-feature :sandboxes (+auth table/routes))))
