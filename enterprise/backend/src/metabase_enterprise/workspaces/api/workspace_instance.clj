(ns metabase-enterprise.workspaces.api.workspace-instance
  "EE API endpoints scoped to this (child) instance's workspace state. The
   workspace itself is exposed as the `instance-workspace` setting (read/write
   via the standard settings API and env), so this namespace only carries the
   side-state that doesn't fit in a setting — the TableRemapping rows."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.schema :as ms]))

;;; ----------------------------------------------- Schemas ----------------------------------------------------

(def ^:private TableRemapping
  [:map
   [:id              ms/PositiveInt]
   [:database_id     ::lib.schema.id/database]
   [:from_db         [:maybe :string]]
   [:from_schema     [:maybe :string]]
   [:from_table_name ms/NonBlankString]
   [:to_db           [:maybe :string]]
   [:to_schema       [:maybe :string]]
   [:to_table_name   ms/NonBlankString]
   [:created_at      :any]])

;;; -------------------------------------------- Presentation --------------------------------------------------

(defn- present-remapping [row]
  (select-keys row [:id :database_id
                    :from_db :from_schema :from_table_name
                    :to_db :to_schema :to_table_name
                    :created_at]))

;;; ---------------------------------------------- Endpoints ---------------------------------------------------

(api.macros/defendpoint :get "/table-remappings" :- [:sequential TableRemapping]
  "Return all table remappings, ordered by id."
  []
  (api/check-superuser)
  (mapv present-remapping (ws/list-remappings)))

(api.macros/defendpoint :delete "/table-remappings" :- :nil
  "Drop every `TableRemapping` row. The FE calls this before clearing the
  `instance-workspace` setting when an admin leaves a workspace, since stale
  mappings from the prior workspace would otherwise keep rewriting queries on
  databases the instance no longer manages."
  []
  (api/check-superuser)
  (ws/clear-all-remappings!)
  nil)
