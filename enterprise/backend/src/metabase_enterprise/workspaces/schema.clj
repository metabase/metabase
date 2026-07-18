(ns metabase-enterprise.workspaces.schema
  "Malli schemas shared across the workspaces module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::workspace-status
  "Lifecycle status of a `:model/Workspace`. Deliberately kept separate from
   `::workspace-database-status` — the workspace lifecycle spans more phases
   than a single database's.

   Provisioning path (databases, then the child instance):

     unprovisioned ──► database-provisioning ──► instance-provisioning ──► provisioned
                                │                          │
                       failure  ▼                 failure  ▼
              database-provisioning-failure   instance-provisioning-failure

   Deprovisioning path (the child instance, then databases):

     provisioned ──► instance-deprovisioning ──► database-deprovisioning ──► unprovisioned
                              │                            │
                     failure  ▼                   failure  ▼
             instance-deprovisioning-failure   database-deprovisioning-failure

   `/provision` and `/deprovision` may be retried from any status; at worst they
   are no-ops."
  [:enum
   :unprovisioned
   :database-provisioning
   :database-provisioning-failure
   :instance-provisioning
   :instance-provisioning-failure
   :provisioned
   :instance-deprovisioning
   :instance-deprovisioning-failure
   :database-deprovisioning
   :database-deprovisioning-failure])

(mr/def ::workspace-database-status
  "Lifecycle status of a `:model/WorkspaceDatabase`. The `*-failure` statuses are
   terminal until the next provision/deprovision retry."
  [:enum
   :unprovisioned
   :provisioning
   :provisioning-failure
   :provisioned
   :deprovisioning
   :deprovisioning-failure])

(mr/def ::workspace
  "A `:model/Workspace` row."
  [:map
   [:id   ms/PositiveInt]
   [:name ms/NonBlankString]
   [:status         {:optional true} ::workspace-status]
   [:status_details {:optional true} [:maybe :string]]
   [:instance_id    {:optional true} [:maybe :string]]
   [:instance_url   {:optional true} [:maybe :string]]
   [:api_key        {:optional true} [:maybe :string]]])

(mr/def ::workspace-database
  "A `:model/WorkspaceDatabase` row."
  [:map
   [:id ms/PositiveInt]
   [:status {:optional true} ::workspace-database-status]])
