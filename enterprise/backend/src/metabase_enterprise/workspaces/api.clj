(ns metabase-enterprise.workspaces.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :get "/"
  "List all Workspaces."
  []
  [])

(api.macros/defendpoint :get "/:id"
  "Fetch a Workspace by id."
  [_route-params :- [:map [:id ms/PositiveInt]]]
  {:name "Workspace" :databases []})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
