(ns metabase.api-routes.routes
  "Security-lint test example: the mount table. What is wrapped in +auth here, or reaches +auth through a var,
  is authenticated; what is mounted bare is not."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   metabase.things.internal-api))

(defn- +auth [handler]
  (routes.common/+auth (if (simple-symbol? handler) (api.macros/ns-handler handler) handler)))

(def ^:private route-map
  {"/things"   (+auth 'metabase.things.api)
   "/internal" metabase.things.internal-api/routes
   "/notify"   (+auth 'metabase.notify.payload)
   "/xml"      (+auth 'metabase.xml.parse)
   "/public"   (routes.common/+public-exceptions 'metabase.public-sharing-rest.api)
   "/embed"    (routes.common/+message-only-exceptions 'metabase.embedding-rest.api.embed)
   "/mt/gtap"  metabase.sandbox.api.gtap/routes})
