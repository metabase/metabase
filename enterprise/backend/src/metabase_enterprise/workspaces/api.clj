(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace-manager` endpoints. Superuser only."
  (:require
   [metabase-enterprise.workspaces.provisioning-connection :as ws.provisioning-connection]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(def ^:private NoContent
  [:map {:closed true}
   [:status [:= 204]]
   [:body :nil]])

(defn- check-workspaces-access
  []
  (api/check-superuser)
  (premium-features/assert-has-feature :workspaces (tru "Workspaces")))

(api.macros/defendpoint :get "/database/:db-id/provisioning-connection"
  :- [:map {:closed true}
      [:configured :boolean]
      [:user       {:optional true} [:maybe :string]]
      [:updated_at {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]]
  "Whether the database has a workspace provisioning connection, and if so its user and when it was saved. Never
  returns the password."
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]]
  (check-workspaces-access)
  (ws.provisioning-connection/connection-info db-id))

(api.macros/defendpoint :put "/database/:db-id/provisioning-connection" :- NoContent
  "Save the workspace provisioning connection of the database: the engine's connection fields, merged over the
  database's own, of a login that can create users and schemas. Tested before it is saved."
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]
   _query-params
   {:keys [details]} :- [:map {:closed true} [:details ms/DatabaseDetails]]]
  (check-workspaces-access)
  (ws.provisioning-connection/save! db-id details api/*current-user-id*)
  api/generic-204-no-content)

(api.macros/defendpoint :delete "/database/:db-id/provisioning-connection" :- NoContent
  "Delete the workspace provisioning connection of the database, unless workspaces exist on it."
  [{:keys [db-id]} :- [:map {:closed true} [:db-id ::lib.schema.id/database]]]
  (check-workspaces-access)
  (ws.provisioning-connection/delete! db-id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace-manager` routes."
  (api.macros/ns-handler *ns* +auth))
