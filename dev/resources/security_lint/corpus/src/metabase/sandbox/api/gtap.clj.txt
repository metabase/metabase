(ns metabase.sandbox.api.gtap
  "Security-lint test example: a namespace authorized by router middleware, which no endpoint's closure can reach."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/:id"
  "Reads a sandbox with no per-endpoint check; the namespace is wrapped in +check-superuser."
  [{:keys [id]} _query _body]
  (t2/select-one :model/Sandbox :id id))

(def routes (api.macros/ns-handler *ns* api/+check-superuser))
