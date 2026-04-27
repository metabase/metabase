(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(comment metabase-enterprise.workspaces.settings/keep-me)

(api.macros/defendpoint :get "/"
  "List all Workspaces."
  []
  [])

(api.macros/defendpoint :get "/:id"
  "Fetch a Workspace by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  {:id id :name "Workspace" :databases []})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes"
  (api.macros/ns-handler *ns* +auth))
