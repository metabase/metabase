(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace-instance`: the workspace installed on this instance (the sidecar side of workspaces). Every route
  is superuser-only; the routes need the `:workspaces` feature."
  (:require
   [metabase-enterprise.workspaces.config-file :as ws.config-file]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.i18n :refer [tru]]))

(def ^:private TableRemapping
  [:map {:closed true}
   [:database_id     ::lib.schema.id/database]
   [:from_db         [:maybe :string]]
   [:from_schema     [:maybe :string]]
   [:from_table_name :string]
   [:to_db           [:maybe :string]]
   [:to_schema       [:maybe :string]]
   [:to_table_name   :string]
   [:created_at      :any]])

(defn- present-remapping
  "`\"\"` in a namespace column means the driver emits no identifier at that level; the API says so with null."
  [row]
  (-> (select-keys row [:database_id :from_db :from_schema :from_table_name :to_db :to_schema :to_table_name :created_at])
      (update :from_db not-empty)
      (update :from_schema not-empty)
      (update :to_db not-empty)
      (update :to_schema not-empty)))

(defn- check-not-locked! []
  (case (ws/workspace-lock)
    nil          nil
    :env-var     (throw (ex-info (tru "This instance''s workspace is set by the MB_INSTANCE_WORKSPACE env var and can''t be changed through the API.")
                                 {:status-code 400}))
    :config-file (throw (ex-info (tru "This instance''s workspace is locked by config.yml and can''t be changed through the API.")
                                 {:status-code 400}))))

(api.macros/defendpoint :get "/current" :- [:map {:closed true}
                                            [:data      [:maybe ::ws/workspace-instance]]
                                            [:can_write :boolean]]
  "The workspace installed on this instance, or null; `can_write` is false when deployment config sets it."
  []
  (api/check-superuser)
  {:data      (ws/instance-workspace)
   :can_write (not (ws/workspace-locked?))})

(api.macros/defendpoint :post "/current" :- ::ws/workspace-instance
  "Install a workspace on this instance, turning workspace mode on, or replace the installed one. Each database name
  must name exactly one database here. Remappings the new schema maps no longer back are deleted."
  [_route-params
   _query-params
   body :- ::ws/workspace-instance]
  (api/check-superuser)
  (ws/call-with-instance-workspace-lock
   (fn []
     (check-not-locked!)
     (ws/set-instance-workspace! body))))

(api.macros/defendpoint :delete "/current" :- :nil
  "Turn workspace mode off: remove the installed workspace and every remapping."
  []
  (api/check-superuser)
  (ws/call-with-instance-workspace-lock
   (fn []
     (check-not-locked!)
     (ws/clear-instance-workspace!))))

(api.macros/defendpoint :post "/config" :- [:map {:closed true}
                                           [:data      [:maybe ::ws/workspace-instance]]
                                           [:can_write :boolean]]
  "Apply `config`, the text of the config.yml a parent serves from `GET /api/ee/workspace-manager/:id/connection?format=yaml`,
  as a boot with that config.yml would: create or update its databases by name, then install its workspace and lock
  it, so `POST` and `DELETE /current` refuse to change it. A workspace a config.yml set may be replaced here; one
  `MB_INSTANCE_WORKSPACE` sets may not. Unlike at boot, `{{env ...}}` templates are not expanded, and the
  `:config-text-file` feature is not needed."
  [_route-params
   _query-params
   {:keys [config]} :- [:map {:closed true}
                        [:config [:string {:min 1}]]]]
  (api/check-superuser)
  ;; another config.yml may replace what a config.yml set, as a boot with it would
  (when (= :env-var (ws/workspace-lock))
    (check-not-locked!))
  (ws.config-file/apply-config-yml! config)
  {:data      (ws/instance-workspace)
   :can_write (not (ws/workspace-locked?))})

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Every recorded remapping of a main table to the scratch table that backs it."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/table-remapping-rows)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace-instance` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
